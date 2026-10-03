BEGIN;
-- DRAFT: requires protected organizations.admin_email authority, verified Auth and all transfer guards.
-- Explicit override; absent row preserves existing team access.
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

-- Install after team-transfer-permissions.sql. Protect transfer authority without
-- changing the existing superadmin or organization profile write paths.
CREATE TABLE public.organization_transfer_admin_bindings (
 organization_id bigint PRIMARY KEY REFERENCES public.organizations(id) ON DELETE RESTRICT,
 owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.organization_transfer_admin_bindings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organization_transfer_admin_bindings FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.organization_transfer_admin_bindings TO service_role;
CREATE POLICY transfer_binding_backend ON public.organization_transfer_admin_bindings
 TO service_role USING(true) WITH CHECK(true);
-- Bootstrap only unambiguous, verified existing owners. Never infer organization 1.
INSERT INTO public.organization_transfer_admin_bindings(organization_id,owner_id)
 SELECT o.id,u.id FROM public.organizations o JOIN auth.users u ON lower(u.email)=lower(o.admin_email)
 WHERE u.email_confirmed_at IS NOT NULL
 AND (SELECT count(*) FROM public.organizations x WHERE lower(x.admin_email)=lower(u.email))=1
 AND (SELECT count(*) FROM auth.users x WHERE lower(x.email)=lower(u.email))=1;
CREATE OR REPLACE FUNCTION public.organization_owner_matches(p_actor uuid,p_org bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.organization_transfer_admin_bindings b
  JOIN auth.users u ON u.id=b.owner_id
  JOIN public.organizations o ON o.id=b.organization_id
  WHERE b.owner_id=p_actor AND b.organization_id=p_org
   AND u.email_confirmed_at IS NOT NULL AND lower(o.admin_email)=lower(u.email)
   AND (SELECT count(*) FROM public.organizations x WHERE lower(x.admin_email)=lower(u.email))=1
 )
$$;
REVOKE ALL ON FUNCTION public.organization_owner_matches(uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.organization_owner_matches(uuid,bigint) TO service_role;

-- DRAFT after team-transfer-permissions.sql AND protected organizations.admin_email authority.
CREATE INDEX teams_transfer_access_page_idx ON public.teams(organization_id,league,id);
CREATE FUNCTION public.admin_team_transfer_access_page(p_org bigint,p_league text DEFAULT NULL,p_after uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE items jsonb; filters jsonb;
BEGIN
 IF p_org IS NULL OR p_org<=0 OR (p_league IS NOT NULL AND length(p_league)>120) THEN RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE='22023'; END IF;
 IF NOT public.organization_owner_matches(auth.uid(),p_org) THEN
  RAISE EXCEPTION 'ADMIN_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]'::jsonb) INTO items FROM (
  SELECT t.id,t.name,t.league,coalesce(p.allowed,true) AS allowed FROM public.teams t
   LEFT JOIN public.team_transfer_permissions p ON p.team_id=t.id
   WHERE t.organization_id=p_org AND coalesce(t.is_archived,false)=false
    AND (p_league IS NULL OR t.league=p_league) AND (p_after IS NULL OR t.id>p_after)
   ORDER BY t.id LIMIT 31
 ) r;
 IF p_after IS NULL THEN
  SELECT coalesce(jsonb_agg(name ORDER BY name),'[]'::jsonb) INTO filters FROM (
   SELECT DISTINCT league AS name FROM public.teams WHERE organization_id=p_org
    AND coalesce(is_archived,false)=false AND league IS NOT NULL AND league<>'' ORDER BY league LIMIT 100
  ) r;
 END IF;
 RETURN jsonb_build_object('items',items,'leagues',filters);
END $$;
CREATE FUNCTION public.admin_set_team_transfer_access(p_org bigint,p_team uuid,p_allowed boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 -- Server derives actor from signed JWT. No actor identifier supplied by UI.
 RETURN public.set_team_transfer_permission(auth.uid(),p_org,p_team,p_allowed);
END $$;
REVOKE ALL ON FUNCTION public.admin_team_transfer_access_page(bigint,text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_set_team_transfer_access(bigint,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_team_transfer_access_page(bigint,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_team_transfer_access(bigint,uuid,boolean) TO authenticated;

-- DRAFT: after team-transfer-permissions.sql; verify live trigger inventory first.
CREATE FUNCTION public.guard_incoming_team_transfer_permission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE target_org bigint; team_allowed boolean;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.new_team_id IS NOT DISTINCT FROM OLD.new_team_id
    AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
    AND NOT (NEW.status='approved' AND OLD.status IS DISTINCT FROM 'approved') THEN RETURN NEW; END IF;
 END IF;
 IF NEW.new_team_id IS NULL THEN
  RAISE EXCEPTION 'TRANSFER_TARGET_INVALID' USING ERRCODE='23514';
 END IF;
 -- Same team lock used by the permission setter: serialize closure and receipt.
 SELECT organization_id INTO target_org FROM public.teams WHERE id=NEW.new_team_id FOR SHARE;
 IF NOT FOUND OR target_org IS NULL OR target_org IS DISTINCT FROM NEW.organization_id THEN
  RAISE EXCEPTION 'TRANSFER_TARGET_INVALID' USING ERRCODE='23514';
 END IF;
 SELECT allowed INTO team_allowed FROM public.team_transfer_permissions WHERE team_id=NEW.new_team_id;
 IF team_allowed IS FALSE THEN
  RAISE EXCEPTION 'TEAM_TRANSFER_PAYMENT_REQUIRED' USING ERRCODE='P0001';
 END IF;
 -- Existing global-window/session/consent triggers remain responsible for their checks.
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_incoming_team_transfer_permission() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_incoming_team_transfer_permission BEFORE INSERT OR UPDATE
 ON public.transfers FOR EACH ROW EXECUTE FUNCTION public.guard_incoming_team_transfer_permission();

-- Preserve the currently deployed functions, including newer player fields.
DO $patch$
DECLARE fn regprocedure; original text; changed text; marker text;
BEGIN
 fn:='public.team_transfer_page(text,text,text,uuid,uuid)'::regprocedure;
 original:=pg_get_functiondef(fn);
 marker:='''transfer_window_open'',coalesce(v_window,false))';
 IF strpos(original,marker)=0 OR strpos(original,'team_transfer_allowed')>0 THEN
  RAISE EXCEPTION 'Unexpected team transfer context definition';
 END IF;
 changed:=replace(original,marker,
  '''transfer_window_open'',coalesce(v_window,false), ''team_transfer_allowed'',coalesce((SELECT allowed FROM public.team_transfer_permissions WHERE team_id=v_team.id),true), ''organization_contact_phone'',(SELECT contact_phone FROM public.organizations WHERE id=v_team.organization_id))');
 EXECUTE changed;
 -- Both web and mobile receiving requests return the same safe machine code.
 FOREACH fn IN ARRAY ARRAY[
  'public.request_team_transfer(text,uuid,text,uuid)'::regprocedure,
  'public.request_transfer_app(text,uuid,text,uuid)'::regprocedure
 ] LOOP
  original:=pg_get_functiondef(fn);
  marker:='INSERT INTO public.transfers';
  IF strpos(original,marker)=0 OR strpos(original,'TEAM_TRANSFER_PAYMENT_REQUIRED')>0 THEN
   RAISE EXCEPTION 'Unexpected receiving transfer request definition';
  END IF;
  changed:=replace(original,marker,
   'IF EXISTS (SELECT 1 FROM public.team_transfer_permissions WHERE team_id=v_team.id AND allowed=false) THEN RETURN jsonb_build_object(''status'',403,''error'',''Receiving team transfer access is closed'',''code'',''TEAM_TRANSFER_PAYMENT_REQUIRED''); END IF; '||marker);
  EXECUTE changed;
 END LOOP;
END $patch$;

NOTIFY pgrst, 'reload schema';
COMMIT;
