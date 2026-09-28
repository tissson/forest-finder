ALTER TABLE public.species_habitat_profiles
  ADD COLUMN IF NOT EXISTS aff_spruce double precision NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS aff_pine double precision NOT NULL DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS aff_birch double precision NOT NULL DEFAULT 0.5;
UPDATE public.species_habitat_profiles p SET aff_spruce=v.s, aff_pine=v.p, aff_birch=v.b
FROM (VALUES (1,0.8,0.7,0.6),(2,1.0,0.3,0.4),(3,1.0,0.6,0.4),(4,0.3,1.0,0.3),(5,0.8,0.9,0.7),(6,0.2,0.6,0.5)) v(id,s,p,b)
WHERE p.species_id=v.id;

CREATE OR REPLACE FUNCTION public.get_prediction_tile(z integer, x integer, y integer, p_species_id bigint, p_obs_date date DEFAULT NULL::date)
 RETURNS bytea LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_tier text; v_start date; v_end date; v_premium boolean; v_date date; v_season double precision;
  v_mo double precision; v_mt double precision; v_fo double precision; v_ft double precision;
  v_as double precision; v_ap double precision; v_ab double precision;
  v_env geometry; v_env4326 geometry; v_step integer; v_tile bytea;
BEGIN
  SELECT s.tier, s.season_start, s.season_end, hp.moisture_optimum, hp.moisture_tolerance, hp.forest_optimum, hp.forest_tolerance,
         hp.aff_spruce, hp.aff_pine, hp.aff_birch
    INTO v_tier, v_start, v_end, v_mo, v_mt, v_fo, v_ft, v_as, v_ap, v_ab
  FROM public.species s JOIN public.species_habitat_profiles hp ON hp.species_id = s.id WHERE s.id = p_species_id;
  IF v_tier IS NULL THEN RAISE EXCEPTION 'Okänd art'; END IF;
  IF v_tier = 'premium' THEN
    SELECT coalesce(up.is_premium, false) INTO v_premium FROM public.user_profiles up WHERE up.user_id = auth.uid();
    IF NOT coalesce(v_premium, false) THEN RAISE EXCEPTION 'PREMIUM_REQUIRED: Det här lagret ingår i premium.'; END IF;
  END IF;
  v_date := coalesce(p_obs_date, (SELECT max(w.obs_date) FROM public.weather_observations w));
  IF v_date IS NULL THEN RETURN ''::bytea; END IF;
  v_season := CASE
    WHEN v_start IS NULL OR v_end IS NULL THEN 1.0
    WHEN extract(doy from v_start) <= extract(doy from v_end) THEN
      CASE WHEN extract(doy from v_date) BETWEEN extract(doy from v_start) AND extract(doy from v_end) THEN 1.0 ELSE 0.65 END
    ELSE CASE WHEN extract(doy from v_date) >= extract(doy from v_start) OR extract(doy from v_date) <= extract(doy from v_end) THEN 1.0 ELSE 0.65 END
  END;
  v_step := CASE WHEN z <= 5 THEN 6 WHEN z = 6 THEN 4 WHEN z = 7 THEN 2 ELSE 1 END;
  v_env := ST_TileEnvelope(z, x, y);
  v_env4326 := ST_Transform(v_env, 4326);
  SELECT ST_AsMVT(t, 'predictions', 4096, 'geom') INTO v_tile FROM (
    SELECT ST_AsMVTGeom(ST_Transform(ST_Translate(ST_Centroid(sc.geom),
        (((hashtext(sc.zone_id::text || ':jx') & 65535) / 65535.0) - 0.5) * (ST_XMax(sc.geom) - ST_XMin(sc.geom)) * 0.9,
        (((hashtext(sc.zone_id::text || ':jy') & 65535) / 65535.0) - 0.5) * (ST_YMax(sc.geom) - ST_YMin(sc.geom)) * 0.9), 3857),
        v_env, 4096, 64, true) AS geom,
      sc.zone_id, sc.score, sc.moisture, v_date AS obs_date
    FROM (
      SELECT wz.id AS zone_id, wz.geom, m.moisture,
        greatest(0, least(1, (
            0.45 * exp(-power((m.moisture - v_mo) / v_mt, 2))
          + 0.30 * exp(-power((wz.forest_cover - v_fo) / v_ft, 2))
          + 0.25 * tr.fit
        ) * v_season))::double precision AS score
      FROM public.weather_zones wz
      JOIN public.weather_observations w ON w.weather_zone_id = wz.weather_sample_id AND w.obs_date = v_date
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