ALTER TABLE public.weather_zones
  ADD COLUMN IF NOT EXISTS vol_spruce double precision,
  ADD COLUMN IF NOT EXISTS vol_pine double precision,
  ADD COLUMN IF NOT EXISTS vol_birch double precision;

CREATE OR REPLACE FUNCTION public.load_tree_volume(p_kind text, p_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF p_kind NOT IN ('spruce','pine','birch') THEN RAISE EXCEPTION 'bad kind'; END IF;
  EXECUTE format($q$
    WITH r AS (
      SELECT ST_Transform(ST_SetSRID(ST_MakePoint((e->>0)::float8,(e->>1)::float8),3006),4326) pt,
             (e->>2)::float8 v FROM jsonb_array_elements($1) e)
    UPDATE weather_zones wz SET vol_%s = round(r.v::numeric,1)
    FROM r WHERE wz.geom && r.pt AND ST_Contains(wz.geom, r.pt)$q$, p_kind)
  USING p_rows;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.load_tree_volume(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.load_tree_volume(text, jsonb) TO service_role;