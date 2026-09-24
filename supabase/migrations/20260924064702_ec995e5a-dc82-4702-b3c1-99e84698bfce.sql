ALTER TABLE public.forest_cover_staging ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.forest_cover_staging TO service_role;