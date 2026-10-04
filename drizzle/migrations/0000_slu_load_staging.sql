-- Mellanlagring för SLU-laddning (nationell mosaik, 2x2 km, EPSG:3006). Endast för underhåll.
CREATE TABLE IF NOT EXISTS public.slu_load_staging (
  kind text NOT NULL,
  x double precision NOT NULL,
  y double precision NOT NULL,
  v double precision NOT NULL
);
GRANT ALL ON public.slu_load_staging TO service_role;
ALTER TABLE public.slu_load_staging ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.slu_load_staging IS 'Mellanlagring för scripts/load-slu-rasters.sh (kind = volume|spruce|pine|birch|soil). Ej åtkomlig via API.';