CREATE OR REPLACE FUNCTION public.get_predictions(
  p_species_id bigint,
  p_min_lon double precision,
  p_min_lat double precision,
  p_max_lon double precision,
  p_max_lat double precision,
  p_obs_date date DEFAULT NULL::date,
  p_min_score double precision DEFAULT 0.05,
  p_limit integer DEFAULT 2000,
  p_step integer DEFAULT 1
)
RETURNS TABLE(lon double precision, lat double precision, obs_date date, score_total double precision, score_soil double precision, score_forest double precision, score_weather double precision)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tier text;
  v_slug text;
  v_premium boolean;
  v_date date;
  v_season double precision;
  v_start date;
  v_end date;
  v_step integer;
BEGIN
  SELECT s.tier, s.slug, s.season_start, s.season_end
    INTO v_tier, v_slug, v_start, v_end
  FROM public.species s WHERE s.id = p_species_id;
  IF v_tier IS NULL THEN
    RAISE EXCEPTION 'Okänd art';
  END IF;
  IF v_tier = 'premium' THEN
    SELECT coalesce(up.is_premium, false) INTO v_premium
    FROM public.user_profiles up WHERE up.user_id = auth.uid();
    IF NOT coalesce(v_premium, false) THEN
      RAISE EXCEPTION 'PREMIUM_REQUIRED: Det här lagret ingår i premium.';
    END IF;
  END IF;

  v_step := least(greatest(coalesce(p_step, 1), 1), 20);
  v_date := coalesce(p_obs_date, (SELECT max(w.obs_date) FROM public.weather_observations w));
  IF v_date IS NULL THEN
    RETURN;
  END IF;

  v_season := CASE
    WHEN v_start IS NULL OR v_end IS NULL THEN 1.0
    WHEN extract(doy from v_start) <= extract(doy from v_end) THEN
      CASE WHEN extract(doy from v_date) BETWEEN extract(doy from v_start) AND extract(doy from v_end) THEN 1.0 ELSE 0.15 END
    ELSE
      CASE WHEN extract(doy from v_date) >= extract(doy from v_start)
             OR extract(doy from v_date) <= extract(doy from v_end) THEN 1.0 ELSE 0.15 END
  END;

  RETURN QUERY
  SELECT z.center_lon,
         z.center_lat,
         v_date,
         greatest(0, least(1, (0.50 * coalesce(w.moisture_score, 0) + 0.25 * soil.v + 0.25 * forest.v) * v_season))::double precision,
         soil.v,
         forest.v,
         coalesce(w.moisture_score, 0)::double precision
  FROM public.weather_zones z
  JOIN public.weather_observations w
    ON w.weather_zone_id = z.weather_sample_id AND w.obs_date = v_date
  CROSS JOIN LATERAL (
    SELECT (0.30 + 0.70 * ((hashtext(z.id::text || ':soil:' || v_slug) & 1023) / 1023.0))::double precision AS v
  ) soil
  CROSS JOIN LATERAL (
    SELECT (0.20 + 0.80 * z.forest_cover)::double precision AS v
  ) forest
  WHERE z.is_active
    AND z.center_lon BETWEEN p_min_lon AND p_max_lon
    AND z.center_lat BETWEEN p_min_lat AND p_max_lat
    AND (v_step = 1 OR (z.grid_x % v_step = 0 AND z.grid_y % v_step = 0))
    AND greatest(0, least(1, (0.50 * coalesce(w.moisture_score, 0) + 0.25 * soil.v + 0.25 * forest.v) * v_season)) >= coalesce(p_min_score, 0)
  ORDER BY 4 DESC
  LIMIT least(greatest(coalesce(p_limit, 2000), 1), 25000);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_predictions(bigint, double precision, double precision, double precision, double precision, date, double precision, integer, integer) TO anon, authenticated, service_role;