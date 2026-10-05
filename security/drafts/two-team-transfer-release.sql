BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
LOCK TABLE public.transfers IN ACCESS EXCLUSIVE MODE;

-- Deploy only with the team-only decision RPC and Telegram consent delivery.
-- Keep the existing trigger name so no other transfer guards are replaced.

CREATE OR REPLACE FUNCTION public.enforce_three_party_transfer_consent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
    IF NEW.app_consent_required IS DISTINCT FROM OLD.app_consent_required THEN
        RAISE EXCEPTION 'Transfer workflow cannot be changed after creation' USING ERRCODE='23514';
    END IF;
    IF NEW.app_consent_required AND NEW.status='approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
        IF NOT EXISTS (SELECT 1 FROM public.transfer_consents c WHERE c.transfer_id=NEW.id
            AND c.party='old_team' AND c.subject_id=NEW.old_team_id AND c.decision='approved')
        OR NOT EXISTS (SELECT 1 FROM public.transfer_consents c WHERE c.transfer_id=NEW.id
            AND c.party='new_team' AND c.subject_id=NEW.new_team_id AND c.decision='approved') THEN
            RAISE EXCEPTION 'Both transfer teams must consent before admin approval' USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- Draft only: deploy together with pending migration, Telegram delivery and clients.
-- Does not replace admin, cancellation, membership or notification guards.

