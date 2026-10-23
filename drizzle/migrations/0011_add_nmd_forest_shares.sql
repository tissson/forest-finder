ALTER TABLE public.weather_zones
  ADD COLUMN IF NOT EXISTS forest_share double precision,
  ADD COLUMN IF NOT EXISTS clearcut_share double precision,
  ADD COLUMN IF NOT EXISTS share_pine double precision,
  ADD COLUMN IF NOT EXISTS share_spruce double precision,
  ADD COLUMN IF NOT EXISTS share_mixed_conifer double precision,
  ADD COLUMN IF NOT EXISTS share_mixed_deciduous_conifer double precision,
  ADD COLUMN IF NOT EXISTS share_deciduous double precision,
  ADD COLUMN IF NOT EXISTS nmd_land_fraction double precision;
COMMENT ON COLUMN public.weather_zones.forest_share IS 'NMD2018 v1.1: standing forest (111-117,121-127) / land pixels (classified minus water 61/62). Not used by scoring yet.';
COMMENT ON COLUMN public.weather_zones.clearcut_share IS 'NMD2018 v1.1: temporarily non-forest (118,128) / land pixels. Not used by scoring yet.';
COMMENT ON COLUMN public.weather_zones.share_pine IS 'NMD2018 v1.1: pine forest (111,121) / land pixels.';
COMMENT ON COLUMN public.weather_zones.share_spruce IS 'NMD2018 v1.1: spruce forest (112,122) / land pixels.';
COMMENT ON COLUMN public.weather_zones.share_mixed_conifer IS 'NMD2018 v1.1: mixed conifer (113,123) / land pixels.';
COMMENT ON COLUMN public.weather_zones.share_mixed_deciduous_conifer IS 'NMD2018 v1.1: deciduous-mixed conifer (114,124) / land pixels.';
COMMENT ON COLUMN public.weather_zones.share_deciduous IS 'NMD2018 v1.1: deciduous incl. broadleaf (115-117,125-127) / land pixels.';
COMMENT ON COLUMN public.weather_zones.nmd_land_fraction IS 'NMD2018 v1.1: land pixels / all pixels in the 2x2 km cell.';