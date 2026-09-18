-- ============================================================================
-- Svamp- & Bärprognos -- komplett databasschema (Supabase / Lovable Cloud)
-- ============================================================================
-- Kan köras rakt av i SQL-editorn. Allt är idempotent nog för en förstagångs-
-- körning: tabeller, GRANTs, RLS-policys, funktioner för prognos/fuktighet
-- samt fyndregistrering med poäng och badges.
--
-- INTEGRITET: exakta koordinater lagras ALDRIG. Klienten slår upp
-- weather_zone_id via lookup_weather_zone(lat, lon) (5x5 km-ruta) och skickar
-- bara zon-id vidare.
-- ============================================================================

-- ---------------------------------------------------------------- referens --

create table if not exists public.species (
  id            bigint generated always as identity primary key,
  slug          text not null unique,
  name_sv       text not null,
  tier          text not null default 'free' check (tier in ('free', 'premium')),
  season_start  date,
  season_end    date,
  created_at    timestamptz not null default now()
);

grant select on public.species to anon, authenticated;
grant all on public.species to service_role;
alter table public.species enable row level security;

drop policy if exists "Arter är publika" on public.species;
create policy "Arter är publika" on public.species for select to anon, authenticated using (true);

-- 5x5 km-rutor. grid_x/grid_y beräknas av lookup_weather_zone().
create table if not exists public.weather_zones (
  id          bigint generated always as identity primary key,
  grid_x      integer not null,
  grid_y      integer not null,
  center_lat  double precision not null,
  center_lon  double precision not null,
  created_at  timestamptz not null default now(),
  unique (grid_x, grid_y)
);

grant select on public.weather_zones to anon, authenticated;
grant all on public.weather_zones to service_role;
alter table public.weather_zones enable row level security;

drop policy if exists "Zoner är publika" on public.weather_zones;
create policy "Zoner är publika" on public.weather_zones for select to anon, authenticated using (true);

-- ------------------------------------------------------- väder & prognoser --

create table if not exists public.weather_observations (
  weather_zone_id  bigint not null references public.weather_zones(id) on delete cascade,
  obs_date         date not null,
  precip_7d_sum    double precision,
  precip_10d_sum   double precision,
  temp_mean        double precision,
  moisture_score   double precision check (moisture_score between 0 and 1),
  primary key (weather_zone_id, obs_date)
);

grant select on public.weather_observations to anon, authenticated;
grant all on public.weather_observations to service_role;
alter table public.weather_observations enable row level security;

drop policy if exists "Väderdata är publik" on public.weather_observations;
create policy "Väderdata är publik" on public.weather_observations
  for select to anon, authenticated using (true);

create table if not exists public.predictions (
  id               bigint generated always as identity primary key,
  species_id       bigint not null references public.species(id) on delete cascade,
  weather_zone_id  bigint not null references public.weather_zones(id) on delete cascade,
  obs_date         date not null default current_date,
  score_total      double precision not null check (score_total between 0 and 1),
  score_soil       double precision,
  score_forest     double precision,
  score_weather    double precision,
  created_at       timestamptz not null default now(),
  unique (species_id, weather_zone_id, obs_date)
);

create index if not exists predictions_lookup_idx
  on public.predictions (species_id, obs_date, score_total desc);

grant select on public.predictions to anon, authenticated;
grant all on public.predictions to service_role;
alter table public.predictions enable row level security;

drop policy if exists "Prognoser är publika" on public.predictions;
create policy "Prognoser är publika" on public.predictions
  for select to anon, authenticated using (true);

-- ------------------------------------------------------------- användardata --

create table if not exists public.user_profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null default 'Plockare',
  avatar_url    text,
  total_points  integer not null default 0,
  level         integer not null default 1,
  is_premium    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

grant select, insert, update on public.user_profiles to authenticated;
grant all on public.user_profiles to service_role;
alter table public.user_profiles enable row level security;

