-- Förberäknade artprognosrutor för zoom 5–7 (samma skäl som fuktlagret:
-- utzoomad live-beräkning kan passera anon-rollens 3 s tidsgräns).
CREATE TABLE public.prediction_tile_cache (
  species_id bigint NOT NULL,
  z smallint NOT NULL,
  x integer NOT NULL,
  y integer NOT NULL,
  obs_date date NOT NULL,
  tile bytea NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (species_id, z, x, y)
);
GRANT ALL ON public.prediction_tile_cache TO service_role;
ALTER TABLE public.prediction_tile_cache ENABLE ROW LEVEL SECURITY;

-- Beräkningen utan premiumkontroll (oförändrad logik).
CREATE OR REPLACE FUNCTION public.compute_prediction_tile(z integer, x integer, y integer, p_species_id bigint, p_date date)
RETURNS bytea
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_start date; v_end date; v_season double precision;
  v_mo double precision; v_mt double precision; v_fo double precision; v_ft double precision;
  v_as double precision; v_ap double precision; v_ab double precision;
  v_env geometry; v_env4326 geometry; v_step integer; v_tile bytea;
BEGIN
  SELECT s.season_start, s.season_end, hp.moisture_optimum, hp.moisture_tolerance, hp.forest_optimum, hp.forest_tolerance,
         hp.aff_spruce, hp.aff_pine, hp.aff_birch
    INTO v_start, v_end, v_mo, v_mt, v_fo, v_ft, v_as, v_ap, v_ab
  FROM public.species s JOIN public.species_habitat_profiles hp ON hp.species_id = s.id WHERE s.id = p_species_id;
  v_season := CASE
    WHEN v_start IS NULL OR v_end IS NULL THEN 1.0
    WHEN extract(doy from v_start) <= extract(doy from v_end) THEN
      CASE WHEN extract(doy from p_date) BETWEEN extract(doy from v_start) AND extract(doy from v_end) THEN 1.0 ELSE 0.65 END
    ELSE CASE WHEN extract(doy from p_date) >= extract(doy from v_start) OR extract(doy from p_date) <= extract(doy from v_end) THEN 1.0 ELSE 0.65 END
  END;
  v_step := CASE WHEN z <= 5 THEN 4 WHEN z = 6 THEN 3 WHEN z = 7 THEN 2 ELSE 1 END;
  v_env := ST_TileEnvelope(z, x, y);
  v_env4326 := ST_Transform(v_env, 4326);
  SELECT ST_AsMVT(t, 'predictions', 4096, 'geom') INTO v_tile FROM (
    SELECT ST_AsMVTGeom(ST_Transform(ST_Translate(ST_Centroid(sc.geom),
        (((hashtext(sc.zone_id::text || ':jx') & 65535) / 65535.0) - 0.5) * (ST_XMax(sc.geom) - ST_XMin(sc.geom)) * 0.9,
        (((hashtext(sc.zone_id::text || ':jy') & 65535) / 65535.0) - 0.5) * (ST_YMax(sc.geom) - ST_YMin(sc.geom)) * 0.9), 3857),
        v_env, 4096, 64, true) AS geom,
      sc.zone_id, sc.score, sc.moisture, p_date AS obs_date
    FROM (
      SELECT wz.id AS zone_id, wz.geom, m.moisture,
        greatest(0, least(1, (
            0.45 * exp(-power((m.moisture - v_mo) / v_mt, 2))
          + 0.30 * exp(-power((wz.forest_cover - v_fo) / v_ft, 2))
          + 0.25 * tr.fit
        ) * v_season))::double precision AS score
      FROM public.weather_zones wz
      JOIN public.weather_observations w ON w.weather_zone_id = wz.weather_sample_id AND w.obs_date = p_date
      CROSS JOIN LATERAL (SELECT (CASE WHEN wz.soil_wetness IS NULL THEN coalesce(w.moisture_score, 0)
                                  ELSE 0.6 * coalesce(w.moisture_score, 0) + 0.4 * wz.soil_wetness END)::double precision AS moisture) m
      CROSS JOIN LATERAL (SELECT CASE
          WHEN coalesce(wz.vol_spruce,0)+coalesce(wz.vol_pine,0)+coalesce(wz.vol_birch,0) < 5 THEN 0.5
          ELSE (v_as*coalesce(wz.vol_spruce,0) + v_ap*coalesce(wz.vol_pine,0) + v_ab*coalesce(wz.vol_birch,0))
               / (coalesce(wz.vol_spruce,0)+coalesce(wz.vol_pine,0)+coalesce(wz.vol_birch,0)) END::double precision AS fit) tr
      WHERE wz.is_active AND wz.geom && v_env4326
        AND (v_step = 1 OR (wz.grid_x % v_step = 0 AND wz.grid_y % v_step = 0))
    ) sc
    WHERE sc.score >= 0.20
  ) t WHERE t.geom IS NOT NULL;
  RETURN coalesce(v_tile, ''::bytea);
