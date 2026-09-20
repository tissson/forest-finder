CREATE POLICY "Systemet hanterar artprofiler"
ON public.species_habitat_profiles
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);