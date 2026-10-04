-- DRAFT ONLY: requires protected organization_transfer_admin_bindings from
-- transfer-owner-bindings.sql / install-transfer-permissions.sql, and the
-- cancellation-aware guards from 20261001000900. Deploy with the full workflow.
-- BLOCKED FOR DEPLOY until mobile apiService.getPlayerTransfers consumers
-- (AccountScreen, MyStatsScreen, PlayerStatsScreen) use authorized read APIs:
-- these boundaries intentionally stop unrestricted direct player-history reads.
BEGIN;
CREATE OR REPLACE FUNCTION public.transfer_admin_authorized(p_org bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
    SELECT auth.role()='authenticated' AND EXISTS (
        SELECT 1 FROM public.organization_transfer_admin_bindings b
        JOIN auth.users u ON u.id=b.owner_id
        JOIN public.organizations o ON o.id=b.organization_id
        WHERE b.organization_id=p_org AND b.owner_id=auth.uid()
          AND u.email_confirmed_at IS NOT NULL AND lower(u.email)=lower(o.admin_email)
          AND (SELECT count(*) FROM public.organizations x WHERE lower(x.admin_email)=lower(u.email))=1
          AND (SELECT count(*) FROM auth.users x WHERE lower(x.email)=lower(u.email))=1
    );
$$;
REVOKE ALL ON FUNCTION public.transfer_admin_authorized(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.transfer_admin_authorized(bigint) TO authenticated,service_role;

-- Change only the authorization clauses, preserving cancellation, participant,
-- membership, career, lock-order and final-status checks from installed guards.
DO $patch$
DECLARE definition text; needle text;
BEGIN
    definition:=replace(pg_get_functiondef('public.guard_team_transfer_decision()'::regprocedure),chr(13),'');
    needle:='public.get_user_org_id() IS DISTINCT FROM OLD.organization_id';
    IF position(needle IN definition)>0 THEN
        IF position('public.transfer_app_cancellations' IN definition)=0 THEN
            RAISE EXCEPTION 'Cancellation-aware transfer guard required';
        END IF;
        EXECUTE replace(definition,needle,'NOT public.transfer_admin_authorized(OLD.organization_id)');
    ELSIF position('public.transfer_admin_authorized(OLD.organization_id)' IN definition)=0 THEN
        RAISE EXCEPTION 'Unrecognized transfer decision guard; review before applying';
    END IF;
    definition:=replace(pg_get_functiondef('public.apply_transfer_membership()'::regprocedure),chr(13),'');
    needle:=$legacy$NOT EXISTS (
        SELECT 1 FROM public.admin_users au WHERE au.id=auth.uid()
          AND au.organization_id=OLD.organization_id AND au.role IN ('org_admin','super_admin')
    )$legacy$;
    needle:=replace(needle,chr(13),'');
    IF position(needle IN definition)>0 THEN
        IF position('public.transfer_app_cancellations' IN definition)=0 THEN
            RAISE EXCEPTION 'Cancellation-aware membership guard required';
        END IF;
        EXECUTE replace(definition,needle,'NOT public.transfer_admin_authorized(OLD.organization_id)');
    ELSIF position('public.transfer_admin_authorized(OLD.organization_id)' IN definition)=0 THEN
        RAISE EXCEPTION 'Unrecognized membership guard; review before applying';
    END IF;
END;
$patch$;

ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfer_consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org admins can update org transfers" ON public.transfers;
DROP POLICY IF EXISTS "Org admins can delete org transfers" ON public.transfers;
DROP POLICY IF EXISTS transfer_admin_read ON public.transfers;
DROP POLICY IF EXISTS transfer_admin_boundary ON public.transfers;
DROP POLICY IF EXISTS transfer_anon_boundary ON public.transfers;
CREATE POLICY transfer_admin_read ON public.transfers FOR SELECT TO authenticated
    USING(public.transfer_admin_authorized(organization_id));
CREATE POLICY "Org admins can update org transfers" ON public.transfers FOR UPDATE TO authenticated
    USING(public.transfer_admin_authorized(organization_id))
    WITH CHECK(public.transfer_admin_authorized(organization_id));
CREATE POLICY "Org admins can delete org transfers" ON public.transfers FOR DELETE TO authenticated
    USING(public.transfer_admin_authorized(organization_id));
-- Restrictive policies also constrain any remaining permissive legacy policy.
CREATE POLICY transfer_admin_boundary ON public.transfers AS RESTRICTIVE FOR ALL TO authenticated
    USING(public.transfer_admin_authorized(organization_id))
    WITH CHECK(public.transfer_admin_authorized(organization_id));
CREATE POLICY transfer_anon_boundary ON public.transfers AS RESTRICTIVE FOR ALL TO anon
    USING(false) WITH CHECK(false);

DROP POLICY IF EXISTS transfer_consents_org_read ON public.transfer_consents;
DROP POLICY IF EXISTS transfer_consents_admin_boundary ON public.transfer_consents;
DROP POLICY IF EXISTS transfer_consents_anon_boundary ON public.transfer_consents;
CREATE POLICY transfer_consents_org_read ON public.transfer_consents FOR SELECT TO authenticated
    USING(EXISTS(SELECT 1 FROM public.transfers tr WHERE tr.id=transfer_consents.transfer_id
        AND public.transfer_admin_authorized(tr.organization_id)));
CREATE POLICY transfer_consents_admin_boundary ON public.transfer_consents AS RESTRICTIVE FOR ALL TO authenticated
    USING(EXISTS(SELECT 1 FROM public.transfers tr WHERE tr.id=transfer_consents.transfer_id
        AND public.transfer_admin_authorized(tr.organization_id))) WITH CHECK(false);
CREATE POLICY transfer_consents_anon_boundary ON public.transfer_consents AS RESTRICTIVE FOR ALL TO anon
    USING(false) WITH CHECK(false);
-- No grants expanded, no shared get_user_org_id or superadmin behavior changed.
COMMIT;
