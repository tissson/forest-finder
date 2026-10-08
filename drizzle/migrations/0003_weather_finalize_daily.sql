-- Avslutar dygnets väderhämtning i databasen (ingen 8 s-gräns som via API:t):
-- räknar fuktpoäng för senaste datumet och förberäknar fuktlagrets låga zoom.
-- Idempotent: gör inget om allt redan är klart.
CREATE OR REPLACE FUNCTION public.weather_finalize_daily()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_date date; v_obs integer; v_samples integer; v_scored integer := 0; v_tiles integer := 0; r record;
BEGIN
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
    PERFORM public.refresh_moisture_tile(r.z, r.x, r.y, v_date);
    v_tiles := v_tiles + 1;
  END LOOP;
  RETURN jsonb_build_object('status', 'ok', 'obs_date', v_date, 'observations', v_obs, 'scored', v_scored, 'tiles_refreshed', v_tiles);
END;
$function$;
REVOKE ALL ON FUNCTION public.weather_finalize_daily() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.weather_finalize_daily() TO service_role;

-- Hämtningen: var 3:e minut 02:00–02:57 UTC (20 anrop/natt, ~5 behövs; resten
-- svarar direkt med remaining = 0 och fungerar som omförsök).
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'nightly-weather-ingest'), schedule := '*/3 2 * * *');

-- Avslut i databasen 03:00 och 03:30 UTC (andra körningen är ett omförsök).
SELECT cron.unschedule('nightly-weather-finalize') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nightly-weather-finalize');
SELECT cron.schedule('nightly-weather-finalize', '0,30 3 * * *', $$SELECT public.weather_finalize_daily();$$);