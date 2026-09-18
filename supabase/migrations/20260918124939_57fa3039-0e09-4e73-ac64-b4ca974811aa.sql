create or replace function public.get_prediction_tile(
  z integer,
  x integer,
  y integer,
  p_species_id bigint,
  p_obs_date date default null
)
returns bytea
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
DECLARE
  v_tier text;
  v_slug text;
  v_premium boolean;
  v_start date;
  v_end date;
  v_date date;
  v_season double precision;
  v_step integer;
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

  v_step := CASE WHEN z <= 5 THEN 8 WHEN z <= 7 THEN 4 WHEN z <= 9 THEN 2 ELSE 1 END;
  v_env := ST_TileEnvelope(z, x, y);
  v_env4326 := ST_Transform(v_env, 4326);

  SELECT ST_AsMVT(t, 'predictions', 4096, 'geom')
    INTO v_tile
  FROM (
    SELECT ST_AsMVTGeom(ST_Transform(g.cell, 3857), v_env, 4096, 64, true) AS geom,
           g.zone_id,
           g.score,
           g.moisture,
           v_date AS obs_date
    FROM (
      SELECT min(wz.id) AS zone_id,
             avg(greatest(0, least(1,
               (0.50 * coalesce(w.moisture_score, 0)
                + 0.25 * (0.30 + 0.70 * ((hashtext(wz.id::text || ':soil:' || v_slug) & 1023) / 1023.0))
                + 0.25 * (0.20 + 0.80 * wz.forest_cover)) * v_season)))::double precision AS score,
             avg(coalesce(w.moisture_score, 0))::double precision AS moisture,
             ST_SetSRID(ST_Extent(wz.geom), 4326)::geometry AS cell
      FROM public.weather_zones wz
      JOIN public.weather_observations w
        ON w.weather_zone_id = wz.weather_sample_id AND w.obs_date = v_date
      WHERE wz.is_active
        AND wz.geom && v_env4326
      GROUP BY wz.grid_x / v_step, wz.grid_y / v_step
    ) g
  ) t
  WHERE t.geom IS NOT NULL;

  RETURN coalesce(v_tile, ''::bytea);
END;
$function$;

create or replace function public.get_moisture_tile(
  z integer,
  x integer,
  y integer,
  p_obs_date date default null
)
returns bytea
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
DECLARE
  v_date date;
  v_step integer;
  v_env geometry;
  v_env4326 geometry;
  v_tile bytea;
BEGIN
  v_date := coalesce(p_obs_date, (SELECT max(w.obs_date) FROM public.weather_observations w));
  IF v_date IS NULL THEN
    RETURN ''::bytea;
  END IF;

  v_step := CASE WHEN z <= 5 THEN 8 WHEN z <= 7 THEN 4 WHEN z <= 9 THEN 2 ELSE 1 END;
  v_env := ST_TileEnvelope(z, x, y);
  v_env4326 := ST_Transform(v_env, 4326);

  SELECT ST_AsMVT(t, 'predictions', 4096, 'geom')
    INTO v_tile
  FROM (
    SELECT ST_AsMVTGeom(ST_Transform(g.cell, 3857), v_env, 4096, 64, true) AS geom,
           g.zone_id,
           g.score,
           g.moisture,
           v_date AS obs_date
    FROM (
      SELECT min(wz.id) AS zone_id,
             avg(coalesce(w.moisture_score, 0))::double precision AS score,
             avg(coalesce(w.moisture_score, 0))::double precision AS moisture,
             ST_SetSRID(ST_Extent(wz.geom), 4326)::geometry AS cell
      FROM public.weather_zones wz
      JOIN public.weather_observations w
        ON w.weather_zone_id = wz.weather_sample_id AND w.obs_date = v_date
      WHERE wz.is_active
        AND wz.geom && v_env4326
      GROUP BY wz.grid_x / v_step, wz.grid_y / v_step
    ) g
  ) t
  WHERE t.geom IS NOT NULL;

  RETURN coalesce(v_tile, ''::bytea);
END;
$function$;

grant execute on function public.get_prediction_tile(integer, integer, integer, bigint, date) to anon, authenticated, service_role;
grant execute on function public.get_moisture_tile(integer, integer, integer, date) to anon, authenticated, service_role;