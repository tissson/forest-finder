CREATE OR REPLACE FUNCTION public.get_predictions(
  p_species_id bigint,
  p_min_lon double precision,
  p_min_lat double precision,
  p_max_lon double precision,
  p_max_lat double precision,
  p_obs_date date DEFAULT NULL::date,
  p_min_score double precision DEFAULT 0.05,
  p_limit integer DEFAULT 2000
)
RETURNS TABLE(
  lon double precision,
  lat double precision,
  obs_date date,
  score_total double precision,
  score_soil double precision,
  score_forest double precision,
  score_weather double precision
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_tier text;
  v_premium boolean;
  v_date date;
BEGIN
  SELECT s.tier INTO v_tier FROM public.species s WHERE s.id = p_species_id;
  IF v_tier IS NULL THEN
    RAISE EXCEPTION 'Okänd art';
  END IF;
  IF v_tier = 'premium' THEN
    SELECT coalesce(up.is_premium, false) INTO v_premium
    FROM public.user_profiles up
    WHERE up.user_id = auth.uid();
    IF NOT coalesce(v_premium, false) THEN
      RAISE EXCEPTION 'PREMIUM_REQUIRED: Det här lagret ingår i premium.';
    END IF;
  END IF;

  v_date := coalesce(
    p_obs_date,
    (SELECT max(p.obs_date) FROM public.predictions p WHERE p.species_id = p_species_id)
  );

  RETURN QUERY
  SELECT z.center_lon, z.center_lat, p.obs_date, p.score_total,
         p.score_soil, p.score_forest, p.score_weather
  FROM public.predictions p
  JOIN public.weather_zones z ON z.id = p.weather_zone_id
  WHERE p.species_id = p_species_id
    AND p.obs_date = v_date
    AND p.score_total >= coalesce(p_min_score, 0)
    AND z.center_lon BETWEEN p_min_lon AND p_max_lon
    AND z.center_lat BETWEEN p_min_lat AND p_max_lat
  ORDER BY p.score_total DESC
  LIMIT least(greatest(coalesce(p_limit, 2000), 1), 25000);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_moisture_layer(
  p_min_lon double precision,
  p_min_lat double precision,
  p_max_lon double precision,
  p_max_lat double precision,
  p_obs_date date DEFAULT NULL::date,
  p_min_score double precision DEFAULT 0,
  p_limit integer DEFAULT 2000
)
RETURNS TABLE(
  lon double precision,
  lat double precision,
  obs_date date,
  moisture_score double precision,
  precip_7d_sum double precision,
  precip_10d_sum double precision,
  temp_mean double precision
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT z.center_lon, z.center_lat, w.obs_date, w.moisture_score,
         w.precip_7d_sum, w.precip_10d_sum, w.temp_mean
  FROM public.weather_observations w
  JOIN public.weather_zones z ON z.id = w.weather_zone_id
  WHERE w.obs_date = coalesce(p_obs_date, (SELECT max(obs_date) FROM public.weather_observations))
    AND coalesce(w.moisture_score, 0) >= coalesce(p_min_score, 0)
    AND z.center_lon BETWEEN p_min_lon AND p_max_lon
    AND z.center_lat BETWEEN p_min_lat AND p_max_lat
  ORDER BY w.moisture_score DESC NULLS LAST
  LIMIT least(greatest(coalesce(p_limit, 2000), 1), 25000);
$function$;

GRANT EXECUTE ON FUNCTION public.get_predictions(bigint, double precision, double precision, double precision, double precision, date, double precision, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_moisture_layer(double precision, double precision, double precision, double precision, date, double precision, integer) TO anon, authenticated, service_role;