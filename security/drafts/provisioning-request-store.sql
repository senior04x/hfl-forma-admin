-- DRAFT ONLY. Backend-only durable reservations; contains no passwords/tokens.
BEGIN;
CREATE TABLE public.organization_provisioning_requests (
  actor_id uuid NOT NULL, request_id uuid NOT NULL,
  payload jsonb NOT NULL,
  email text NOT NULL UNIQUE, slug text NOT NULL UNIQUE,
  phase text NOT NULL DEFAULT 'reserved' CHECK (phase IN ('reserved','auth_creating','auth_created','complete')),
  lease uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  lease_until timestamptz NOT NULL DEFAULT clock_timestamp() + interval '5 minutes',
  auth_user_id uuid UNIQUE, organization_id bigint,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(actor_id,request_id),
  CHECK ((phase IN ('auth_created','complete')) = (auth_user_id IS NOT NULL)),
  CHECK ((phase = 'complete') = (organization_id IS NOT NULL))
);
ALTER TABLE public.organization_provisioning_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organization_provisioning_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.organization_provisioning_requests TO service_role;
CREATE POLICY provisioning_backend ON public.organization_provisioning_requests
  TO service_role USING (true) WITH CHECK (true);

CREATE FUNCTION public.claim_organization_provisioning(p_actor uuid,p_request uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE r public.organization_provisioning_requests; inserted boolean;
BEGIN
  IF p_actor IS NULL OR p_request IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
    OR NOT (p_payload ?& ARRAY['name','email','slug','logoUrl'])
    OR p_payload - ARRAY['name','email','slug','logoUrl'] <> '{}'::jsonb
    OR jsonb_typeof(p_payload->'name') <> 'string' OR jsonb_typeof(p_payload->'email') <> 'string'
    OR jsonb_typeof(p_payload->'slug') <> 'string'
    OR jsonb_typeof(p_payload->'logoUrl') NOT IN ('string','null')
    OR length(p_payload->>'name') NOT BETWEEN 1 AND 120
    OR length(p_payload->>'email') NOT BETWEEN 3 AND 254
    OR p_payload->>'email' <> lower(trim(p_payload->>'email'))
    OR length(p_payload->>'slug') NOT BETWEEN 1 AND 80
    OR p_payload->>'slug' !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'INVALID_PROVISIONING_INPUT' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.organization_provisioning_requests(actor_id,request_id,payload,email,slug)
    VALUES(p_actor,p_request,p_payload,p_payload->>'email',p_payload->>'slug')
    ON CONFLICT(actor_id,request_id) DO NOTHING;
  inserted := FOUND;
  SELECT * INTO STRICT r FROM public.organization_provisioning_requests
    WHERE actor_id=p_actor AND request_id=p_request FOR UPDATE;
  IF r.payload <> p_payload THEN RAISE EXCEPTION 'PROVISIONING_CONFLICT' USING ERRCODE='23505'; END IF;
  IF r.phase='complete' THEN
    RETURN jsonb_build_object('state','complete','organizationId',r.organization_id);
  END IF;
  IF NOT inserted THEN
    IF r.phase='auth_creating' THEN RETURN jsonb_build_object('state','auth_creating'); END IF;
    IF r.lease_until > clock_timestamp() THEN RETURN jsonb_build_object('state','busy'); END IF;
    UPDATE public.organization_provisioning_requests
      SET lease=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'
      WHERE actor_id=p_actor AND request_id=p_request RETURNING * INTO r;
  END IF;
  RETURN jsonb_build_object('state',CASE WHEN r.phase='reserved' THEN 'new' ELSE 'auth_created' END,
    'lease',r.lease,'userId',r.auth_user_id);
END $$;

CREATE FUNCTION public.advance_organization_provisioning(p_lease uuid,p_phase text,p_user uuid DEFAULT NULL,p_org bigint DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE r public.organization_provisioning_requests;
BEGIN
  SELECT * INTO r FROM public.organization_provisioning_requests WHERE lease=p_lease FOR UPDATE;
  IF NOT FOUND OR r.lease_until <= clock_timestamp() THEN
    RAISE EXCEPTION 'INVALID_PROVISIONING_LEASE' USING ERRCODE='22023';
  END IF;
  IF p_phase='auth_creating' AND r.phase='reserved' AND p_user IS NULL AND p_org IS NULL THEN
    UPDATE public.organization_provisioning_requests SET phase=p_phase WHERE lease=p_lease;
  ELSIF p_phase='auth_created' AND r.phase='auth_creating' AND p_user IS NOT NULL AND p_org IS NULL THEN
    UPDATE public.organization_provisioning_requests SET phase=p_phase,auth_user_id=p_user WHERE lease=p_lease;
  ELSIF p_phase='complete' AND r.phase='auth_created' AND p_user IS NULL AND p_org>0 THEN
    UPDATE public.organization_provisioning_requests SET phase=p_phase,organization_id=p_org WHERE lease=p_lease;
  ELSE
    RAISE EXCEPTION 'INVALID_PROVISIONING_TRANSITION' USING ERRCODE='22023';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.claim_organization_provisioning(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.advance_organization_provisioning(uuid,text,uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_organization_provisioning(uuid,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.advance_organization_provisioning(uuid,text,uuid,bigint) TO service_role;
COMMIT;
