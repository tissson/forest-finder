-- Förberäknade fuktrutor för låg zoom (5–7). Live-beräkningen vid utzoomat
-- läge kan överskrida anon-rollens statement_timeout (3 s) vid kall cache.
-- get_moisture_tile läser cachen när den är aktuell för begärt datum,
-- annars räknas rutan live som tidigare (fallback).

CREATE TABLE public.moisture_tile_cache (
  z smallint NOT NULL,
  x integer NOT NULL,
  y integer NOT NULL,
  obs_date date NOT NULL,
  tile bytea NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (z, x, y)
);
GRANT ALL ON public.moisture_tile_cache TO service_role;
ALTER TABLE public.moisture_tile_cache ENABLE ROW LEVEL SECURITY;
-- Inga policyer: läses endast via SECURITY DEFINER-funktioner.

-- Själva beräkningen (oförändrad logik från get_moisture_tile).
CREATE OR REPLACE FUNCTION public.compute_moisture_tile(z integer, x integer, y integer, p_date date)
RETURNS bytea
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE v_env geometry; v_env4326 geometry; v_step integer; v_tile bytea;
BEGIN
  v_step := CASE WHEN z <= 5 THEN 4 WHEN z = 6 THEN 3 WHEN z = 7 THEN 2 ELSE 1 END;
  v_env := ST_TileEnvelope(z, x, y);
  v_env4326 := ST_Transform(v_env, 4326);
  SELECT ST_AsMVT(t, 'predictions', 4096, 'geom') INTO v_tile FROM (
    SELECT ST_AsMVTGeom(ST_Transform(ST_Translate(ST_Centroid(wz.geom),
        (((hashtext(wz.id::text || ':jx') & 65535) / 65535.0) - 0.5) * (ST_XMax(wz.geom) - ST_XMin(wz.geom)) * 0.9,
        (((hashtext(wz.id::text || ':jy') & 65535) / 65535.0) - 0.5) * (ST_YMax(wz.geom) - ST_YMin(wz.geom)) * 0.9), 3857),
        v_env, 4096, 64, true) AS geom,
      wz.id AS zone_id, m.moisture AS score, m.moisture AS moisture, p_date AS obs_date
    FROM public.weather_zones wz
    JOIN public.weather_observations w ON w.weather_zone_id = wz.weather_sample_id AND w.obs_date = p_date
    CROSS JOIN LATERAL (SELECT (CASE WHEN wz.soil_wetness IS NULL THEN coalesce(w.moisture_score, 0)
                                ELSE 0.6 * coalesce(w.moisture_score, 0) + 0.4 * wz.soil_wetness END)::double precision AS moisture) m
    WHERE wz.is_active AND wz.geom && v_env4326
      AND (v_step = 1 OR (wz.grid_x % v_step = 0 AND wz.grid_y % v_step = 0))
      AND m.moisture >= 0.20
  ) t WHERE t.geom IS NOT NULL;
  RETURN coalesce(v_tile, ''::bytea);
END;
$function$;
REVOKE ALL ON FUNCTION public.compute_moisture_tile(integer, integer, integer, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_moisture_tile(integer, integer, integer, date) TO service_role;

CREATE OR REPLACE FUNCTION public.get_moisture_tile(z integer, x integer, y integer, p_obs_date date DEFAULT NULL::date)
RETURNS bytea
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_date date; v_tile bytea;
BEGIN
  v_date := coalesce(p_obs_date, (SELECT max(w.obs_date) FROM public.weather_observations w));
  IF v_date IS NULL THEN RETURN ''::bytea; END IF;
  IF z <= 7 THEN
    SELECT c.tile INTO v_tile FROM public.moisture_tile_cache c
     WHERE c.z = get_moisture_tile.z AND c.x = get_moisture_tile.x AND c.y = get_moisture_tile.y
       AND c.obs_date = v_date;
    IF FOUND THEN RETURN v_tile; END IF;
  END IF;
  RETURN public.compute_moisture_tile(z, x, y, v_date);
END;
$function$;

-- Vilka rutor som förberäknas: zoom 5–7 över Sveriges kartgräns
-- [10.5, 55.2]–[24.2, 69.1]. 12 + 28 + 72 = 112 rutor.
CREATE OR REPLACE FUNCTION public.moisture_cache_tiles()
RETURNS TABLE(z integer, x integer, y integer)
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT 5, gx, gy FROM generate_series(16, 18) gx, generate_series(7, 10) gy
  UNION ALL
  SELECT 6, gx, gy FROM generate_series(33, 36) gx, generate_series(14, 20) gy
  UNION ALL
  SELECT 7, gx, gy FROM generate_series(67, 72) gx, generate_series(29, 40) gy
$function$;
REVOKE ALL ON FUNCTION public.moisture_cache_tiles() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moisture_cache_tiles() TO service_role;

-- Räknar om EN ruta (håller sig under service_role:s 8 s per anrop).
CREATE OR REPLACE FUNCTION public.refresh_moisture_tile(z integer, x integer, y integer, p_obs_date date DEFAULT NULL::date)
RETURNS integer
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_date date; v_tile bytea;
BEGIN
  v_date := coalesce(p_obs_date, (SELECT max(w.obs_date) FROM public.weather_observations w));
  IF v_date IS NULL THEN RETURN 0; END IF;
  v_tile := public.compute_moisture_tile(z, x, y, v_date);
  INSERT INTO public.moisture_tile_cache AS c (z, x, y, obs_date, tile, computed_at)
  VALUES (z, x, y, v_date, v_tile, now())
  ON CONFLICT (z, x, y) DO UPDATE SET obs_date = EXCLUDED.obs_date, tile = EXCLUDED.tile, computed_at = now();
  RETURN length(v_tile);
END;
$function$;
REVOKE ALL ON FUNCTION public.refresh_moisture_tile(integer, integer, integer, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_moisture_tile(integer, integer, integer, date) TO service_role;

-- Räknar om alla förberäknade rutor (för privilegierad körning utan 8 s-gräns,
-- t.ex. efter att markfukt laddats om). Valfritt begränsat till en zoomnivå.
CREATE OR REPLACE FUNCTION public.refresh_moisture_tile_cache(p_z integer DEFAULT NULL, p_obs_date date DEFAULT NULL::date)
RETURNS integer
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN SELECT t.z, t.x, t.y FROM public.moisture_cache_tiles() t WHERE p_z IS NULL OR t.z = p_z LOOP
    PERFORM public.refresh_moisture_tile(r.z, r.x, r.y, p_obs_date);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$function$;
REVOKE ALL ON FUNCTION public.refresh_moisture_tile_cache(integer, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_moisture_tile_cache(integer, date) TO service_role;