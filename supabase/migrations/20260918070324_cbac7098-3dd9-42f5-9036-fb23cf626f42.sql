
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('nightly-weather-ingest')
where exists (select 1 from cron.job where jobname = 'nightly-weather-ingest');

select cron.schedule(
  'nightly-weather-ingest',
  '0 2 * * *',
  $$
  select net.http_post(
    url := 'https://project--af8c4c78-4a38-4438-88cc-3e4c04f86b10-dev.lovable.app/api/public/ingest-weather',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer 53ae8925d875f7cb2ab1dcd61fcad190597ed960ca419cc4'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
