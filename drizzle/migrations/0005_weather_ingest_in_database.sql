-- Väderhämtningen flyttas in i databasen (pg_net). Open-Meteo svarade
-- 429 "Daily API request limit exceeded" på alla anrop från appservern
-- (delade adresser), men svarar normalt på anrop från databasen.

CREATE TABLE public.weather_ingest_pending (
  request_id bigint PRIMARY KEY,
  obs_date date NOT NULL,
  zone_ids bigint[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.weather_ingest_pending TO service_role;
ALTER TABLE public.weather_ingest_pending ENABLE ROW LEVEL SECURITY;

-- Varje svar från Open-Meteo loggas, så att fel syns i efterhand.
CREATE TABLE public.weather_ingest_log (
  id bigserial PRIMARY KEY,
  obs_date date NOT NULL,
  request_id bigint,
  zones integer NOT NULL,
  status_code integer,
  ok boolean NOT NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.weather_ingest_log TO service_role;
GRANT USAGE ON SEQUENCE public.weather_ingest_log_id_seq TO service_role;
ALTER TABLE public.weather_ingest_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.weather_ingest_step(p_max_requests integer DEFAULT 4, p_chunk integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_date date := (now() AT TIME ZONE 'UTC')::date;
  r record; v_json jsonb; v_ok integer := 0; v_err integer := 0; v_sent integer := 0;
  v_ids bigint[]; v_lat text; v_lon text; v_req bigint;
BEGIN
  -- 1. Ta hand om färdiga svar (och svar som aldrig kom inom 3 min).
  FOR r IN
    SELECT p.request_id, p.obs_date, p.zone_ids, p.created_at, h.status_code, h.timed_out, h.error_msg, h.content
    FROM public.weather_ingest_pending p
    LEFT JOIN net._http_response h ON h.id = p.request_id
    WHERE h.id IS NOT NULL OR p.created_at < now() - interval '3 minutes'
  LOOP
    IF r.status_code = 200 THEN
      BEGIN
        v_json := r.content::jsonb;
        IF jsonb_typeof(v_json) = 'object' THEN v_json := jsonb_build_array(v_json); END IF;
        INSERT INTO public.weather_observations (weather_zone_id, obs_date, precip_7d_sum, precip_10d_sum, temp_mean)
        SELECT r.zone_ids[e.i], r.obs_date,
          (SELECT round(coalesce(sum(nullif(v.val,'null')::numeric),0),1) FROM jsonb_array_elements_text(e.d->'daily'->'precipitation_sum') WITH ORDINALITY v(val,k)
             WHERE k > jsonb_array_length(e.d->'daily'->'precipitation_sum') - 7),
          (SELECT round(coalesce(sum(nullif(v.val,'null')::numeric),0),1) FROM jsonb_array_elements_text(e.d->'daily'->'precipitation_sum') WITH ORDINALITY v(val,k)
             WHERE k > jsonb_array_length(e.d->'daily'->'precipitation_sum') - 10),
          (SELECT round(avg(nullif(v.val,'null')::numeric),1) FROM jsonb_array_elements_text(e.d->'daily'->'temperature_2m_mean') v(val))
        FROM jsonb_array_elements(v_json) WITH ORDINALITY e(d, i)
        WHERE e.i <= array_length(r.zone_ids,1) AND e.d->'daily'->'precipitation_sum' IS NOT NULL
        ON CONFLICT (weather_zone_id, obs_date) DO UPDATE
          SET precip_7d_sum = EXCLUDED.precip_7d_sum, precip_10d_sum = EXCLUDED.precip_10d_sum,
              temp_mean = EXCLUDED.temp_mean, moisture_score = NULL;
        INSERT INTO public.weather_ingest_log (obs_date, request_id, zones, status_code, ok)
        VALUES (r.obs_date, r.request_id, array_length(r.zone_ids,1), 200, true);
        v_ok := v_ok + 1;
      EXCEPTION WHEN others THEN
        INSERT INTO public.weather_ingest_log (obs_date, request_id, zones, status_code, ok, error)
        VALUES (r.obs_date, r.request_id, array_length(r.zone_ids,1), 200, false, 'Tolkningsfel: ' || SQLERRM);
        v_err := v_err + 1;
      END;
    ELSE
      INSERT INTO public.weather_ingest_log (obs_date, request_id, zones, status_code, ok, error)
      VALUES (r.obs_date, r.request_id, array_length(r.zone_ids,1), r.status_code, false,
        CASE WHEN r.status_code IS NULL AND r.error_msg IS NULL THEN 'Inget svar inom 3 min'
             ELSE left(coalesce(r.error_msg, r.content, ''), 300) END);
      v_err := v_err + 1;
    END IF;
    DELETE FROM public.weather_ingest_pending WHERE request_id = r.request_id;
  END LOOP;

  -- 2. Skicka nya anrop för provpunkter som saknar dagens väder.
  IF (SELECT count(*) FROM public.weather_ingest_pending) = 0 THEN
    FOR r IN
      SELECT array_agg(id ORDER BY id) ids, string_agg(round(center_lat::numeric,4)::text, ',' ORDER BY id) lat,
             string_agg(round(center_lon::numeric,4)::text, ',' ORDER BY id) lon
      FROM (
        SELECT wz.id, wz.center_lat, wz.center_lon, (row_number() OVER (ORDER BY wz.id) - 1) / p_chunk AS grp
        FROM public.weather_zones wz
        WHERE wz.is_weather_sample
          AND NOT EXISTS (SELECT 1 FROM public.weather_observations o WHERE o.weather_zone_id = wz.id AND o.obs_date = v_date)
        ORDER BY wz.id LIMIT p_max_requests * p_chunk
      ) s GROUP BY grp
    LOOP
      v_req := net.http_get(
        'https://api.open-meteo.com/v1/forecast?latitude=' || r.lat || '&longitude=' || r.lon ||
        '&daily=precipitation_sum,temperature_2m_mean&past_days=10&forecast_days=1&timezone=UTC',
        timeout_milliseconds := 30000);
      INSERT INTO public.weather_ingest_pending (request_id, obs_date, zone_ids) VALUES (v_req, v_date, r.ids);
      v_sent := v_sent + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('obs_date', v_date, 'responses_ok', v_ok, 'responses_failed', v_err, 'requests_sent', v_sent,
    'observations', (SELECT count(*) FROM public.weather_observations WHERE obs_date = v_date));
END;
$function$;
REVOKE ALL ON FUNCTION public.weather_ingest_step(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.weather_ingest_step(integer, integer) TO service_role;

-- Hälsokontroll: kastar fel (=> jobbet markeras "failed") om dagens väder
-- inte kom in eller om något anrop gav fel under natten.
CREATE OR REPLACE FUNCTION public.weather_ingest_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_date date := (now() AT TIME ZONE 'UTC')::date;
  v_obs integer; v_samples integer; v_failed integer; v_first text; v_ok integer;
BEGIN
  SELECT count(*) INTO v_obs FROM public.weather_observations WHERE obs_date = v_date;
  SELECT count(*) INTO v_samples FROM public.weather_zones WHERE is_weather_sample;
  SELECT count(*) FILTER (WHERE NOT ok), count(*) FILTER (WHERE ok), min(error) FILTER (WHERE NOT ok)
    INTO v_failed, v_ok, v_first FROM public.weather_ingest_log WHERE obs_date = v_date;
  IF v_obs < v_samples THEN
    RAISE EXCEPTION 'VÄDERHÄMTNING MISSLYCKAD %: % av % provpunkter, % felande anrop, första fel: %',
      v_date, v_obs, v_samples, v_failed, coalesce(v_first, '-');
  END IF;
  IF v_failed > 0 THEN
    RAISE EXCEPTION 'VÄDERHÄMTNING KLAR MEN MED FEL %: % felande av % anrop, första fel: %', v_date, v_failed, v_failed + v_ok, v_first;
  END IF;
  RETURN jsonb_build_object('obs_date', v_date, 'observations', v_obs, 'requests_ok', v_ok);
END;
$function$;
REVOKE ALL ON FUNCTION public.weather_ingest_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.weather_ingest_health() TO service_role;