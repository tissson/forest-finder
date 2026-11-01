-- Markfukten i fukt- och artlagren använder soil_wetness_land (SLU klass 1-3, öppet vatten uteslutet)
-- i stället för soil_wetness (där klass 4 = öppet vatten felaktigt gav 0,95).
--
-- Underlag: docs/map-audit/soil-land-audit-2026-10-27.md. Alla 106 272 aktiva rutor är laddade och
-- verifierade mot ett oberoende GDAL-medelvärde (325 rutor, max 4e-14) och två länsgränser (inga avvikelser).
-- Rutor utan giltig mark (NULL, 2 533 st) får fukt enbart från väder, vilket funktionerna redan gör för NULL.
--
-- Ändrar INTE: artprofiler, skogsterm, trädterm, säsong, tröskeln 0,20, väderdata eller några kolumnvärden.
-- Patchar funktionerna med textersättning (avbryter med fel om produktionsdefinitionen avviker).
-- Cachen byggs INTE om här: använd refresh_stale_moisture_tiles / refresh_stale_prediction_tiles nedan.

DO $$
DECLARE d text; f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.compute_moisture_tile(integer,integer,integer,date)',
    'public.compute_prediction_tile(integer,integer,integer,bigint,date)'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p WHERE p.oid = f::regprocedure;
    IF d LIKE '%wz.soil_wetness_land%' THEN
      RAISE NOTICE '% använder redan soil_wetness_land, hoppar över.', f;
      CONTINUE;
    END IF;
    IF d NOT LIKE '%wz.soil_wetness IS NULL%' OR d NOT LIKE '%0.4 * wz.soil_wetness END%' THEN
      RAISE EXCEPTION '% har inte den förväntade markfuktstermen; avbryter utan ändring.', f;
    END IF;
    d := replace(d, 'wz.soil_wetness IS NULL', 'wz.soil_wetness_land IS NULL');
    d := replace(d, '0.4 * wz.soil_wetness END', '0.4 * wz.soil_wetness_land END');
    EXECUTE d;
  END LOOP;
END $$;

COMMENT ON COLUMN public.weather_zones.soil_wetness_land IS
  'SLU markfuktighet: klass 1/2/3 mappade till 15/45/70, medel över landpixlar / 100; klass 0/4/5/255 (varav 4 = öppet vatten) uteslutna. NULL när giltig mark saknas. Används i fukt- och artlagren.';
COMMENT ON COLUMN public.weather_zones.soil_wetness IS
  'GAMMAL markfukt där SLU klass 4 (öppet vatten) felaktigt mappades till 0,95. Används inte längre i poängen; behålls för jämförelse. Se soil_wetness_land.';

CREATE OR REPLACE FUNCTION public.refresh_stale_moisture_tiles(p_before timestamptz, p_budget_seconds integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_date date; v_deadline timestamptz; v_done integer := 0; v_left integer; r record;
BEGIN
  v_date := public.published_obs_date();
  IF v_date IS NULL THEN RETURN jsonb_build_object('status', 'no_published_date'); END IF;
  v_deadline := clock_timestamp() + make_interval(secs => p_budget_seconds);
  FOR r IN SELECT t.z, t.x, t.y FROM public.moisture_cache_tiles() t
           LEFT JOIN public.moisture_tile_cache c ON c.z = t.z AND c.x = t.x AND c.y = t.y
           WHERE c.computed_at IS NULL OR c.computed_at < p_before OR c.obs_date IS DISTINCT FROM v_date
           ORDER BY t.z LOOP
    EXIT WHEN clock_timestamp() > v_deadline;
    PERFORM public.refresh_moisture_tile(r.z, r.x, r.y, v_date);
    v_done := v_done + 1;
  END LOOP;
  SELECT count(*) INTO v_left FROM public.moisture_cache_tiles() t
    LEFT JOIN public.moisture_tile_cache c ON c.z = t.z AND c.x = t.x AND c.y = t.y
   WHERE c.computed_at IS NULL OR c.computed_at < p_before OR c.obs_date IS DISTINCT FROM v_date;
  RETURN jsonb_build_object('status', CASE WHEN v_left = 0 THEN 'ok' ELSE 'partial' END,
                            'obs_date', v_date, 'refreshed', v_done, 'left', v_left);
END;
$function$;
REVOKE ALL ON FUNCTION public.refresh_stale_moisture_tiles(timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_stale_moisture_tiles(timestamptz, integer) TO service_role;

-- ÅTERGÅNG (separat): replace(d,'wz.soil_wetness_land','wz.soil_wetness') på båda funktionerna,
-- därefter refresh_stale_moisture_tiles(now()) och refresh_stale_prediction_tiles(now()) tills left = 0.
