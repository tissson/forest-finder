CREATE OR REPLACE FUNCTION public.load_soil_wetness(p_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n integer;
BEGIN
  WITH r AS (
    SELECT (e->>0)::double precision x, (e->>1)::double precision y, (e->>2)::double precision v
    FROM jsonb_array_elements(p_rows) e
  ), p AS (SELECT ST_Transform(ST_SetSRID(ST_MakePoint(x,y),3006),4326) pt, v FROM r)
  UPDATE public.weather_zones wz SET soil_wetness = round((p.v/100.0)::numeric,3)
  FROM p WHERE wz.geom && p.pt AND ST_Contains(wz.geom, p.pt);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.load_soil_wetness(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.load_soil_wetness(jsonb) TO service_role;