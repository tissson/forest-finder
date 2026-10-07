CREATE OR REPLACE FUNCTION public.refresh_moisture_tile(z integer, x integer, y integer, p_obs_date date DEFAULT NULL::date)
RETURNS integer
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE v_date date; v_tile bytea;
BEGIN
  v_date := coalesce(p_obs_date, (SELECT max(w.obs_date) FROM public.weather_observations w));
  IF v_date IS NULL THEN RETURN 0; END IF;
  v_tile := public.compute_moisture_tile(refresh_moisture_tile.z, refresh_moisture_tile.x, refresh_moisture_tile.y, v_date);
  INSERT INTO public.moisture_tile_cache AS c (z, x, y, obs_date, tile, computed_at)
  VALUES (refresh_moisture_tile.z, refresh_moisture_tile.x, refresh_moisture_tile.y, v_date, v_tile, now())
  ON CONFLICT (z, x, y) DO UPDATE SET obs_date = EXCLUDED.obs_date, tile = EXCLUDED.tile, computed_at = now();
  RETURN length(v_tile);
END;
$function$;
REVOKE ALL ON FUNCTION public.refresh_moisture_tile(integer, integer, integer, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_moisture_tile(integer, integer, integer, date) TO service_role;