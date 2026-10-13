-- Kartan visar bara en väderdag som är helt omräknad (publicerad).
CREATE TABLE public.weather_published (
  id integer PRIMARY KEY DEFAULT 1,
  obs_date date NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT weather_published_single CHECK (id = 1)
);
GRANT ALL ON public.weather_published TO service_role;
ALTER TABLE public.weather_published ENABLE ROW LEVEL SECURITY;

INSERT INTO public.weather_published (id, obs_date)
SELECT 1, max(obs_date) FROM public.weather_observations o
WHERE NOT EXISTS (SELECT 1 FROM public.weather_observations n WHERE n.obs_date = o.obs_date AND n.moisture_score IS NULL)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.published_obs_date()
RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT obs_date FROM public.weather_published WHERE id = 1 $$;
GRANT EXECUTE ON FUNCTION public.published_obs_date() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_moisture_tile(z integer, x integer, y integer, p_obs_date date DEFAULT NULL::date)
RETURNS bytea LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_date date; v_tile bytea;
BEGIN
  v_date := coalesce(p_obs_date, public.published_obs_date());
  IF v_date IS NULL THEN RETURN ''::bytea; END IF;
  IF z <= 7 THEN
    SELECT c.tile INTO v_tile FROM public.moisture_tile_cache c
     WHERE c.z = get_moisture_tile.z AND c.x = get_moisture_tile.x AND c.y = get_moisture_tile.y AND c.obs_date = v_date;
    IF FOUND THEN RETURN v_tile; END IF;
  END IF;
  RETURN public.compute_moisture_tile(z, x, y, v_date);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_prediction_tile(z integer, x integer, y integer, p_species_id bigint, p_obs_date date DEFAULT NULL::date)
RETURNS bytea LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_tier text; v_premium boolean; v_date date; v_tile bytea;
BEGIN
  SELECT s.tier INTO v_tier FROM public.species s JOIN public.species_habitat_profiles hp ON hp.species_id = s.id WHERE s.id = p_species_id;
  IF v_tier IS NULL THEN RAISE EXCEPTION 'Okänd art'; END IF;
  IF v_tier = 'premium' THEN
    SELECT coalesce(up.is_premium, false) INTO v_premium FROM public.user_profiles up WHERE up.user_id = auth.uid();
    IF NOT coalesce(v_premium, false) THEN RAISE EXCEPTION 'PREMIUM_REQUIRED: Det här lagret ingår i premium.'; END IF;
  END IF;
  v_date := coalesce(p_obs_date, public.published_obs_date());
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

CREATE OR REPLACE FUNCTION public.get_weather_freshness()
RETURNS TABLE(latest_obs_date date, zone_count bigint, observation_count bigint, prediction_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select public.published_obs_date(),
    (select count(*) from public.weather_zones),
    (select count(*) from public.weather_observations where obs_date = public.published_obs_date()),
    (select count(*) from public.predictions where obs_date = (select max(obs_date) from public.predictions));
$function$;

-- Avslut: kräver ALLA provpunkter, räknar om, fyller cachen och publicerar
-- dagen först när inga rutor återstår.
CREATE OR REPLACE FUNCTION public.weather_finalize_daily(p_budget_seconds integer DEFAULT 90)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_date date; v_obs integer; v_samples integer; v_scored integer := 0;
  v_m integer := 0; v_p integer := 0; v_left integer; v_deadline timestamptz; r record;
BEGIN
  v_deadline := clock_timestamp() + make_interval(secs => p_budget_seconds);
  v_date := (SELECT max(obs_date) FROM public.weather_observations);
  IF v_date IS NULL THEN RETURN jsonb_build_object('status', 'no_data'); END IF;
  SELECT count(*) INTO v_obs FROM public.weather_observations WHERE obs_date = v_date;
  SELECT count(*) INTO v_samples FROM public.weather_zones WHERE is_weather_sample;
  IF v_obs < v_samples THEN
    RETURN jsonb_build_object('status', 'incomplete', 'obs_date', v_date, 'observations', v_obs, 'samples', v_samples,
      'published', public.published_obs_date());
  END IF;
  IF EXISTS (SELECT 1 FROM public.weather_observations WHERE obs_date = v_date AND moisture_score IS NULL) THEN
    v_scored := public.recompute_predictions(v_date);
    -- Omräknad dag => cachen för dagen måste byggas om.
    DELETE FROM public.moisture_tile_cache WHERE obs_date = v_date;
    DELETE FROM public.prediction_tile_cache WHERE obs_date = v_date;
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
  IF v_left = 0 THEN
    INSERT INTO public.weather_published (id, obs_date, published_at) VALUES (1, v_date, now())
    ON CONFLICT (id) DO UPDATE SET obs_date = EXCLUDED.obs_date, published_at = now()
    WHERE public.weather_published.obs_date IS DISTINCT FROM EXCLUDED.obs_date;
  END IF;
  RETURN jsonb_build_object('status', CASE WHEN v_left = 0 THEN 'ok' ELSE 'partial' END, 'obs_date', v_date,
    'observations', v_obs, 'scored', v_scored, 'moisture_tiles', v_m, 'prediction_tiles', v_p, 'tiles_left', v_left,
    'published', public.published_obs_date());
END;
$function$;

-- Hälsokontroll: fel om dagen inte är fullständig eller inte publicerad.
-- Anrop som gav fel men lyckades vid omförsök rapporteras i svaret.
CREATE OR REPLACE FUNCTION public.weather_ingest_health()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_date date := (now() AT TIME ZONE 'UTC')::date;
  v_obs integer; v_samples integer; v_failed integer; v_first text; v_ok integer; v_pub date;
BEGIN
  SELECT count(*) INTO v_obs FROM public.weather_observations WHERE obs_date = v_date;
  SELECT count(*) INTO v_samples FROM public.weather_zones WHERE is_weather_sample;
  SELECT count(*) FILTER (WHERE NOT ok), count(*) FILTER (WHERE ok), min(error) FILTER (WHERE NOT ok)
    INTO v_failed, v_ok, v_first FROM public.weather_ingest_log WHERE obs_date = v_date;
  v_pub := public.published_obs_date();
  IF v_obs < v_samples THEN
    RAISE EXCEPTION 'VÄDERHÄMTNING MISSLYCKAD %: % av % provpunkter, % felande anrop, första fel: %',
      v_date, v_obs, v_samples, v_failed, coalesce(v_first, '-');
  END IF;
  IF v_pub IS DISTINCT FROM v_date THEN
    RAISE EXCEPTION 'VÄDER HÄMTAT MEN EJ PUBLICERAT %: kartan visar fortfarande %', v_date, v_pub;
  END IF;
  RETURN jsonb_build_object('status', 'ok', 'obs_date', v_date, 'observations', v_obs, 'published', v_pub,
    'requests_ok', v_ok, 'retried_errors', v_failed, 'first_retried_error', v_first);
END;
$function$;