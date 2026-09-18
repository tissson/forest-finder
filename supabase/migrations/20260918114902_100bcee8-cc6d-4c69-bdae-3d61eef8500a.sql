CREATE TABLE IF NOT EXISTS public.sweden_land_mask (
  id integer PRIMARY KEY DEFAULT 1,
  geojson jsonb NOT NULL,
  geom geometry(MultiPolygon, 4326),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sweden_land_mask_single_row CHECK (id = 1)
);

GRANT ALL ON public.sweden_land_mask TO service_role;
ALTER TABLE public.sweden_land_mask ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.weather_zones
  ADD COLUMN IF NOT EXISTS is_land boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS forest_cover double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS weather_sample_id bigint;

CREATE INDEX IF NOT EXISTS idx_weather_zones_active_bbox
  ON public.weather_zones (center_lon, center_lat) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_weather_zones_sample
  ON public.weather_zones (weather_sample_id);
CREATE INDEX IF NOT EXISTS idx_weather_observations_date
  ON public.weather_observations (obs_date);