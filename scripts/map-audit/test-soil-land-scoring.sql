-- Read-only production adoption checks. Every result must be true.
SELECT p.proname,
       position('wz.soil_wetness_land IS NULL' in pg_get_functiondef(p.oid)) > 0 AS weather_only_null_fallback,
       position('0.4 * wz.soil_wetness_land END' in pg_get_functiondef(p.oid)) > 0 AS land_weight_04,
       position('0.6 * coalesce(w.moisture_score, 0)' in pg_get_functiondef(p.oid)) > 0 AS weather_weight_06,
       position('>= 0.20' in pg_get_functiondef(p.oid)) > 0 AS threshold_020,
       position('wz.soil_wetness IS NULL' in pg_get_functiondef(p.oid)) = 0 AS old_soil_term_absent
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('compute_moisture_tile','compute_prediction_tile');