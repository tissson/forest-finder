CREATE TABLE public.species_habitat_profiles (
  species_id bigint PRIMARY KEY REFERENCES public.species(id) ON DELETE CASCADE,
  moisture_optimum double precision NOT NULL CHECK (moisture_optimum BETWEEN 0 AND 1),
  moisture_tolerance double precision NOT NULL CHECK (moisture_tolerance > 0 AND moisture_tolerance <= 1),
  forest_optimum double precision NOT NULL CHECK (forest_optimum BETWEEN 0 AND 1),
  forest_tolerance double precision NOT NULL CHECK (forest_tolerance > 0 AND forest_tolerance <= 1),
  soil_seed integer NOT NULL
);
GRANT ALL ON public.species_habitat_profiles TO service_role;
ALTER TABLE public.species_habitat_profiles ENABLE ROW LEVEL SECURITY;

INSERT INTO public.species_habitat_profiles
  (species_id, moisture_optimum, moisture_tolerance, forest_optimum, forest_tolerance, soil_seed)
VALUES
  (1, 0.72, 0.25, 0.72, 0.30, 17),
  (2, 0.82, 0.20, 0.82, 0.22, 31),
  (3, 0.52, 0.28, 0.68, 0.32, 47),
  (4, 0.38, 0.20, 0.58, 0.28, 61),
  (5, 0.68, 0.22, 0.78, 0.24, 79),
  (6, 0.88, 0.16, 0.35, 0.25, 97);

CREATE OR REPLACE FUNCTION public.get_prediction_tile(
  z integer,
  x integer,
  y integer,
  p_species_id bigint,
  p_obs_date date DEFAULT NULL
)
RETURNS bytea
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tier text;
  v_start date;
  v_end date;
  v_premium boolean;
  v_date date;
  v_season double precision;
  v_moisture_optimum double precision;
  v_moisture_tolerance double precision;
  v_forest_optimum double precision;
  v_forest_tolerance double precision;
  v_soil_seed integer;
  v_env geometry;
  v_env4326 geometry;
  v_tile bytea;
BEGIN
  SELECT s.tier, s.season_start, s.season_end,
         hp.moisture_optimum, hp.moisture_tolerance,
         hp.forest_optimum, hp.forest_tolerance, hp.soil_seed
    INTO v_tier, v_start, v_end,
         v_moisture_optimum, v_moisture_tolerance,
         v_forest_optimum, v_forest_tolerance, v_soil_seed
  FROM public.species s
  JOIN public.species_habitat_profiles hp ON hp.species_id = s.id
  WHERE s.id = p_species_id;

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

  v_date := coalesce(p_obs_date, (SELECT max(w.obs_date) FROM public.weather_observations w));
  IF v_date IS NULL THEN
    RETURN ''::bytea;
  END IF;

  v_season := CASE
    WHEN v_start IS NULL OR v_end IS NULL THEN 1.0
    WHEN extract(doy from v_start) <= extract(doy from v_end) THEN
      CASE WHEN extract(doy from v_date) BETWEEN extract(doy from v_start) AND extract(doy from v_end) THEN 1.0 ELSE 0.65 END
    ELSE
      CASE WHEN extract(doy from v_date) >= extract(doy from v_start)
             OR extract(doy from v_date) <= extract(doy from v_end) THEN 1.0 ELSE 0.65 END
  END;

  v_env := ST_TileEnvelope(z, x, y);
  v_env4326 := ST_Transform(v_env, 4326);

  SELECT ST_AsMVT(t, 'predictions', 4096, 'geom') INTO v_tile
  FROM (
    SELECT
      ST_AsMVTGeom(
        ST_Transform(
          ST_Translate(
            ST_Centroid(sc.geom),
            (((hashtext(sc.zone_id::text || ':jx') & 65535) / 65535.0) - 0.5) * (ST_XMax(sc.geom) - ST_XMin(sc.geom)) * 0.7,
            (((hashtext(sc.zone_id::text || ':jy') & 65535) / 65535.0) - 0.5) * (ST_YMax(sc.geom) - ST_YMin(sc.geom)) * 0.7
          ),
          3857
        ),
        v_env,
        4096,
        64,
        true
      ) AS geom,
      sc.zone_id,
      sc.score,
      sc.moisture,
      v_date AS obs_date
    FROM (
      SELECT
        wz.id AS zone_id,
        wz.geom,
        coalesce(w.moisture_score, 0)::double precision AS moisture,
        greatest(0, least(1,
          (
            0.45 * exp(-power((coalesce(w.moisture_score, 0) - v_moisture_optimum) / v_moisture_tolerance, 2))
            + 0.40 * exp(-power((wz.forest_cover - v_forest_optimum) / v_forest_tolerance, 2))
            + 0.15 * (0.20 + 0.80 * ((hashtext(wz.id::text || ':' || v_soil_seed::text) & 1023) / 1023.0))
          ) * v_season
        ))::double precision AS score
      FROM public.weather_zones wz
      JOIN public.weather_observations w
        ON w.weather_zone_id = wz.weather_sample_id
       AND w.obs_date = v_date
      WHERE wz.is_active
        AND wz.geom && v_env4326
    ) sc
    WHERE sc.score >= 0.30
  ) t
  WHERE t.geom IS NOT NULL;

  RETURN coalesce(v_tile, ''::bytea);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_moisture_tile(
  z integer,
  x integer,
  y integer,
  p_obs_date date DEFAULT NULL
)
RETURNS bytea
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_date date;
  v_env geometry;
  v_env4326 geometry;
  v_tile bytea;
BEGIN
  v_date := coalesce(p_obs_date, (SELECT max(w.obs_date) FROM public.weather_observations w));
  IF v_date IS NULL THEN
    RETURN ''::bytea;
  END IF;

  v_env := ST_TileEnvelope(z, x, y);
  v_env4326 := ST_Transform(v_env, 4326);

  SELECT ST_AsMVT(t, 'predictions', 4096, 'geom') INTO v_tile
  FROM (
    SELECT
      ST_AsMVTGeom(
        ST_Transform(
          ST_Translate(
            ST_Centroid(wz.geom),
            (((hashtext(wz.id::text || ':jx') & 65535) / 65535.0) - 0.5) * (ST_XMax(wz.geom) - ST_XMin(wz.geom)) * 0.7,
            (((hashtext(wz.id::text || ':jy') & 65535) / 65535.0) - 0.5) * (ST_YMax(wz.geom) - ST_YMin(wz.geom)) * 0.7
          ),
          3857
        ),
        v_env,
        4096,
        64,
        true
      ) AS geom,
      wz.id AS zone_id,
      coalesce(w.moisture_score, 0)::double precision AS score,
      coalesce(w.moisture_score, 0)::double precision AS moisture,
      v_date AS obs_date
    FROM public.weather_zones wz
    JOIN public.weather_observations w
      ON w.weather_zone_id = wz.weather_sample_id
     AND w.obs_date = v_date
    WHERE wz.is_active
      AND wz.geom && v_env4326
      AND coalesce(w.moisture_score, 0) >= 0.30
  ) t
  WHERE t.geom IS NOT NULL;

  RETURN coalesce(v_tile, ''::bytea);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_prediction_tile(integer, integer, integer, bigint, date) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_moisture_tile(integer, integer, integer, date) TO anon, authenticated, service_role;