-- Read-only leave-one-out weather interpolation benchmark.
-- Each held-out point is excluded; distances are EPSG:3006 metres.
-- Compare nearest neighbour with four-neighbour inverse squared distance.
-- These are Open-Meteo model points, not independent weather stations.
WITH points AS (
  SELECT w.obs_date, z.id,
    ST_Transform(ST_SetSRID(ST_MakePoint(z.center_lon,z.center_lat),4326),3006) AS point,
    w.temp_mean, w.precip_7d_sum, w.precip_10d_sum
  FROM public.weather_zones z
  JOIN public.weather_observations w ON w.weather_zone_id=z.id
  WHERE z.is_weather_sample
), estimates AS (
  SELECT t.obs_date,t.id,t.temp_mean,t.precip_7d_sum,t.precip_10d_sum,
    avg(n.temp_mean) FILTER (WHERE n.rank=1) AS nearest_temp,
    avg(n.precip_7d_sum) FILTER (WHERE n.rank=1) AS nearest_r7,
    avg(n.precip_10d_sum) FILTER (WHERE n.rank=1) AS nearest_r10,
    sum(n.temp_mean / power(greatest(n.distance,1),2)) /
      sum(1 / power(greatest(n.distance,1),2)) AS idw_temp,
    sum(n.precip_7d_sum / power(greatest(n.distance,1),2)) /
      sum(1 / power(greatest(n.distance,1),2)) AS idw_r7,
    sum(n.precip_10d_sum / power(greatest(n.distance,1),2)) /
      sum(1 / power(greatest(n.distance,1),2)) AS idw_r10
  FROM points t
  CROSS JOIN LATERAL (
    SELECT q.*, ST_Distance(t.point,q.point) AS distance,
      row_number() OVER (ORDER BY ST_Distance(t.point,q.point),q.id) AS rank
    FROM points q
    WHERE q.obs_date=t.obs_date AND q.id<>t.id
    ORDER BY ST_Distance(t.point,q.point),q.id LIMIT 4
  ) n
  GROUP BY t.obs_date,t.id,t.temp_mean,t.precip_7d_sum,t.precip_10d_sum
)
SELECT obs_date,count(*) AS held_out_points,
  avg(abs(temp_mean-nearest_temp)) AS nearest_temp_mae,
  avg(abs(temp_mean-idw_temp)) AS idw_temp_mae,
  avg(abs(precip_7d_sum-nearest_r7)) AS nearest_r7_mae,
  avg(abs(precip_7d_sum-idw_r7)) AS idw_r7_mae,
  avg(abs(precip_10d_sum-nearest_r10)) AS nearest_r10_mae,
  avg(abs(precip_10d_sum-idw_r10)) AS idw_r10_mae
FROM estimates GROUP BY obs_date ORDER BY obs_date;