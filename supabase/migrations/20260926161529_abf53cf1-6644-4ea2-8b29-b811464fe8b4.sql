CREATE OR REPLACE FUNCTION public.get_moisture_tile(z integer, x integer, y integer, p_obs_date date DEFAULT NULL::date)
 RETURNS bytea LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_date date; v_env geometry; v_env4326 geometry; v_step integer; v_tile bytea;
BEGIN
  v_date := coalesce(p_obs_date, (SELECT max(w.obs_date) FROM public.weather_observations w));
  IF v_date IS NULL THEN RETURN ''::bytea; END IF;
  v_step := CASE WHEN z <= 5 THEN 4 WHEN z = 6 THEN 3 WHEN z = 7 THEN 2 ELSE 1 END;
  v_env := ST_TileEnvelope(z, x, y);
  v_env4326 := ST_Transform(v_env, 4326);
  SELECT ST_AsMVT(t, 'predictions', 4096, 'geom') INTO v_tile FROM (
    SELECT ST_AsMVTGeom(ST_Transform(ST_Translate(ST_Centroid(wz.geom),
        (((hashtext(wz.id::text || ':jx') & 65535) / 65535.0) - 0.5) * (ST_XMax(wz.geom) - ST_XMin(wz.geom)) * 0.9,
        (((hashtext(wz.id::text || ':jy') & 65535) / 65535.0) - 0.5) * (ST_YMax(wz.geom) - ST_YMin(wz.geom)) * 0.9), 3857),
        v_env, 4096, 64, true) AS geom,
      wz.id AS zone_id, m.moisture AS score, m.moisture AS moisture, v_date AS obs_date
    FROM public.weather_zones wz
    JOIN public.weather_observations w ON w.weather_zone_id = wz.weather_sample_id AND w.obs_date = v_date
    CROSS JOIN LATERAL (SELECT (CASE WHEN wz.soil_wetness IS NULL THEN coalesce(w.moisture_score, 0)
                                ELSE 0.6 * coalesce(w.moisture_score, 0) + 0.4 * wz.soil_wetness END)::double precision AS moisture) m
    WHERE wz.is_active AND wz.geom && v_env4326
      AND (v_step = 1 OR (wz.grid_x % v_step = 0 AND wz.grid_y % v_step = 0))
      AND m.moisture >= 0.20
  ) t WHERE t.geom IS NOT NULL;
  RETURN coalesce(v_tile, ''::bytea);
END;
$function$;