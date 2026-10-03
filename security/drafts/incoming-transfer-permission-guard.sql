-- DRAFT: after team-transfer-permissions.sql; verify live trigger inventory first.
BEGIN;
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
COMMIT;