drop policy if exists "Läs egen profil" on public.user_profiles;
create policy "Läs egen profil" on public.user_profiles
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Skapa egen profil" on public.user_profiles;
create policy "Skapa egen profil" on public.user_profiles
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Uppdatera egen profil" on public.user_profiles;
create policy "Uppdatera egen profil" on public.user_profiles
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.user_discoveries (
  id               bigint generated always as identity primary key,
  user_id          uuid not null references auth.users(id) on delete cascade,
  species_id       bigint not null references public.species(id),
  weather_zone_id  bigint not null references public.weather_zones(id),
  image_url        text not null,
  ai_confidence    double precision not null check (ai_confidence between 0 and 1),
  points_awarded   integer not null default 0,
  notes            text check (char_length(notes) <= 500),
  quantity         text check (char_length(quantity) <= 100),
  created_at       timestamptz not null default now()
);

create index if not exists user_discoveries_user_idx
  on public.user_discoveries (user_id, created_at desc);

grant select, insert, delete on public.user_discoveries to authenticated;
grant all on public.user_discoveries to service_role;
alter table public.user_discoveries enable row level security;

drop policy if exists "Läs egna fynd" on public.user_discoveries;
create policy "Läs egna fynd" on public.user_discoveries
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Skapa egna fynd" on public.user_discoveries;
create policy "Skapa egna fynd" on public.user_discoveries
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Radera egna fynd" on public.user_discoveries;
create policy "Radera egna fynd" on public.user_discoveries
  for delete to authenticated using (auth.uid() = user_id);

create table if not exists public.user_badges (
  user_id      uuid not null references auth.users(id) on delete cascade,
  badge_key    text not null,
  title        text not null,
  description  text,
  icon_url     text,
  unlocked_at  timestamptz not null default now(),
  primary key (user_id, badge_key)
);

grant select on public.user_badges to authenticated;
grant all on public.user_badges to service_role;
alter table public.user_badges enable row level security;

drop policy if exists "Läs egna badges" on public.user_badges;
create policy "Läs egna badges" on public.user_badges
  for select to authenticated using (auth.uid() = user_id);

create table if not exists public.weekly_challenges (
  id            bigint generated always as identity primary key,
  year          integer not null,
  week_number   integer not null,
  species_id    bigint not null references public.species(id),
  bonus_points  integer not null default 50,
  badge_key     text not null,
  start_date    date not null,
  end_date      date not null,
  unique (year, week_number)
);

grant select on public.weekly_challenges to anon, authenticated;
grant all on public.weekly_challenges to service_role;
alter table public.weekly_challenges enable row level security;

drop policy if exists "Utmaningar är publika" on public.weekly_challenges;
create policy "Utmaningar är publika" on public.weekly_challenges
  for select to anon, authenticated using (true);

-- --------------------------------------------------- profil vid registrering --

-- Profilen skapas lat (vid första anropet) i stället för via en trigger på
-- auth.users -- auth-schemat ägs av plattformen och rörs inte.
create or replace function public.get_or_create_profile()
returns public.user_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_profile public.user_profiles;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED: Du måste vara inloggad.';
  end if;

  insert into public.user_profiles (user_id, display_name)
  values (v_user, coalesce(split_part((auth.jwt() ->> 'email'), '@', 1), 'Plockare'))
  on conflict (user_id) do nothing;

  select * into v_profile from public.user_profiles where user_id = v_user;
  return v_profile;
end;
$$;

grant execute on function public.get_or_create_profile() to authenticated;

-- ------------------------------------------------------------- 5x5 km-rutor --

-- 5 km i latitud ~ 0.044966 grader. Longitudsteget skalas med cos(lat) så att
-- rutorna förblir ungefär 5x5 km över hela Sverige.
create or replace function public.lookup_weather_zone(p_lat double precision, p_lon double precision)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lat_step  double precision := 5.0 / 111.32;
  v_lon_step  double precision;
  v_x integer;
  v_y integer;
  v_id bigint;
