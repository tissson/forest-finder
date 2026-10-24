-- Read-only regression checks for the approved tile forest-term switch.
-- Each boolean must be true; no computation, cache writes or profile updates.
SELECT
  position('0.30 * exp(-power((coalesce(wz.forest_share, wz.forest_cover) - v_fo) / v_ft, 2))' in d) > 0 AS forest_share_with_slu_fallback,
  position('WHERE sc.score >= 0.20' in d) > 0 AS threshold_still_020,
  position('WHEN z = 7 THEN 2 ELSE 1' in d) > 0 AS zoom7_step_still_2
FROM (SELECT pg_get_functiondef('public.compute_prediction_tile(integer,integer,integer,bigint,date)'::regprocedure) AS d) f;