ALTER TABLE public.weather_zones ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.weather_zones TO anon, authenticated;
GRANT ALL ON public.weather_zones TO service_role;

DROP POLICY IF EXISTS "weather_zones_public_read" ON public.weather_zones;
CREATE POLICY "weather_zones_public_read"
  ON public.weather_zones
  FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE EXECUTE ON FUNCTION public.recompute_predictions(date) FROM anon, authenticated;