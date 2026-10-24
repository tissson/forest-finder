-- Skogstermen i artpoängen använder NMD-skogsandel (forest_share) i stället för SLU-volym/200 (forest_cover).
--
-- Varför: forest_cover har ett golv på 0,03 där SLU saknar täckning (85-100 % av rutorna norr om 62°N),
-- vilket gav en konstgjord nedgång mot norr. forest_share täcker hela landet (106 243 av 106 272 aktiva rutor).
-- Validering mot GBIF (docs/map-audit/gbif-find-nmd-shares-2026-10-24.csv, breddgradsstratifierad AUC):
-- där båda finns är måtten likvärdiga (blåbär 0,53 mot 0,55, trattkantarell 0,63 mot 0,63).
--
-- Ändrar INTE: artprofilernas optimum/toleranser, trädtermen (vol_*), fuktmodellen, säsongsfaktorn,
-- tröskeln 0,20 eller någon data. Rutor utan forest_share (vattenrutor, 29 utanför NMD) faller tillbaka på forest_cover.
-- Patchar funktionen i stället för att skriva om den, så att resten av produktionsdefinitionen lämnas orörd.
-- Cachen byggs INTE om här: se refresh_stale_prediction_tiles längre ned.

DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p WHERE p.oid = 'public.compute_prediction_tile(integer,integer,integer,bigint,date)'::regprocedure;

  IF d LIKE '%coalesce(wz.forest_share, wz.forest_cover)%' THEN
    RAISE NOTICE 'compute_prediction_tile använder redan forest_share, hoppar över.';
    RETURN;
  END IF;

  IF d NOT LIKE '%exp(-power((wz.forest_cover - v_fo) / v_ft, 2))%' THEN
    RAISE EXCEPTION 'compute_prediction_tile har inte den förväntade skogstermen; avbryter utan ändring.';
  END IF;

  d := replace(d,
    'exp(-power((wz.forest_cover - v_fo) / v_ft, 2))',
    'exp(-power((coalesce(wz.forest_share, wz.forest_cover) - v_fo) / v_ft, 2))');
  EXECUTE d;
END $$;

COMMENT ON COLUMN public.weather_zones.forest_share IS
  'NMD2018 v1.1: stående skog (111-117,121-127) / landpixlar (klassificerad yta minus vatten 61/62). Används i artpoängen (skogstermen) med forest_cover som reserv. Samma tolkning av 0-1 för hela landet.';
COMMENT ON COLUMN public.weather_zones.forest_cover IS
  'SLU skogskarta total virkesvolym / 200 (0-1), golv 0,03 där SLU saknar data (stora delar av Norrland). Används bara som reserv i artpoängen när forest_share saknas.';

-- Hjälpfunktion för att bygga om förberäknade artrutor utan att tömma cachen (ingen lucka där zoom <= 7 faller
-- tillbaka på live-beräkning). Räknar om rutor som är äldre än p_before eller saknar rätt datum, inom en tidsbudget,
-- och kan köras flera gånger tills "left" är 0. Skriver bara över rader i prediction_tile_cache.
CREATE OR REPLACE FUNCTION public.refresh_stale_prediction_tiles(p_before timestamptz, p_budget_seconds integer DEFAULT 90)
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
  FOR r IN SELECT s.id AS sid, t.z, t.x, t.y FROM public.species s
           JOIN public.species_habitat_profiles hp ON hp.species_id = s.id
           CROSS JOIN public.moisture_cache_tiles() t
           LEFT JOIN public.prediction_tile_cache c ON c.species_id = s.id AND c.z = t.z AND c.x = t.x AND c.y = t.y
           WHERE c.computed_at IS NULL OR c.computed_at < p_before OR c.obs_date IS DISTINCT FROM v_date
           ORDER BY t.z, s.id LOOP
    EXIT WHEN clock_timestamp() > v_deadline;
    PERFORM public.refresh_prediction_tile(r.sid, r.z, r.x, r.y, v_date);
    v_done := v_done + 1;
  END LOOP;
  SELECT count(*) INTO v_left FROM public.species s
    JOIN public.species_habitat_profiles hp ON hp.species_id = s.id
    CROSS JOIN public.moisture_cache_tiles() t
    LEFT JOIN public.prediction_tile_cache c ON c.species_id = s.id AND c.z = t.z AND c.x = t.x AND c.y = t.y
   WHERE c.computed_at IS NULL OR c.computed_at < p_before OR c.obs_date IS DISTINCT FROM v_date;
  RETURN jsonb_build_object('status', CASE WHEN v_left = 0 THEN 'ok' ELSE 'partial' END,
                            'obs_date', v_date, 'refreshed', v_done, 'left', v_left);
END;
$function$;
REVOKE ALL ON FUNCTION public.refresh_stale_prediction_tiles(timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_stale_prediction_tiles(timestamptz, integer) TO service_role;

-- ÅTERGÅNG (kör separat vid behov): samma patch åt andra hållet.
--   DO $$ DECLARE d text; BEGIN
--     SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p WHERE p.oid='public.compute_prediction_tile(integer,integer,integer,bigint,date)'::regprocedure;
--     d := replace(d,'coalesce(wz.forest_share, wz.forest_cover)','wz.forest_cover'); EXECUTE d; END $$;
--   Kör därefter refresh_stale_prediction_tiles(now()) tills left = 0.
