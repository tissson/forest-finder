-- Artlagret döljer rutor som nästan bara är vatten (nmd_land_fraction < 0,10).
--
-- Varför: 400 av 106 272 aktiva rutor har mindre än 10 % land, och 57-85 % av dem fick artpoäng över 0,2
-- (blåbär 84,5 %, lingon 81,8 %), eftersom fukt kommer från väder och trädtermen är neutral. Det gav
-- prognoser mitt i sjöar. Rutor med 10 % land eller mer (kust, skärgård, blandade sjörutor) berörs inte.
-- Rutor utan nmd_land_fraction (29 st, utanför NMD-kartan) förblir synliga tills vi sett var de ligger.
--
-- Ändrar INTE fuktlagret, poängformeln, artprofiler, tröskeln 0,20 eller några kolumnvärden.
-- Patchar compute_prediction_tile med textersättning (avbryter med fel om definitionen avviker).
-- Cachen byggs INTE om här: använd refresh_stale_prediction_tiles(now(), 90) tills left = 0.

DO $$
DECLARE d text; f text := 'public.compute_prediction_tile(integer,integer,integer,bigint,date)';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p WHERE p.oid = f::regprocedure;
  IF d LIKE '%wz.nmd_land_fraction%' THEN
    RAISE NOTICE '% har redan vattenmaskering, hoppar över.', f;
    RETURN;
  END IF;
  IF d NOT LIKE '%WHERE wz.is_active AND wz.geom && v_env4326%' THEN
    RAISE EXCEPTION '% har inte det förväntade urvalet; avbryter utan ändring.', f;
  END IF;
  d := replace(d, 'WHERE wz.is_active AND wz.geom && v_env4326',
                  'WHERE wz.is_active AND coalesce(wz.nmd_land_fraction, 1.0) >= 0.10 AND wz.geom && v_env4326');
  EXECUTE d;
END $$;

-- ÅTERGÅNG (separat): replace(d, ' AND coalesce(wz.nmd_land_fraction, 1.0) >= 0.10', '') på funktionen,
-- därefter refresh_stale_prediction_tiles(now(), 90) tills left = 0.
