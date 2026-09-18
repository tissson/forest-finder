
-- 1. Seed weather zones covering Sweden (reuses the 5 km grid lookup)
do $$
declare r record;
begin
  if (select count(*) from public.weather_zones) < 500 then
    for r in
      select lat, lon
      from generate_series(55.4, 69.0, 0.30) as lat,
           generate_series(11.2, 24.0, 0.60) as lon
    loop
      perform public.lookup_weather_zone(r.lat, r.lon);
    end loop;
  end if;
end $$;

-- 2. Recompute moisture + species predictions
create or replace function public.recompute_predictions(p_obs_date date default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_date date;
  v_rows integer := 0;
begin
  v_date := coalesce(p_obs_date, (select max(obs_date) from public.weather_observations));
  if v_date is null then
    return 0;
  end if;

  -- moisture score from rainfall + temperature comfort
  update public.weather_observations w
  set moisture_score = greatest(0, least(1,
        0.60 * least(1, coalesce(w.precip_7d_sum, 0) / 40.0)
      + 0.40 * least(1, coalesce(w.precip_10d_sum, 0) / 70.0)
      - case
          when w.temp_mean is null then 0
          when w.temp_mean < 2 or w.temp_mean > 24 then 0.45
          when w.temp_mean between 8 and 17 then 0
          else 0.15
        end))
  where w.obs_date = v_date;

  insert into public.predictions
    (species_id, weather_zone_id, obs_date, score_total, score_soil, score_forest, score_weather)
  select
    s.id,
    w.weather_zone_id,
    v_date,
    greatest(0, least(1, (0.50 * coalesce(w.moisture_score, 0) + 0.25 * soil.v + 0.25 * forest.v) * season.f)),
    soil.v,
    forest.v,
    coalesce(w.moisture_score, 0)
  from public.weather_observations w
  join public.species s on true
  cross join lateral (
    select 0.30 + 0.70 * ((hashtext(w.weather_zone_id::text || ':soil:' || s.slug) & 1023) / 1023.0) as v
  ) soil
  cross join lateral (
    select 0.30 + 0.70 * ((hashtext(w.weather_zone_id::text || ':forest:' || s.slug) & 1023) / 1023.0) as v
  ) forest
  cross join lateral (
    select case
      when s.season_start is null or s.season_end is null then 1.0
      when extract(doy from s.season_start) <= extract(doy from s.season_end) then
        case when extract(doy from v_date) between extract(doy from s.season_start) and extract(doy from s.season_end)
             then 1.0 else 0.15 end
      else
        case when extract(doy from v_date) >= extract(doy from s.season_start)
                or extract(doy from v_date) <= extract(doy from s.season_end)
             then 1.0 else 0.15 end
    end as f
  ) season
  where w.obs_date = v_date
  on conflict (species_id, weather_zone_id, obs_date) do update
    set score_total = excluded.score_total,
        score_soil = excluded.score_soil,
        score_forest = excluded.score_forest,
        score_weather = excluded.score_weather;

  get diagnostics v_rows = row_count;
  return v_rows;
end $$;

revoke all on function public.recompute_predictions(date) from public, anon, authenticated;
grant execute on function public.recompute_predictions(date) to service_role;

-- 3. Freshness helper for the UI / diagnostics
create or replace function public.get_weather_freshness()
returns table(latest_obs_date date, zone_count bigint, observation_count bigint, prediction_count bigint)
language sql
stable
set search_path to 'public'
as $$
  select
    (select max(obs_date) from public.weather_observations),
    (select count(*) from public.weather_zones),
    (select count(*) from public.weather_observations
      where obs_date = (select max(obs_date) from public.weather_observations)),
    (select count(*) from public.predictions
      where obs_date = (select max(obs_date) from public.predictions));
$$;

grant execute on function public.get_weather_freshness() to anon, authenticated, service_role;
