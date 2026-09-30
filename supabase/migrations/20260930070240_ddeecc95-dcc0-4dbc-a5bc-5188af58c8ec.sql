-- 1) Återställ zoomglesningen till 4 (z<=5) / 3 (z=6). Indexet weather_zones_active_geom_idx finns kvar.
DO $$
DECLARE d text; f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.get_moisture_tile','public.get_prediction_tile'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p WHERE p.oid = f::regproc;
    d := replace(d, 'WHEN z <= 5 THEN 6 WHEN z = 6 THEN 4', 'WHEN z <= 5 THEN 4 WHEN z = 6 THEN 3');
    EXECUTE d;
  END LOOP;
END $$;

-- 2) Återkörbar laddning av forest_cover (SLU total virkesvolym), samma mönster som load_tree_volume.
--    p_rows = [[x_3006, y_3006, volym_m3sk_ha], ...] -- ett värde per 2x2 km-cell.
CREATE OR REPLACE FUNCTION public.load_forest_cover(p_rows jsonb, p_saturation_volume double precision DEFAULT 200.0)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
  WITH r AS (
    SELECT ST_Transform(ST_SetSRID(ST_MakePoint((e->>0)::float8,(e->>1)::float8),3006),4326) pt,
           (e->>2)::float8 v
    FROM jsonb_array_elements(p_rows) e
  )
  UPDATE public.weather_zones wz
  SET forest_cover = round(LEAST(1.0, GREATEST(0.0, r.v / p_saturation_volume))::numeric, 3)
  FROM r WHERE wz.geom && r.pt AND ST_Contains(wz.geom, r.pt);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $function$;

-- Sätter golvvärde på aktiva rutor som saknar SLU-skog (körs EFTER alla län laddats).
CREATE OR REPLACE FUNCTION public.finalize_forest_cover(p_loaded_threshold double precision DEFAULT 0.0, p_floor double precision DEFAULT 0.03)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
  UPDATE public.weather_zones SET forest_cover = p_floor
  WHERE is_active AND forest_cover <= p_loaded_threshold;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $function$;

REVOKE ALL ON FUNCTION public.load_forest_cover(jsonb, double precision) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_forest_cover(double precision, double precision) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.load_forest_cover(jsonb, double precision) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_forest_cover(double precision, double precision) TO service_role;

-- 3) Rätta inaktuella kommentarer.
COMMENT ON FUNCTION public.get_prediction_tile(integer,integer,integer,bigint,date) IS
  'forest_cover är RIKTIG data: SLU skogskarta total virkesvolym / 200 (0-1), laddad via scripts/load-slu-rasters.sh + load_forest_cover(). Rutor utan SLU-skog = 0.03. Trädslag i vol_spruce/vol_pine/vol_birch (separat dataset, load_tree_volume). Markfukt i soil_wetness (load_soil_wetness).';
COMMENT ON FUNCTION public.populate_forest_cover(geometry, double precision) IS
  'OANVÄND. Alternativ raster2pgsql-väg som aldrig kördes. forest_cover fylls i stället via scripts/load-slu-rasters.sh -> load_forest_cover().';
COMMENT ON TABLE public.forest_cover_staging IS
  'OANVÄND (1 testrad). forest_cover laddas via scripts/load-slu-rasters.sh -> load_forest_cover(), inte via denna tabell.';