ALTER TABLE public.weather_zones
  ADD COLUMN IF NOT EXISTS is_weather_sample boolean NOT NULL DEFAULT false;

UPDATE public.weather_zones z
SET is_weather_sample = true
WHERE z.id IN (SELECT DISTINCT weather_sample_id FROM public.weather_zones WHERE weather_sample_id IS NOT NULL)
  AND NOT z.is_weather_sample;

CREATE INDEX IF NOT EXISTS idx_weather_zones_is_sample
  ON public.weather_zones (id) WHERE is_weather_sample;