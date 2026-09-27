CREATE INDEX IF NOT EXISTS weather_zones_active_geom_idx ON public.weather_zones USING gist (geom) WHERE is_active;
DO $$
DECLARE d text; f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.get_moisture_tile','public.get_prediction_tile'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p WHERE p.oid = f::regproc;
    d := replace(d, 'WHEN z <= 5 THEN 4 WHEN z = 6 THEN 3', 'WHEN z <= 5 THEN 6 WHEN z = 6 THEN 4');
    EXECUTE d;
  END LOOP;
END $$;