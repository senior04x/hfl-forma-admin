BEGIN;
-- All writers serialize on the organization before locking teams.
CREATE OR REPLACE FUNCTION public.set_team_transfer_permission(p_actor uuid,p_org bigint,p_team uuid,p_allowed boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE window_open boolean;
BEGIN
 IF p_allowed IS NULL OR p_org IS NULL OR p_org<=0 OR p_team IS NULL OR p_actor IS NULL THEN
  RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE='22023'; END IF;
 IF NOT public.organization_owner_matches(p_actor,p_org) THEN
  RAISE EXCEPTION 'ADMIN_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT transfer_window_open INTO window_open FROM public.organizations WHERE id=p_org FOR SHARE;
 IF p_allowed AND window_open IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'TRANSFER_WINDOW_CLOSED' USING ERRCODE='P0001'; END IF;
 PERFORM 1 FROM public.teams WHERE id=p_team AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'TEAM_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 INSERT INTO public.team_transfer_permissions(team_id,allowed,changed_by) VALUES(p_team,p_allowed,p_actor)
 ON CONFLICT(team_id) DO UPDATE SET allowed=EXCLUDED.allowed,changed_by=EXCLUDED.changed_by,updated_at=clock_timestamp();
 RETURN p_allowed;
END $$;
CREATE FUNCTION public.reset_team_transfer_permissions_for_window()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor uuid;
BEGIN
 IF NEW.transfer_window_open IS NOT DISTINCT FROM OLD.transfer_window_open THEN RETURN NEW; END IF;
 actor:=auth.uid();
 IF auth.role()='authenticated' AND NOT public.organization_owner_matches(actor,OLD.id) THEN
  RAISE EXCEPTION 'ADMIN_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 -- Administrative service writes retain the recorded owner as the audit actor.
 IF actor IS NULL THEN SELECT owner_id INTO actor FROM public.organization_transfer_admin_bindings WHERE organization_id=OLD.id; END IF;
 IF actor IS NULL THEN RAISE EXCEPTION 'ADMIN_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 -- The organization row already serializes all permission writers. Avoid
 -- exclusive team locks: existing request RPCs lock teams before the window.
 INSERT INTO public.team_transfer_permissions(team_id,allowed,changed_by)
 SELECT id,NEW.transfer_window_open IS TRUE,actor FROM public.teams WHERE organization_id=OLD.id ORDER BY id
 ON CONFLICT(team_id) DO UPDATE SET allowed=EXCLUDED.allowed,changed_by=EXCLUDED.changed_by,updated_at=clock_timestamp();
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.reset_team_transfer_permissions_for_window() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER reset_team_transfer_permissions_for_window AFTER UPDATE OF transfer_window_open
 ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.reset_team_transfer_permissions_for_window();
CREATE FUNCTION public.admin_set_league_transfer_access(p_org bigint,p_league text,p_allowed boolean)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE window_open boolean; affected integer;
BEGIN
 IF p_allowed IS NULL OR p_org IS NULL OR p_org<=0 OR p_league IS NULL OR length(p_league) NOT BETWEEN 1 AND 120 THEN
  RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE='22023'; END IF;
 IF NOT public.organization_owner_matches(auth.uid(),p_org) THEN
  RAISE EXCEPTION 'ADMIN_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT transfer_window_open INTO window_open FROM public.organizations WHERE id=p_org FOR UPDATE;
 IF p_allowed AND window_open IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'TRANSFER_WINDOW_CLOSED' USING ERRCODE='P0001'; END IF;
 INSERT INTO public.team_transfer_permissions(team_id,allowed,changed_by)
 SELECT id,p_allowed,auth.uid() FROM public.teams WHERE organization_id=p_org AND league=p_league ORDER BY id
 ON CONFLICT(team_id) DO UPDATE SET allowed=EXCLUDED.allowed,changed_by=EXCLUDED.changed_by,updated_at=clock_timestamp();
 GET DIAGNOSTICS affected=ROW_COUNT;
 RETURN affected;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_league_transfer_access(bigint,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_set_league_transfer_access(bigint,text,boolean) TO authenticated;
-- Reconcile the current closed windows without changing any window or transfer.
INSERT INTO public.team_transfer_permissions(team_id,allowed,changed_by)
 SELECT t.id,false,b.owner_id FROM public.teams t JOIN public.organizations o ON o.id=t.organization_id
 JOIN public.organization_transfer_admin_bindings b ON b.organization_id=o.id WHERE o.transfer_window_open IS DISTINCT FROM true
 ON CONFLICT(team_id) DO UPDATE SET allowed=false,changed_by=EXCLUDED.changed_by,updated_at=clock_timestamp();
NOTIFY pgrst,'reload schema';
COMMIT;
