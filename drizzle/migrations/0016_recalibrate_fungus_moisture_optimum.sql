-- Fuktoptimum för kantarell, trattkantarell och Karl Johan flyttas in i det område modellen faktiskt producerar.
--
-- Varför: den kombinerade fukten (0,6 väder + 0,4 SLU-markfukt) ligger för 90 % av rutorna mellan 0,09 och 0,41
-- (docs/map-audit/cell-terms-2026-11-03-*.csv, 25 dagars väder). De gamla optimum (0,72 / 0,82 / 0,68 med toleranser
-- 0,25 / 0,20 / 0,22) nås bara av 0,1-3,5 % av alla punkt-dagar, så fukttermen var nästan alltid ~0 och kartorna blev
-- skogskartor (fukt bidrar 5-15 % av variansen i poäng).
--
-- Underlag, trattkantarell (653 GBIF-fynd 2020-2025, jämförelse inom samma plats mot 20 kontrolldatum, samma år,
-- docs/map-audit/gbif-date-test-2026-11-07.csv): fuktigare datum är något vanligare vid fynd (AUC 0,54, 90 % KI 0,52-0,56;
-- temperatur ingen signal, AUC 0,51). Optimum mellan 0,5 och 0,82 går inte att skilja åt (AUC 0,545-0,549 mot 0,542 för 0,82),
-- alltså stöder data "fuktigare är bättre upp till ungefär 0,5+", inte 0,82 särskilt.
-- Kantarell (18 fynd) och Karl Johan (23) saknar eget underlag: samma ändring är en extrapolering från trattkantarell
-- och strukturellt motiverad (nåbart område), inte en validerad kalibrering.
--
-- Nytt: moisture_optimum 0,60, moisture_tolerance 0,30 för arterna 1 (kantarell), 2 (trattkantarell), 5 (Karl Johan).
-- Ändrar INTE: blåbär, lingon, hjortron (hjortron behöver myrdata), skogs- och trädprofiler, fuktlagret, funktioner,
-- trösklar eller data. Avbryter om profilraderna inte har de förväntade nuvarande värdena.
-- Cachen byggs INTE om här: kör refresh_stale_prediction_tiles(now(), 90) tills left = 0.

DO $$
DECLARE n integer;
BEGIN
  UPDATE public.species_habitat_profiles hp
     SET moisture_optimum = 0.60, moisture_tolerance = 0.30
   WHERE (hp.species_id = 1 AND hp.moisture_optimum = 0.72 AND hp.moisture_tolerance = 0.25)
      OR (hp.species_id = 2 AND hp.moisture_optimum = 0.82 AND hp.moisture_tolerance = 0.20)
      OR (hp.species_id = 5 AND hp.moisture_optimum = 0.68 AND hp.moisture_tolerance = 0.22);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 3 THEN RETURN; END IF;
  IF n = 0 AND (SELECT count(*) FROM public.species_habitat_profiles
                WHERE species_id IN (1,2,5) AND moisture_optimum = 0.60 AND moisture_tolerance = 0.30) = 3 THEN
    RAISE NOTICE 'Profilerna är redan omkalibrerade, hoppar över.';
    RETURN;
  END IF;
  RAISE EXCEPTION 'Förväntade 3 profilrader med de gamla värdena, hittade % uppdateringsbara; avbryter.', n;
END $$;

-- ÅTERGÅNG (separat): UPDATE public.species_habitat_profiles SET (moisture_optimum, moisture_tolerance) =
--   (0.72,0.25) WHERE species_id=1; (0.82,0.20) WHERE species_id=2; (0.68,0.22) WHERE species_id=5;
--   därefter refresh_stale_prediction_tiles(now(), 90) tills left = 0.
