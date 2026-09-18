CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE public.weather_zones ADD COLUMN IF NOT EXISTS geom geometry(Polygon, 4326);

-- Befintliga glesa zoner får polygoner utifrån sitt faktiska cellavstånd (~0,27° lat / ~0,5° lon)
UPDATE public.weather_zones
SET geom = ST_MakeEnvelope(
  center_lon - 0.25, center_lat - 0.135,
  center_lon + 0.25, center_lat + 0.135,
  4326)
WHERE geom IS NULL;

-- Generera tätt 2x2 km-rutnät över Sverige via SWEREF 99 TM, sparat som WGS84
INSERT INTO public.weather_zones (grid_x, grid_y, center_lat, center_lon, geom)
SELECT
  floor(ST_Y(c) / 0.045)::int AS grid_x_y,
  floor(ST_X(c) / (5 / (111.32 * greatest(cos(radians(ST_Y(c))), 0.01))))::int,
  ST_Y(c) AS center_lat,
  ST_X(c) AS center_lon,
  g.geom
FROM ST_SquareGrid(
  2000,
  ST_SetSRID(
    ST_MakeBox2D(
      ST_Point(250000, 6100000),
      ST_Point(920000, 7680000)
    ),
    3006
  )
) AS cell
CROSS JOIN LATERAL (SELECT ST_Transform(cell.geom, 4326) AS geom) g
CROSS JOIN LATERAL (SELECT ST_Centroid(g.geom) AS c) ce
ON CONFLICT (grid_x, grid_y) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_weather_zones_geom ON public.weather_zones USING GIST (geom);