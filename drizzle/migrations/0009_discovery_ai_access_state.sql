CREATE TABLE public.discovery_ai_access_state (id boolean PRIMARY KEY DEFAULT true CHECK(id), message text NOT NULL, http_status integer NOT NULL, blocked_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.discovery_ai_access_state TO service_role;
REVOKE ALL ON public.discovery_ai_access_state FROM anon, authenticated;
ALTER TABLE public.discovery_ai_access_state ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.discovery_ai_access_state IS 'Persist terminal AI access denials across reloads and restarts; remove only after access is restored, never automatically probe.';