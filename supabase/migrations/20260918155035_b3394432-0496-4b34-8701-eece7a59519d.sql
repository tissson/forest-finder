CREATE TABLE IF NOT EXISTS public.sweden_water (
  id bigserial PRIMARY KEY,
  geom geometry(Geometry, 4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.sweden_water TO service_role;
ALTER TABLE public.sweden_water ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS sweden_water_geom_gix ON public.sweden_water USING gist (geom);

CREATE OR REPLACE FUNCTION public.add_water_geometry(p_geojson jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO public.sweden_water (geom)
  VALUES (ST_SetSRID(ST_GeomFromGeoJSON(p_geojson::text), 4326))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.add_water_geometry(jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_water_geometry(jsonb) TO service_role;