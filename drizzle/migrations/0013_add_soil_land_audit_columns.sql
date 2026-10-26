ALTER TABLE public.weather_zones
 ADD COLUMN soil_wetness_land double precision,
 ADD COLUMN soil_water_fraction double precision,
 ADD COLUMN soil_valid_fraction double precision;
COMMENT ON COLUMN public.weather_zones.soil_wetness_land IS 'Audit only: SLU classes 1/2/3 mapped to 15/45/70, mean over land pixels divided by 100; classes 0/4/5/255 excluded. NULL when no valid land. Not used by production scoring.';
COMMENT ON COLUMN public.weather_zones.soil_water_fraction IS 'Audit only: SLU class 4 pixel count / all pixels in 2x2 km cell, including uncovered area in denominator.';
COMMENT ON COLUMN public.weather_zones.soil_valid_fraction IS 'Audit only: SLU classes 1-4 pixel count / all pixels in 2x2 km cell.';
CREATE FUNCTION public.load_soil_land_audit(p_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE n integer;
BEGIN
 IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Expected rows array'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) e WHERE jsonb_typeof(e) IS DISTINCT FROM 'array' OR jsonb_array_length(e) <> 5 OR (e->>0) IS NULL OR (e->>1) IS NULL OR (e->>3) IS NULL OR (e->>4) IS NULL OR (e->>2)::double precision NOT BETWEEN 0 AND 1 OR (e->>3)::double precision NOT BETWEEN 0 AND 1 OR (e->>4)::double precision NOT BETWEEN 0 AND 1 OR (e->>3)::double precision > (e->>4)::double precision) THEN RAISE EXCEPTION 'Invalid audit row'; END IF;
 WITH r AS (SELECT (e->>0)::double precision x,(e->>1)::double precision y,(e->>2)::double precision land,(e->>3)::double precision water,(e->>4)::double precision valid FROM jsonb_array_elements(p_rows) e),
 p AS (SELECT ST_Transform(ST_SetSRID(ST_MakePoint(x,y),3006),4326) pt,land,water,valid FROM r)
 UPDATE public.weather_zones wz SET soil_wetness_land=p.land,soil_water_fraction=p.water,soil_valid_fraction=p.valid
 FROM p WHERE wz.is_active AND wz.geom && p.pt AND ST_Contains(wz.geom,p.pt);
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n;
END
$fn$;
REVOKE ALL ON FUNCTION public.load_soil_land_audit(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.load_soil_land_audit(jsonb) TO service_role;