CREATE OR REPLACE FUNCTION public.record_transfer_app_consent(
    p_token_hash text, p_transfer_id uuid, p_party text, p_decision text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_transfer public.transfers%ROWTYPE;
    v_team_session public.team_sessions%ROWTYPE; v_existing public.transfer_consents%ROWTYPE;
    v_subject uuid; v_current_phone text; v_expected uuid; v_ready boolean;
BEGIN
    IF p_token_hash IS NULL OR p_token_hash !~ '^sha256:[0-9a-f]{64}$' OR p_transfer_id IS NULL
        OR p_party IS NULL OR p_party NOT IN ('old_team','new_team')
        OR p_decision IS NULL OR p_decision NOT IN ('approved','rejected') THEN
        RETURN jsonb_build_object('status',400,'error','Invalid decision');
    END IF;
    -- The actor is derived exclusively from a verified session, not caller IDs.
    SELECT * INTO v_team_session FROM public.team_sessions
    WHERE token=p_token_hash AND expires_at>clock_timestamp() FOR SHARE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status',401,'error','Session expired'); END IF;
    v_subject:=v_team_session.team_id;
    SELECT * INTO v_transfer FROM public.transfers WHERE id=p_transfer_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status',404,'error','Transfer not found'); END IF;
    IF NOT v_transfer.app_consent_required THEN
        RETURN jsonb_build_object('status',409,'error','This transfer uses the existing web workflow');
    END IF;
    -- Lock transfer before participant rows, matching admin membership updates.
    SELECT public.transfer_phone(captain_phone) INTO v_current_phone
    FROM public.teams WHERE id=v_subject FOR SHARE;
    IF NOT FOUND OR v_current_phone IS NULL OR v_team_session.phone IS NULL
        OR v_current_phone IS DISTINCT FROM v_team_session.phone THEN
        RETURN jsonb_build_object('status',403,'error','Captain authorization changed');
    END IF;
    v_expected:=CASE p_party WHEN 'old_team' THEN v_transfer.old_team_id
        WHEN 'new_team' THEN v_transfer.new_team_id END;
    IF v_expected IS NULL OR v_expected IS DISTINCT FROM v_subject THEN
        RETURN jsonb_build_object('status',403,'error','Not your transfer');
    END IF;
    SELECT * INTO v_existing FROM public.transfer_consents WHERE transfer_id=p_transfer_id AND party=p_party;
    IF FOUND THEN
        IF v_existing.subject_id=v_subject AND v_existing.decision=p_decision THEN
            RETURN jsonb_build_object('status',200,'success',true,'already_recorded',true);
        END IF;
        RETURN jsonb_build_object('status',409,'error','Decision already recorded');
    END IF;
    IF v_transfer.status IS DISTINCT FROM 'pending' THEN
        RETURN jsonb_build_object('status',409,'error','Transfer already decided');
    END IF;
    INSERT INTO public.transfer_consents(transfer_id,party,subject_id,decision)
    VALUES(p_transfer_id,p_party,v_subject,p_decision);
    -- Invalidate scoped admin subscriptions without changing status or sending messages.
    -- Retain player_confirmed only as legacy data; it no longer affects readiness.
    UPDATE public.transfers SET player_confirmed=player_confirmed WHERE id=p_transfer_id;
    SELECT EXISTS (SELECT 1 FROM public.transfer_consents
        WHERE transfer_id=p_transfer_id AND party='old_team'
            AND subject_id=v_transfer.old_team_id AND decision='approved')
        AND EXISTS (SELECT 1 FROM public.transfer_consents
        WHERE transfer_id=p_transfer_id AND party='new_team'
            AND subject_id=v_transfer.new_team_id AND decision='approved') INTO v_ready;
    RETURN jsonb_build_object('status',200,'success',true,'already_recorded',false,'ready_for_admin',v_ready);
END;
$$;
REVOKE ALL ON FUNCTION public.record_transfer_app_consent(text,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_transfer_app_consent(text,uuid,text,text) TO service_role;

-- DRAFT ONLY: deploy with team-only consent gate, pending conversion, bot and clients.
-- Existing telegram_chat_id values are not proof of contact ownership.

CREATE TABLE public.transfer_telegram_contacts (
    chat_id text PRIMARY KEY CHECK (chat_id ~ '^[1-9][0-9]{0,15}$'),
    user_id text NOT NULL CHECK (user_id=chat_id),
    phone text NOT NULL CHECK (phone ~ '^[0-9]{9}$'),
    verified_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.transfer_telegram_contacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.transfer_telegram_contacts FROM PUBLIC,anon,authenticated,service_role;

-- Only the trusted bot calls this after receiving Telegram's own contact event.
-- Never bootstrap this table from existing team/chat mappings or caller phones.
CREATE FUNCTION public.record_transfer_telegram_contact(
    p_chat_id text,p_user_id text,p_contact_user_id text,p_phone text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
    IF p_chat_id IS NULL OR p_chat_id !~ '^[1-9][0-9]{0,15}$'
        OR p_user_id IS DISTINCT FROM p_chat_id OR p_contact_user_id IS DISTINCT FROM p_user_id
        OR p_phone IS NULL OR p_phone !~ '^[0-9]{9}$' THEN
        RETURN jsonb_build_object('status',400,'error','Invalid contact');
    END IF;
    INSERT INTO public.transfer_telegram_contacts(chat_id,user_id,phone)
    VALUES(p_chat_id,p_user_id,p_phone)
    ON CONFLICT (chat_id) DO UPDATE SET user_id=EXCLUDED.user_id,
        phone=EXCLUDED.phone,verified_at=clock_timestamp();
    RETURN jsonb_build_object('status',200,'success',true);
END;
$$;

CREATE FUNCTION public.record_transfer_telegram_consent(
    p_chat_id text,p_user_id text,p_transfer_id uuid,p_decision text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_transfer public.transfers%ROWTYPE; v_team public.teams%ROWTYPE;
    v_contact public.transfer_telegram_contacts%ROWTYPE;
    v_existing public.transfer_consents%ROWTYPE; v_phone text; v_ready boolean;
BEGIN
    IF p_chat_id IS NULL OR p_chat_id !~ '^[1-9][0-9]{0,15}$'
        OR p_user_id IS DISTINCT FROM p_chat_id OR p_transfer_id IS NULL
        OR p_decision IS NULL OR p_decision NOT IN ('approved','rejected') THEN
        RETURN jsonb_build_object('status',400,'error','Invalid decision');
    END IF;
    -- Same serialization point as app consent, cancellation and admin approval.
    SELECT * INTO v_transfer FROM public.transfers WHERE id=p_transfer_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status',404,'error','Transfer not found'); END IF;
    IF v_transfer.app_consent_required IS DISTINCT FROM true OR v_transfer.old_team_id IS NULL THEN
        RETURN jsonb_build_object('status',409,'error','Transfer workflow unavailable');
    END IF;
    -- No team ID or phone from callback data is trusted.
    SELECT * INTO v_team FROM public.teams WHERE id=v_transfer.old_team_id FOR SHARE;
    IF NOT FOUND OR v_transfer.organization_id IS NULL
        OR v_team.organization_id IS DISTINCT FROM v_transfer.organization_id
        OR v_team.telegram_chat_id::text IS DISTINCT FROM p_chat_id THEN
        RETURN jsonb_build_object('status',403,'error','Not your transfer');
    END IF;
    SELECT * INTO v_contact FROM public.transfer_telegram_contacts WHERE chat_id=p_chat_id FOR SHARE;
    v_phone:=public.transfer_phone(v_team.captain_phone);
    IF NOT FOUND OR v_contact.user_id IS DISTINCT FROM p_user_id OR v_phone IS NULL
        OR v_contact.phone IS DISTINCT FROM v_phone THEN
        RETURN jsonb_build_object('status',403,'error','Contact verification required');
    END IF;
    SELECT * INTO v_existing FROM public.transfer_consents
    WHERE transfer_id=p_transfer_id AND party='old_team';
    IF FOUND THEN
        IF v_existing.subject_id=v_team.id AND v_existing.decision=p_decision THEN
            RETURN jsonb_build_object('status',200,'success',true,'already_recorded',true);
        END IF;
        RETURN jsonb_build_object('status',409,'error','Decision already recorded');
    END IF;
    IF v_transfer.status IS DISTINCT FROM 'pending' THEN
        RETURN jsonb_build_object('status',409,'error','Transfer already decided');
    END IF;
    INSERT INTO public.transfer_consents(transfer_id,party,subject_id,decision)
    VALUES(p_transfer_id,'old_team',v_team.id,p_decision);
    -- Scoped admin invalidation, preserving status and historical player data.
    UPDATE public.transfers SET player_confirmed=player_confirmed WHERE id=p_transfer_id;
    SELECT EXISTS (SELECT 1 FROM public.transfer_consents
        WHERE transfer_id=p_transfer_id AND party='new_team'
          AND subject_id=v_transfer.new_team_id AND decision='approved')
        AND p_decision='approved' INTO v_ready;
    RETURN jsonb_build_object('status',200,'success',true,'already_recorded',false,'ready_for_admin',v_ready);
END;
$$;
REVOKE ALL ON FUNCTION public.record_transfer_telegram_contact(text,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_transfer_telegram_consent(text,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_transfer_telegram_contact(text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_transfer_telegram_consent(text,text,uuid,text) TO service_role;

-- DRAFT ONLY: deploy with team-only workflow, Telegram callbacks and clients.
-- No backfill or historical replay. Keep queue claims, reservations and retry functions.

CREATE OR REPLACE FUNCTION public.enqueue_transfer_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_party text; v_recipients text[];
BEGIN
    IF NEW.requested_by_team_id IS NULL OR NEW.player_id IS NULL THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
    IF NEW.status NOT IN ('pending','approved','rejected') THEN RETURN NEW; END IF;
    v_recipients:=CASE
        WHEN NEW.app_consent_required AND NEW.status='pending' THEN ARRAY['old_team','new_team']
        WHEN NEW.app_consent_required THEN ARRAY['player','old_team','new_team']
        ELSE ARRAY['player'] END;
    FOREACH v_party IN ARRAY v_recipients LOOP
        INSERT INTO public.transfer_notifications(transfer_id,player_id,event,team_name,recipient_type,app_consent_required,player_name,old_team_name)
        VALUES(NEW.id,NEW.player_id,NEW.status,coalesce(NEW.new_team_name,''),v_party,NEW.app_consent_required,
            coalesce(NEW.player_name,''),coalesce(NEW.old_team_name,'')) ON CONFLICT DO NOTHING;
    END LOOP;
    RETURN NEW;
END;
$$;

-- DRAFT ONLY: after requesting-team auto-consent and existing transfer access
-- guards, together with two-team gate, pending conversion, bot and clients.
-- Keep the legacy endpoint/signature; delegate to the same guarded app RPC.
-- Do not replace request_transfer_app: installed payment/permission checks stay.

CREATE OR REPLACE FUNCTION public.request_team_transfer(
    p_token_hash text,p_player_id uuid,p_reason text,p_team_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
    SELECT public.request_transfer_app(p_token_hash,p_player_id,p_reason,p_team_id);
$$;
REVOKE ALL ON FUNCTION public.request_team_transfer(text,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_team_transfer(text,uuid,text,uuid) TO service_role;

-- DRAFT: public career history contains approved transfers only. No pending
-- requests, reasons, captain identities, sessions or consent details are public.

CREATE INDEX IF NOT EXISTS transfers_public_player_history_idx
ON public.transfers(player_id,created_at DESC,id DESC) WHERE status='approved';
CREATE OR REPLACE FUNCTION public.public_player_transfer_history(p_player_id uuid,p_after uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_after_time timestamptz; v_items jsonb;
BEGIN
    IF p_player_id IS NULL THEN RETURN jsonb_build_object('status',400,'error','Invalid player'); END IF;
    IF p_after IS NOT NULL THEN
        SELECT created_at INTO v_after_time FROM public.transfers
        WHERE id=p_after AND player_id=p_player_id AND status='approved';
        IF NOT FOUND THEN RETURN jsonb_build_object('status',400,'error','Invalid cursor'); END IF;
    END IF;
    SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC,r.id DESC),'[]'::jsonb) INTO v_items FROM (
        SELECT id,player_id,old_team_name,old_team_logo,new_team_name,new_team_logo,status,created_at
        FROM public.transfers WHERE player_id=p_player_id AND status='approved'
            AND (p_after IS NULL OR (created_at,id)<(v_after_time,p_after))
        ORDER BY created_at DESC,id DESC LIMIT 21
    ) r;
    RETURN jsonb_build_object('status',200,
        'items',CASE WHEN jsonb_array_length(v_items)>20 THEN v_items-20 ELSE v_items END,
        'next_cursor',CASE WHEN jsonb_array_length(v_items)>20 THEN v_items->19->>'id' ELSE NULL END);
END;
$$;
REVOKE ALL ON FUNCTION public.public_player_transfer_history(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.public_player_transfer_history(uuid,uuid) TO service_role;

-- DRAFT ONLY: requires protected organization_transfer_admin_bindings from
-- transfer-owner-bindings.sql / install-transfer-permissions.sql, and the
-- cancellation-aware guards from 20261001000900. Deploy with the full workflow.
-- BLOCKED FOR DEPLOY until mobile apiService.getPlayerTransfers consumers
-- (AccountScreen, MyStatsScreen, PlayerStatsScreen) use authorized read APIs:
-- these boundaries intentionally stop unrestricted direct player-history reads.

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

-- DRAFT ONLY. Apply with two-team-transfer-consent.sql, team-only RPC,
-- Telegram authorization/delivery and both clients; never deploy in isolation.
-- Requires the existing consent tables/triggers. No historical message replay.

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Prevent requests, decisions and approvals from observing a partial conversion.
-- Fail quickly on a busy database rather than waiting with a growing queue.
LOCK TABLE public.transfers IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_trigger
        WHERE tgrelid='public.transfers'::regclass
          AND tgname='enforce_three_party_transfer_consent'
          AND NOT tgisinternal AND tgenabled='O'
    ) THEN
        RAISE EXCEPTION 'Expected enabled transfer workflow guard is missing';
    END IF;
END;
$$;

-- This guard normally forbids workflow changes. DDL is transactional: any
-- failure restores its original enabled state along with all changed rows.
-- Other transfer triggers remain enabled throughout.
ALTER TABLE public.transfers DISABLE TRIGGER enforce_three_party_transfer_consent;
UPDATE public.transfers SET app_consent_required=true
WHERE status='pending' AND app_consent_required IS DISTINCT FROM true;
ALTER TABLE public.transfers ENABLE TRIGGER enforce_three_party_transfer_consent;

-- Submission is evidence only for the requesting receiving team. Preserve all
-- existing decisions, including rejections or inconsistent legacy records.
-- Missing/invalid participants stay gated for manual review, never auto-approved.
INSERT INTO public.transfer_consents(transfer_id,party,subject_id,decision)
SELECT tr.id,'new_team',tr.new_team_id,'approved'
FROM public.transfers tr
WHERE tr.status='pending' AND tr.app_consent_required
  AND tr.new_team_id IS NOT NULL
  AND tr.requested_by_team_id=tr.new_team_id
  AND tr.old_team_id IS NOT NULL AND tr.old_team_id<>tr.new_team_id
  AND NOT EXISTS (
      SELECT 1 FROM public.transfer_consents c
      WHERE c.transfer_id=tr.id AND c.party='new_team'
  )
ON CONFLICT (transfer_id,party) DO NOTHING;

-- Neither transfer status nor queue rows are changed. The existing enqueue
-- trigger skips same-status UPDATEs; sent/processing/uncertain deliveries stay
-- untouched. Old-team consent must still be obtained explicitly.

COMMIT;
