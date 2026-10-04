-- DRAFT ONLY: deploy with team-only consent gate, pending conversion, bot and clients.
-- Existing telegram_chat_id values are not proof of contact ownership.
BEGIN;
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
COMMIT;
