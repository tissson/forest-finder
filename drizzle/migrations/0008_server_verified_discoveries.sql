REVOKE ALL ON FUNCTION public.log_species_discovery(bigint,bigint,text,double precision,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_species_discovery(bigint,bigint,text,double precision,text,text) TO service_role;
REVOKE INSERT, UPDATE ON public.user_discoveries FROM anon, authenticated;
DROP POLICY IF EXISTS "Skapa egna fynd" ON public.user_discoveries;
CREATE TABLE public.discovery_identifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
 image_path text NOT NULL, species_id bigint NOT NULL REFERENCES public.species(id),
 confidence double precision NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
 expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
 consumed_at timestamptz
);
GRANT ALL ON public.discovery_identifications TO service_role;
REVOKE ALL ON public.discovery_identifications FROM anon, authenticated;
ALTER TABLE public.discovery_identifications ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.commit_verified_discovery(p_identification_id uuid, p_user_id uuid, p_species_id bigint, p_weather_zone_id bigint, p_notes text DEFAULT NULL, p_quantity text DEFAULT NULL)
RETURNS TABLE(discovery_id bigint, points_awarded integer, new_total_points integer, badge_unlocked text, badge_title text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.discovery_identifications%rowtype;
BEGIN
 SELECT * INTO v FROM public.discovery_identifications WHERE id=p_identification_id AND user_id=p_user_id FOR UPDATE;
 IF NOT FOUND OR v.consumed_at IS NOT NULL OR v.expires_at <= now() THEN RAISE EXCEPTION 'IDENTIFICATION_EXPIRED'; END IF;
 IF v.species_id <> p_species_id THEN RAISE EXCEPTION 'SPECIES_MISMATCH'; END IF;
 IF v.confidence < 0.70 THEN RAISE EXCEPTION 'LOW_CONFIDENCE'; END IF;
 IF p_notes IS NOT NULL AND length(p_notes)>500 THEN RAISE EXCEPTION 'NOTES_TOO_LONG'; END IF;
 IF p_quantity IS NOT NULL AND length(p_quantity)>100 THEN RAISE EXCEPTION 'QUANTITY_TOO_LONG'; END IF;
 IF v.image_path NOT LIKE p_user_id::text || '/%' THEN RAISE EXCEPTION 'INVALID_IMAGE_OWNER'; END IF;
 PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
 PERFORM set_config('request.jwt.claims', json_build_object('sub',p_user_id::text,'role','authenticated')::text, true);
 RETURN QUERY SELECT * FROM public.log_species_discovery(v.species_id,p_weather_zone_id,v.image_path,v.confidence,p_notes,p_quantity);
 UPDATE public.discovery_identifications SET consumed_at=now() WHERE id=v.id;
END; $$;
REVOKE ALL ON FUNCTION public.commit_verified_discovery(uuid,uuid,bigint,bigint,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_verified_discovery(uuid,uuid,bigint,bigint,text,text) TO service_role;
COMMENT ON FUNCTION public.commit_verified_discovery(uuid,uuid,bigint,bigint,text,text) IS 'Server-only: consumes server-verified identification once; confidence threshold 0.70 is provisional pending photo trial approval.';
COMMENT ON FUNCTION public.log_species_discovery(bigint,bigint,text,double precision,text,text) IS 'Server-only legacy award implementation: authenticated execution revoked; called exclusively after server-verified identification.';