CREATE TABLE IF NOT EXISTS public.weather_zone_blocks (
  level integer NOT NULL,
  block_x integer NOT NULL,
  block_y integer NOT NULL,
  zone_id bigint NOT NULL,
  weather_sample_id bigint,
  forest_cover double precision NOT NULL DEFAULT 0,
  geom geometry(Polygon, 4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (level, block_x, block_y)
);

GRANT SELECT ON public.weather_zone_blocks TO anon, authenticated;
GRANT ALL ON public.weather_zone_blocks TO service_role;
ALTER TABLE public.weather_zone_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Kartblock är publika" ON public.weather_zone_blocks
  FOR SELECT TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS weather_zone_blocks_geom_gix
  ON public.weather_zone_blocks USING gist (geom);
CREATE INDEX IF NOT EXISTS weather_zone_blocks_level_idx
  ON public.weather_zone_blocks (level);

CREATE OR REPLACE FUNCTION public.rebuild_weather_zone_blocks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_level integer;
  v_count integer := 0;
BEGIN
  DELETE FROM public.weather_zone_blocks;
  FOREACH v_level IN ARRAY ARRAY[8, 4, 2] LOOP
    INSERT INTO public.weather_zone_blocks (level, block_x, block_y, zone_id, weather_sample_id, forest_cover, geom)
    SELECT v_level,
           wz.grid_x / v_level,
           wz.grid_y / v_level,
           min(wz.id),
           (array_agg(wz.weather_sample_id ORDER BY wz.id))[1],
           avg(wz.forest_cover),
           ST_SetSRID(ST_Envelope(ST_Extent(wz.geom)), 4326)
    FROM public.weather_zones wz
    WHERE wz.is_active
    GROUP BY wz.grid_x / v_level, wz.grid_y / v_level;
  END LOOP;
  SELECT count(*) INTO v_count FROM public.weather_zone_blocks;
  RETURN v_count;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.rebuild_weather_zone_blocks() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_weather_zone_blocks() TO service_role;

SELECT public.rebuild_weather_zone_blocks();
ANALYZE public.weather_zone_blocks;

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
  v_slug text;
  v_premium boolean;
  v_start date;
  v_end date;
  v_date date;
  v_season double precision;
  v_level integer;
  v_env geometry;
  v_env4326 geometry;
  v_tile bytea;
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

  v_date := coalesce(p_obs_date, (SELECT max(w.obs_date) FROM public.weather_observations w));
  IF v_date IS NULL THEN
    RETURN ''::bytea;
  END IF;

  v_season := CASE
    WHEN v_start IS NULL OR v_end IS NULL THEN 1.0
    WHEN extract(doy from v_start) <= extract(doy from v_end) THEN
      CASE WHEN extract(doy from v_date) BETWEEN extract(doy from v_start) AND extract(doy from v_end) THEN 1.0 ELSE 0.15 END
    ELSE
      CASE WHEN extract(doy from v_date) >= extract(doy from v_start)
             OR extract(doy from v_date) <= extract(doy from v_end) THEN 1.0 ELSE 0.15 END
  END;

  v_level := CASE WHEN z <= 5 THEN 8 WHEN z <= 7 THEN 4 WHEN z <= 9 THEN 2 ELSE 0 END;
  v_env := ST_TileEnvelope(z, x, y);
  v_env4326 := ST_Transform(v_env, 4326);

  IF v_level > 0 THEN
    SELECT ST_AsMVT(t, 'predictions', 4096, 'geom') INTO v_tile
    FROM (
      SELECT ST_AsMVTGeom(ST_Transform(b.geom, 3857), v_env, 4096, 64, true) AS geom,
             b.zone_id,
             greatest(0, least(1,
               (0.50 * coalesce(w.moisture_score, 0)
                + 0.25 * (0.30 + 0.70 * ((hashtext(b.zone_id::text || ':soil:' || v_slug) & 1023) / 1023.0))
                + 0.25 * (0.20 + 0.80 * b.forest_cover)) * v_season))::double precision AS score,
             coalesce(w.moisture_score, 0)::double precision AS moisture,
             v_date AS obs_date
      FROM public.weather_zone_blocks b
      JOIN public.weather_observations w
        ON w.weather_zone_id = b.weather_sample_id AND w.obs_date = v_date
      WHERE b.level = v_level
        AND b.geom && v_env4326
    ) t
    WHERE t.geom IS NOT NULL;
  ELSE
    SELECT ST_AsMVT(t, 'predictions', 4096, 'geom') INTO v_tile
    FROM (
      SELECT ST_AsMVTGeom(ST_Transform(wz.geom, 3857), v_env, 4096, 64, true) AS geom,
             wz.id AS zone_id,
             greatest(0, least(1,
               (0.50 * coalesce(w.moisture_score, 0)
                + 0.25 * (0.30 + 0.70 * ((hashtext(wz.id::text || ':soil:' || v_slug) & 1023) / 1023.0))
                + 0.25 * (0.20 + 0.80 * wz.forest_cover)) * v_season))::double precision AS score,
             coalesce(w.moisture_score, 0)::double precision AS moisture,
             v_date AS obs_date
      FROM public.weather_zones wz
      JOIN public.weather_observations w
        ON w.weather_zone_id = wz.weather_sample_id AND w.obs_date = v_date
      WHERE wz.is_active
        AND wz.geom && v_env4326
    ) t
    WHERE t.geom IS NOT NULL;
  END IF;

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
  v_level integer;
  v_env geometry;
  v_env4326 geometry;
  v_tile bytea;
BEGIN
  v_date := coalesce(p_obs_date, (SELECT max(w.obs_date) FROM public.weather_observations w));
  IF v_date IS NULL THEN
    RETURN ''::bytea;
  END IF;

  v_level := CASE WHEN z <= 5 THEN 8 WHEN z <= 7 THEN 4 WHEN z <= 9 THEN 2 ELSE 0 END;
  v_env := ST_TileEnvelope(z, x, y);
  v_env4326 := ST_Transform(v_env, 4326);

  IF v_level > 0 THEN
    SELECT ST_AsMVT(t, 'predictions', 4096, 'geom') INTO v_tile
    FROM (
      SELECT ST_AsMVTGeom(ST_Transform(b.geom, 3857), v_env, 4096, 64, true) AS geom,
             b.zone_id,
             coalesce(w.moisture_score, 0)::double precision AS score,
             coalesce(w.moisture_score, 0)::double precision AS moisture,
             v_date AS obs_date
      FROM public.weather_zone_blocks b
      JOIN public.weather_observations w
        ON w.weather_zone_id = b.weather_sample_id AND w.obs_date = v_date
      WHERE b.level = v_level
        AND b.geom && v_env4326
    ) t
    WHERE t.geom IS NOT NULL;
  ELSE
    SELECT ST_AsMVT(t, 'predictions', 4096, 'geom') INTO v_tile
    FROM (
      SELECT ST_AsMVTGeom(ST_Transform(wz.geom, 3857), v_env, 4096, 64, true) AS geom,
             wz.id AS zone_id,
             coalesce(w.moisture_score, 0)::double precision AS score,
             coalesce(w.moisture_score, 0)::double precision AS moisture,
             v_date AS obs_date
      FROM public.weather_zones wz
      JOIN public.weather_observations w
        ON w.weather_zone_id = wz.weather_sample_id AND w.obs_date = v_date
      WHERE wz.is_active
        AND wz.geom && v_env4326
    ) t
    WHERE t.geom IS NOT NULL;
  END IF;

  RETURN coalesce(v_tile, ''::bytea);
END;
$function$;