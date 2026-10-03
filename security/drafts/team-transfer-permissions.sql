-- DRAFT: requires protected organizations.admin_email authority, verified Auth and all transfer guards.
-- Explicit override; absent row preserves existing team access.
BEGIN;
CREATE TABLE public.team_transfer_permissions (
 team_id uuid PRIMARY KEY REFERENCES public.teams(id) ON DELETE CASCADE,
 allowed boolean NOT NULL,
 changed_by uuid NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.team_transfer_permissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.team_transfer_permissions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.team_transfer_permissions TO service_role;
CREATE POLICY team_transfer_backend ON public.team_transfer_permissions TO service_role USING(true) WITH CHECK(true);
-- Backend-only authority lookup; clients cannot choose an email or an actor.
CREATE FUNCTION public.organization_owner_matches(p_actor uuid,p_org bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS (
  SELECT 1 FROM auth.users u JOIN public.organizations o ON lower(o.admin_email)=lower(u.email)
  WHERE u.id=p_actor AND u.email_confirmed_at IS NOT NULL AND o.id=p_org
   AND (SELECT count(*) FROM public.organizations other WHERE lower(other.admin_email)=lower(u.email))=1
 )
$$;
REVOKE ALL ON FUNCTION public.organization_owner_matches(uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.organization_owner_matches(uuid,bigint) TO service_role;
CREATE FUNCTION public.set_team_transfer_permission(p_actor uuid,p_org bigint,p_team uuid,p_allowed boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_allowed IS NULL OR p_org IS NULL OR p_org<=0 OR p_team IS NULL OR p_actor IS NULL THEN
  RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE='22023';
 END IF;
 IF NOT public.organization_owner_matches(p_actor,p_org) THEN
  RAISE EXCEPTION 'ADMIN_ACCESS_DENIED' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM teams WHERE id=p_team AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'TEAM_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 INSERT INTO team_transfer_permissions(team_id,allowed,changed_by) VALUES(p_team,p_allowed,p_actor)
 ON CONFLICT(team_id) DO UPDATE SET allowed=EXCLUDED.allowed,changed_by=EXCLUDED.changed_by,updated_at=clock_timestamp();
 RETURN p_allowed;
END $$;
CREATE FUNCTION public.team_transfer_allowed(p_team uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT coalesce((SELECT o.transfer_window_open IS TRUE AND coalesce(p.allowed,true)
  FROM teams t JOIN organizations o ON o.id=t.organization_id
  LEFT JOIN team_transfer_permissions p ON p.team_id=t.id WHERE t.id=p_team),false)
$$;
REVOKE ALL ON FUNCTION public.set_team_transfer_permission(uuid,bigint,uuid,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.team_transfer_allowed(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_team_transfer_permission(uuid,bigint,uuid,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.team_transfer_allowed(uuid) TO service_role;
COMMIT;