END;
$function$;
REVOKE ALL ON FUNCTION public.compute_prediction_tile(integer, integer, integer, bigint, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_prediction_tile(integer, integer, integer, bigint, date) TO service_role;

-- Publik funktion: premiumkontroll först, sedan cache (zoom <= 7) eller live.
CREATE OR REPLACE FUNCTION public.get_prediction_tile(z integer, x integer, y integer, p_species_id bigint, p_obs_date date DEFAULT NULL::date)
RETURNS bytea
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_tier text; v_premium boolean; v_date date; v_tile bytea;
BEGIN
  SELECT s.tier INTO v_tier FROM public.species s JOIN public.species_habitat_profiles hp ON hp.species_id = s.id WHERE s.id = p_species_id;
  IF v_tier IS NULL THEN RAISE EXCEPTION 'Okänd art'; END IF;
  IF v_tier = 'premium' THEN
    SELECT coalesce(up.is_premium, false) INTO v_premium FROM public.user_profiles up WHERE up.user_id = auth.uid();
    IF NOT coalesce(v_premium, false) THEN RAISE EXCEPTION 'PREMIUM_REQUIRED: Det här lagret ingår i premium.'; END IF;
  END IF;
  v_date := coalesce(p_obs_date, (SELECT max(w.obs_date) FROM public.weather_observations w));
  IF v_date IS NULL THEN RETURN ''::bytea; END IF;
  IF z <= 7 THEN
    SELECT c.tile INTO v_tile FROM public.prediction_tile_cache c
     WHERE c.species_id = p_species_id AND c.z = get_prediction_tile.z AND c.x = get_prediction_tile.x
       AND c.y = get_prediction_tile.y AND c.obs_date = v_date;
    IF FOUND THEN RETURN v_tile; END IF;
  END IF;
  RETURN public.compute_prediction_tile(z, x, y, p_species_id, v_date);
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_prediction_tile(p_species_id bigint, z integer, x integer, y integer, p_date date)
RETURNS integer
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE v_tile bytea;
BEGIN
  v_tile := public.compute_prediction_tile(refresh_prediction_tile.z, refresh_prediction_tile.x, refresh_prediction_tile.y, p_species_id, p_date);
  INSERT INTO public.prediction_tile_cache (species_id, z, x, y, obs_date, tile, computed_at)
  VALUES (p_species_id, refresh_prediction_tile.z, refresh_prediction_tile.x, refresh_prediction_tile.y, p_date, v_tile, now())
  ON CONFLICT (species_id, z, x, y) DO UPDATE SET obs_date = EXCLUDED.obs_date, tile = EXCLUDED.tile, computed_at = now();
  RETURN length(v_tile);
END;
$function$;
REVOKE ALL ON FUNCTION public.refresh_prediction_tile(bigint, integer, integer, integer, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_prediction_tile(bigint, integer, integer, integer, date) TO service_role;

-- Dygnsavslut med tidsbudget: körs flera gånger (cron) och fortsätter där
-- förra körningen slutade. Saknade cacherader räknas också om, så
-- "DELETE FROM prediction_tile_cache" / "moisture_tile_cache" tvingar fram
-- en full omräkning (t.ex. efter ändrade artprofiler eller skogsdata).
CREATE OR REPLACE FUNCTION public.weather_finalize_daily(p_budget_seconds integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_date date; v_obs integer; v_samples integer; v_scored integer := 0;
  v_m integer := 0; v_p integer := 0; v_left integer; v_deadline timestamptz; r record;
BEGIN
  v_deadline := clock_timestamp() + make_interval(secs => p_budget_seconds);
  v_date := (SELECT max(obs_date) FROM public.weather_observations);
  IF v_date IS NULL THEN RETURN jsonb_build_object('status', 'no_data'); END IF;
  SELECT count(*) INTO v_obs FROM public.weather_observations WHERE obs_date = v_date;
  SELECT count(*) INTO v_samples FROM public.weather_zones WHERE is_weather_sample;
  IF v_obs < v_samples * 0.95 THEN
    RETURN jsonb_build_object('status', 'incomplete', 'obs_date', v_date, 'observations', v_obs, 'samples', v_samples);
  END IF;
  IF EXISTS (SELECT 1 FROM public.weather_observations WHERE obs_date = v_date AND moisture_score IS NULL) THEN
    v_scored := public.recompute_predictions(v_date);
  END IF;
  FOR r IN SELECT t.z, t.x, t.y FROM public.moisture_cache_tiles() t
           LEFT JOIN public.moisture_tile_cache c ON c.z = t.z AND c.x = t.x AND c.y = t.y
           WHERE c.obs_date IS DISTINCT FROM v_date LOOP
    EXIT WHEN clock_timestamp() > v_deadline;
    PERFORM public.refresh_moisture_tile(r.z, r.x, r.y, v_date);
    v_m := v_m + 1;
  END LOOP;
  FOR r IN SELECT s.id AS sid, t.z, t.x, t.y FROM public.species s
           JOIN public.species_habitat_profiles hp ON hp.species_id = s.id
           CROSS JOIN public.moisture_cache_tiles() t
           LEFT JOIN public.prediction_tile_cache c ON c.species_id = s.id AND c.z = t.z AND c.x = t.x AND c.y = t.y
           WHERE c.obs_date IS DISTINCT FROM v_date ORDER BY t.z, s.id LOOP
    EXIT WHEN clock_timestamp() > v_deadline;
    PERFORM public.refresh_prediction_tile(r.sid, r.z, r.x, r.y, v_date);
    v_p := v_p + 1;
  END LOOP;
  SELECT count(*) INTO v_left FROM public.species s
    JOIN public.species_habitat_profiles hp ON hp.species_id = s.id
    CROSS JOIN public.moisture_cache_tiles() t
    LEFT JOIN public.prediction_tile_cache c ON c.species_id = s.id AND c.z = t.z AND c.x = t.x AND c.y = t.y
   WHERE c.obs_date IS DISTINCT FROM v_date;
  v_left := v_left + (SELECT count(*) FROM public.moisture_cache_tiles() t
    LEFT JOIN public.moisture_tile_cache c ON c.z = t.z AND c.x = t.x AND c.y = t.y WHERE c.obs_date IS DISTINCT FROM v_date);
  RETURN jsonb_build_object('status', CASE WHEN v_left = 0 THEN 'ok' ELSE 'partial' END, 'obs_date', v_date,
    'observations', v_obs, 'scored', v_scored, 'moisture_tiles', v_m, 'prediction_tiles', v_p, 'tiles_left', v_left);
END;
$function$;
DROP FUNCTION IF EXISTS public.weather_finalize_daily();
REVOKE ALL ON FUNCTION public.weather_finalize_daily(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.weather_finalize_daily(integer) TO service_role;

-- Var 5:e minut 03:00–03:55 UTC (12 körningar/natt; tomma körningar är billiga).
SELECT cron.unschedule('nightly-weather-finalize') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nightly-weather-finalize');
SELECT cron.schedule('nightly-weather-finalize', '*/5 3 * * *', $$SELECT public.weather_finalize_daily(90);$$);