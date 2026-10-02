-- DRAFT ONLY: requires protected admin_users and an authorized activation endpoint.
-- Never bulk-bind by email or copy legacy passwords.
BEGIN;
CREATE TABLE public.organizer_auth_bindings (
  auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  profile_id bigint NOT NULL UNIQUE REFERENCES public.organization_users(id) ON DELETE RESTRICT,
  organization_id bigint NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  role text NOT NULL DEFAULT 'user' CHECK(role='user'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.organizer_auth_bindings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organizer_auth_bindings FROM PUBLIC,anon,authenticated;
GRANT SELECT(auth_user_id,profile_id,organization_id,role) ON public.organizer_auth_bindings TO authenticated;
GRANT SELECT,INSERT ON public.organizer_auth_bindings TO service_role;
CREATE POLICY organizer_binding_self ON public.organizer_auth_bindings
  FOR SELECT TO authenticated USING(auth_user_id=auth.uid());
CREATE POLICY organizer_binding_backend ON public.organizer_auth_bindings
  TO service_role USING(true) WITH CHECK(true);

CREATE FUNCTION public.bind_organizer_auth(p_actor uuid,p_user uuid,p_profile bigint,p_org bigint)
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE profile record; auth_email text; existing record;
BEGIN
 IF p_actor IS NULL OR p_user IS NULL OR p_profile IS NULL OR p_profile<=0 OR p_org IS NULL OR p_org<=0 THEN
  RAISE EXCEPTION 'INVALID_BINDING' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=p_actor AND role IN ('org_admin','super_admin') AND organization_id=p_org) THEN
  RAISE EXCEPTION 'ADMIN_ACCESS_DENIED' USING ERRCODE='42501';
 END IF;
 SELECT email INTO auth_email FROM auth.users WHERE id=p_user AND email_confirmed_at IS NOT NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTH_IDENTITY_UNVERIFIED' USING ERRCODE='22023'; END IF;
 SELECT id,email,role,organization_id INTO profile FROM public.organization_users WHERE id=p_profile FOR UPDATE;
 IF NOT FOUND OR profile.organization_id<>p_org OR profile.organization_id IS NULL
  OR profile.role IS DISTINCT FROM 'user' OR profile.email IS NULL OR lower(trim(profile.email))<>lower(auth_email) THEN
  RAISE EXCEPTION 'PROFILE_IDENTITY_MISMATCH' USING ERRCODE='22023';
 END IF;
 SELECT * INTO existing FROM public.organizer_auth_bindings WHERE profile_id=p_profile;
 IF FOUND THEN
  IF existing.auth_user_id=p_user AND existing.organization_id=p_org THEN RETURN existing.profile_id; END IF;
  RAISE EXCEPTION 'BINDING_CONFLICT' USING ERRCODE='23505';
 END IF;
 INSERT INTO public.organizer_auth_bindings(auth_user_id,profile_id,organization_id) VALUES(p_user,p_profile,p_org);
 RETURN p_profile;
END $$;
REVOKE ALL ON FUNCTION public.bind_organizer_auth(uuid,uuid,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bind_organizer_auth(uuid,uuid,bigint,bigint) TO service_role;
COMMIT;