begin
  if p_lat is null or p_lon is null or p_lat < -90 or p_lat > 90 or p_lon < -180 or p_lon > 180 then
    raise exception 'Ogiltig koordinat';
  end if;

  v_lon_step := 5.0 / (111.32 * greatest(cos(radians(p_lat)), 0.01));
  v_y := floor(p_lat / v_lat_step)::int;
  v_x := floor(p_lon / v_lon_step)::int;

  select id into v_id from public.weather_zones where grid_x = v_x and grid_y = v_y;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.weather_zones (grid_x, grid_y, center_lat, center_lon)
  values (v_x, v_y, (v_y + 0.5) * v_lat_step, (v_x + 0.5) * v_lon_step)
  on conflict (grid_x, grid_y) do update set grid_x = excluded.grid_x
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.lookup_weather_zone(double precision, double precision) to anon, authenticated;

-- ------------------------------------------------------- prognos & fuktighet --

create or replace function public.get_predictions(
  p_species_id bigint,
  p_min_lon double precision,
  p_min_lat double precision,
  p_max_lon double precision,
  p_max_lat double precision,
  p_obs_date date default null,
  p_min_score double precision default 0.05,
  p_limit integer default 2000
)
returns table (
  lon double precision,
  lat double precision,
  obs_date date,
  score_total double precision,
  score_soil double precision,
  score_forest double precision,
  score_weather double precision
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_tier text;
  v_premium boolean;
  v_date date;
begin
  select s.tier into v_tier from public.species s where s.id = p_species_id;
  if v_tier is null then
    raise exception 'Okänd art';
  end if;

  if v_tier = 'premium' then
    select coalesce(up.is_premium, false) into v_premium
    from public.user_profiles up where up.user_id = auth.uid();
    if not coalesce(v_premium, false) then
      raise exception 'PREMIUM_REQUIRED: Det här lagret ingår i premium.';
    end if;
  end if;

  v_date := coalesce(
    p_obs_date,
    (select max(p.obs_date) from public.predictions p where p.species_id = p_species_id)
  );

  return query
  select z.center_lon, z.center_lat, p.obs_date,
         p.score_total, p.score_soil, p.score_forest, p.score_weather
  from public.predictions p
  join public.weather_zones z on z.id = p.weather_zone_id
  where p.species_id = p_species_id
    and p.obs_date = v_date
    and p.score_total >= coalesce(p_min_score, 0)
    and z.center_lon between p_min_lon and p_max_lon
    and z.center_lat between p_min_lat and p_max_lat
  order by p.score_total desc
  limit least(greatest(coalesce(p_limit, 2000), 1), 25000);
end;
$$;

grant execute on function public.get_predictions(bigint, double precision, double precision, double precision, double precision, date, double precision, integer) to anon, authenticated, service_role;

create or replace function public.get_moisture_layer(
  p_min_lon double precision,
  p_min_lat double precision,
  p_max_lon double precision,
  p_max_lat double precision,
  p_obs_date date default null,
  p_min_score double precision default 0,
  p_limit integer default 2000
)
returns table (
  lon double precision,
  lat double precision,
  obs_date date,
  moisture_score double precision,
  precip_7d_sum double precision,
  precip_10d_sum double precision,
  temp_mean double precision
)
language sql
stable
set search_path = public
as $$
  select z.center_lon, z.center_lat, w.obs_date,
         w.moisture_score, w.precip_7d_sum, w.precip_10d_sum, w.temp_mean
  from public.weather_observations w
  join public.weather_zones z on z.id = w.weather_zone_id
  where w.obs_date = coalesce(p_obs_date, (select max(obs_date) from public.weather_observations))
    and coalesce(w.moisture_score, 0) >= coalesce(p_min_score, 0)
    and z.center_lon between p_min_lon and p_max_lon
    and z.center_lat between p_min_lat and p_max_lat
  order by w.moisture_score desc nulls last
  limit least(greatest(coalesce(p_limit, 2000), 1), 25000);
$$;

grant execute on function public.get_moisture_layer(double precision, double precision, double precision, double precision, date, double precision, integer) to anon, authenticated, service_role;

-- ----------------------------------------------------------- fyndregistrering --

create or replace function public.log_species_discovery(
  p_species_id bigint,
  p_weather_zone_id bigint,
  p_image_url text,
  p_ai_confidence double precision,
  p_notes text default null,
  p_quantity text default null
)
returns table (
  discovery_id bigint,
  points_awarded integer,
  new_total_points integer,
  badge_unlocked text,
  badge_title text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_points integer := 10;
  v_total integer;
  v_id bigint;
  v_badge text;
  v_badge_title text;
  v_count integer;
  v_challenge public.weekly_challenges%rowtype;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED: Du måste vara inloggad för att registrera fynd.';
  end if;
  if coalesce(p_ai_confidence, 0) < 0.7 then
    raise exception 'LOW_CONFIDENCE: Bilden kunde inte bekräftas säkert nog.';
  end if;

  insert into public.user_profiles (user_id) values (v_user) on conflict (user_id) do nothing;

  -- Veckans utmaning ger bonus.
  select * into v_challenge from public.weekly_challenges
  where species_id = p_species_id and current_date between start_date and end_date
  limit 1;

  if v_challenge.id is not null then
    v_points := v_points + v_challenge.bonus_points;
  end if;

  insert into public.user_discoveries
    (user_id, species_id, weather_zone_id, image_url, ai_confidence, points_awarded, notes, quantity)
  values
    (v_user, p_species_id, p_weather_zone_id, p_image_url, p_ai_confidence, v_points,
     nullif(btrim(coalesce(p_notes, '')), ''), nullif(btrim(coalesce(p_quantity, '')), ''))
  returning id into v_id;

  update public.user_profiles
  set total_points = total_points + v_points,
      level = greatest(1, ((total_points + v_points) / 100) + 1),
      updated_at = now()
  where user_id = v_user
  returning total_points into v_total;

  select count(*) into v_count from public.user_discoveries where user_id = v_user;

  if v_count = 1 then
    v_badge := 'first_find';
    v_badge_title := 'Första fyndet';
  elsif v_count = 10 then
    v_badge := 'ten_finds';
    v_badge_title := 'Tio fynd i korgen';
  elsif v_challenge.id is not null then
    v_badge := v_challenge.badge_key;
    v_badge_title := 'Veckans utmaning';
  end if;

  if v_badge is not null then
    insert into public.user_badges (user_id, badge_key, title)
    values (v_user, v_badge, v_badge_title)
    on conflict (user_id, badge_key) do nothing;
    if not found then
      v_badge := null;
      v_badge_title := null;
    end if;
  end if;

  return query select v_id, v_points, v_total, v_badge, v_badge_title;
end;
$$;

grant execute on function public.log_species_discovery(bigint, bigint, text, double precision, text, text) to authenticated;

-- ------------------------------------------------------------------ bildlager --

-- Hinken 'discoveries' är PRIVAT (10 MB per fil) och skapas via
-- Lovable Cloud/Supabase Storage-gränssnittet, inte via SQL.
-- Bilder visas med tidsbegränsade signerade länkar (se getDiscoveryImageUrl).

drop policy if exists "Läs egna fyndbilder" on storage.objects;
create policy "Läs egna fyndbilder" on storage.objects
  for select to authenticated
  using (bucket_id = 'discoveries' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Ladda upp egna fyndbilder" on storage.objects;
create policy "Ladda upp egna fyndbilder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'discoveries' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Radera egna fyndbilder" on storage.objects;
create policy "Radera egna fyndbilder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'discoveries' and (storage.foldername(name))[1] = auth.uid()::text);

-- --------------------------------------------------------------- startdata --

insert into public.species (slug, name_sv, tier, season_start, season_end) values
  ('kantarell',        'Kantarell',         'free',    '2026-06-15', '2026-10-31'),
  ('trattkantarell',   'Trattkantarell',    'free',    '2026-08-15', '2026-11-30'),
  ('blabar',           'Blåbär',            'free',    '2026-07-01', '2026-09-15'),
  ('lingon',           'Lingon',            'free',    '2026-08-15', '2026-10-15'),
  ('karl-johan',       'Karl Johan',        'premium', '2026-07-15', '2026-10-31'),
  ('hjortron',         'Hjortron',          'premium', '2026-07-10', '2026-08-20')
on conflict (slug) do nothing;
