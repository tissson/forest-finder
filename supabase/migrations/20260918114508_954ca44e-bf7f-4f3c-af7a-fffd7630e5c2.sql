INSERT INTO public.weather_zones (grid_x, grid_y, center_lat, center_lon, geom)
SELECT
  floor(ST_X(c) / (2 / (111.32 * greatest(cos(radians(ST_Y(c))), 0.01))))::int AS grid_x,
  floor(ST_Y(c) / (2 / 111.32))::int AS grid_y,
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
WHERE NOT EXISTS (
  SELECT 1 FROM public.weather_zones wz
  WHERE wz.geom && g.geom AND ST_Equals(wz.geom, g.geom)
)
ON CONFLICT (grid_x, grid_y) DO NOTHING;