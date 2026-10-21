-- =============================================================================
-- Jämn temperaturkurva i fuktpoängen
-- =============================================================================
-- PROBLEM (uppmätt 2026-10-20): moisture_score drar ett temperaturstraff som är
-- ett TRAPPSTEG (0 / 0,15 / 0,45). Vid 2 °C hoppar straffet från 0,15 till 0,45,
-- så en hel landsända nollas på en gång. 42 % av väderpunkterna fick 0,45 och
-- 43,5 % hade fuktvärdet exakt 0. Det ger den raka nord-syd-kanten på kartan.
--
-- ÅTGÄRD: samma tre nivåer, men sammanbundna med räta linjer (inga hopp).
--   Kallt:  8 °C -> 0   |  2 °C -> 0,15  |  -4 °C -> 0,45 (tak)
--   Varmt: 17 °C -> 0   | 24 °C -> 0,15  |  30 °C -> 0,45 (tak)
--   8-17 °C: inget straff. NULL: inget straff (som tidigare).
--
-- VIKTIGT: brytpunkterna är OKALIBRERADE startvärden som behåller de gamla
-- nivåerna (0,15 / 0,45); de är inte härledda ur någon källa. De ska prövas mot
-- fyndunderlag med historiskt väder. Straffet är fortfarande gemensamt för alla
-- arter (artspecifik temperatur är ett separat steg).
--
-- OMFATTNING: ändrar bara hur NYA väderdagar poängsätts. Redan beräknade dagar
-- och cachade kartrutor ändras inte. Se sista avsnittet för att tillämpa på
-- dagens publicerade dag (valfritt).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.temp_penalty(p_temp double precision)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_temp IS NULL THEN 0::double precision
    WHEN p_temp >= 8 AND p_temp <= 17 THEN 0::double precision
    WHEN p_temp < 8 THEN
      CASE WHEN p_temp >= 2  THEN 0.15 * (8 - p_temp) / 6
           WHEN p_temp > -4  THEN 0.15 + 0.30 * (2 - p_temp) / 6
           ELSE 0.45 END
    ELSE
      CASE WHEN p_temp <= 24 THEN 0.15 * (p_temp - 17) / 7
           WHEN p_temp < 30  THEN 0.15 + 0.30 * (p_temp - 24) / 6
           ELSE 0.45 END
  END::double precision
$function$;

REVOKE ALL ON FUNCTION public.temp_penalty(double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.temp_penalty(double precision) TO service_role;

COMMENT ON FUNCTION public.temp_penalty(double precision) IS
  'Kontinuerligt temperaturstraff (0-0,45) för moisture_score. Ersatte trappstegen 0/0,15/0,45. Brytpunkter okalibrerade, se migrationens huvud.';

-- Byt ut trappstegs-CASE i recompute_predictions mot temp_penalty(). Görs genom
-- att patcha den FAKTISKA, levande funktionsdefinitionen, så att inget annat i
-- funktionen ändras. Om uttrycket inte hittas avbryts migrationen med fel i
-- stället för att tyst göra ingenting.
DO $$
DECLARE
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef('public.recompute_predictions(date)'::regprocedure) INTO v_old;

  -- Idempotent: redan patchad => gör ingenting.
  IF position('public.temp_penalty(w.temp_mean)' IN v_old) > 0 THEN
    RAISE NOTICE 'recompute_predictions använder redan temp_penalty(); hoppar över.';
    RETURN;
  END IF;

  v_new := regexp_replace(
    v_old,
    '-\s*case\s+when\s+w\.temp_mean\s+is\s+null\s+then\s+0\s+'
    || 'when\s+w\.temp_mean\s*<\s*2\s+or\s+w\.temp_mean\s*>\s*24\s+then\s+0\.45\s+'
    || 'when\s+w\.temp_mean\s+between\s+8\s+and\s+17\s+then\s+0\s+'
    || 'else\s+0\.15\s+end',
    '- public.temp_penalty(w.temp_mean)',
    'i'
  );

  IF v_new = v_old THEN
    RAISE EXCEPTION 'temperaturstraffet hittades inte i recompute_predictions(date): den levande definitionen skiljer sig från förväntad. Klistra in pg_get_functiondef-utdata och anpassa mönstret.';
  END IF;
  IF position('public.temp_penalty(w.temp_mean)' IN v_new) = 0 THEN
    RAISE EXCEPTION 'patchen gav oväntad text; avbryter.';
  END IF;

  EXECUTE v_new;
END
$$;

-- Behörigheterna ska vara oförändrade efter CREATE OR REPLACE.
-- (recompute_predictions: bara service_role.)

-- =============================================================================
-- VALFRITT, KÖR SEPARAT OCH BARA EFTER GODKÄNNANDE: tillämpa på redan
-- publicerad dag. Kör inte detta som en del av migrationen.
--
-- Cachen för dagen töms och byggs om. Medan det pågår faller låg-zoom-rutor
-- tillbaka på live-beräkning, som kan ge tidsgränsfel. Kör därför utanför
-- trafik, och upprepa weather_finalize_daily() tills status = 'ok'.
--
--   UPDATE public.weather_observations
--      SET moisture_score = NULL
--    WHERE obs_date = (SELECT max(obs_date) FROM public.weather_observations);
--   SELECT public.weather_finalize_daily();   -- upprepa tills "status":"ok"
--
-- Gör man inget av detta slår den nya kurvan igenom automatiskt vid nästa
-- nattliga väderhämtning.
-- =============================================================================
