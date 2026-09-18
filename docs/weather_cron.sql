-- Nattlig väder-ingest + prognosberäkning
-- Körs redan i projektet (applicerad som migration), men finns här som referens.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('nightly-weather-ingest')
where exists (select 1 from cron.job where jobname = 'nightly-weather-ingest');

select cron.schedule(
  'nightly-weather-ingest',
  '0 2 * * *',                     -- 02:00 UTC varje natt
  $$
  select net.http_post(
    url := 'https://project--af8c4c78-4a38-4438-88cc-3e4c04f86b10-dev.lovable.app/api/public/ingest-weather',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <WEATHER_CRON_SECRET>'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- Kontrollera jobbet och dess körningar:
-- select * from cron.job where jobname = 'nightly-weather-ingest';
-- select * from cron.job_run_details order by start_time desc limit 10;

-- Kör hämtningen manuellt när som helst (samma anrop som cron gör).
-- Räkna om prognoser utan ny väderhämtning:
-- select public.recompute_predictions();

-- Färskhetskoll:
-- select * from public.get_weather_freshness();
