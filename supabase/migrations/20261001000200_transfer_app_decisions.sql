-- Draft: deploy with 20261001000100 and the application consent screens.
BEGIN;
CREATE TABLE public.transfer_player_sessions (
    token_hash text PRIMARY KEY CHECK (token_hash ~ '^sha256:[0-9a-f]{64}$'),
    player_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
    phone text NOT NULL CHECK (phone ~ '^[0-9]{9}$'),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.transfer_player_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.transfer_player_sessions FROM PUBLIC, anon, authenticated;
CREATE INDEX transfer_player_sessions_expiry_idx ON public.transfer_player_sessions(expires_at);

CREATE FUNCTION public.verify_transfer_player_otp(
    p_phone text, p_code text, p_player_id uuid, p_token_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_otp public.otp_codes%ROWTYPE; v_player public.applications%ROWTYPE;
    v_expiry timestamptz := clock_timestamp()+interval '1 hour';
BEGIN
    IF p_phone IS NULL OR p_phone !~ '^[0-9]{9}$' OR p_code IS NULL OR p_code !~ '^[0-9]{4}$'
        OR p_player_id IS NULL OR p_token_hash IS NULL OR p_token_hash !~ '^sha256:[0-9a-f]{64}$' THEN
        RETURN jsonb_build_object('status',400,'error','Invalid request');
    END IF;
    SELECT * INTO v_otp FROM public.otp_codes WHERE phone=p_phone FOR UPDATE;
    IF NOT FOUND OR v_otp.is_used IS DISTINCT FROM false OR v_otp.expires_at IS NULL
        OR v_otp.expires_at <= clock_timestamp() THEN
        RETURN jsonb_build_object('status',401,'error','Invalid or expired code');
    END IF;
    IF coalesce(v_otp.attempts,0)>=5 THEN
        UPDATE public.otp_codes SET is_used=true WHERE phone=p_phone;
        RETURN jsonb_build_object('status',429,'error','Request a new code');
    END IF;
    IF v_otp.code::text IS DISTINCT FROM p_code THEN
        UPDATE public.otp_codes SET attempts=coalesce(attempts,0)+1,
            is_used=coalesce(attempts,0)+1>=5 WHERE phone=p_phone;
        RETURN jsonb_build_object('status',CASE WHEN coalesce(v_otp.attempts,0)>=4 THEN 429 ELSE 401 END,
            'error','Invalid code');
    END IF;
    SELECT * INTO v_player FROM public.applications WHERE id=p_player_id FOR SHARE;
    IF NOT FOUND OR public.transfer_phone(v_player.phone) IS DISTINCT FROM p_phone
        OR v_player.status IS DISTINCT FROM 'approved' THEN
        RETURN jsonb_build_object('status',403,'error','Player authorization failed');
    END IF;
    -- Serialize issuance per phone using the OTP lock; bound unexpired sessions.
    DELETE FROM public.transfer_player_sessions WHERE player_id=p_player_id AND expires_at<=clock_timestamp();
    IF (SELECT count(*) FROM public.transfer_player_sessions WHERE player_id=p_player_id)>=5 THEN
        RETURN jsonb_build_object('status',429,'error','Too many active sessions');
    END IF;
    INSERT INTO public.transfer_player_sessions(token_hash,player_id,phone,expires_at)
    VALUES(p_token_hash,p_player_id,p_phone,v_expiry);
    UPDATE public.otp_codes SET is_used=true WHERE phone=p_phone;
    RETURN jsonb_build_object('status',200,'success',true,'expiresAt',v_expiry,'playerId',p_player_id);
END;
$$;

CREATE FUNCTION public.record_transfer_app_consent(
    p_token_hash text, p_transfer_id uuid, p_party text, p_decision text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_transfer public.transfers%ROWTYPE; v_player_session public.transfer_player_sessions%ROWTYPE;
    v_team_session public.team_sessions%ROWTYPE; v_existing public.transfer_consents%ROWTYPE;
    v_subject uuid; v_current_phone text; v_expected uuid; v_ready boolean;
BEGIN
    IF p_token_hash IS NULL OR p_token_hash !~ '^sha256:[0-9a-f]{64}$' OR p_transfer_id IS NULL
        OR p_party IS NULL OR p_party NOT IN ('player','old_team','new_team')
        OR p_decision IS NULL OR p_decision NOT IN ('approved','rejected') THEN
        RETURN jsonb_build_object('status',400,'error','Invalid decision');
    END IF;
    -- The actor is derived exclusively from a verified session, not caller IDs.
    IF p_party='player' THEN
        SELECT * INTO v_player_session FROM public.transfer_player_sessions
        WHERE token_hash=p_token_hash AND expires_at>clock_timestamp() FOR SHARE;
        IF NOT FOUND THEN RETURN jsonb_build_object('status',401,'error','Session expired'); END IF;
        v_subject:=v_player_session.player_id;
    ELSE
        SELECT * INTO v_team_session FROM public.team_sessions
        WHERE token=p_token_hash AND expires_at>clock_timestamp() FOR SHARE;
        IF NOT FOUND THEN RETURN jsonb_build_object('status',401,'error','Session expired'); END IF;
        v_subject:=v_team_session.team_id;
    END IF;
    SELECT * INTO v_transfer FROM public.transfers WHERE id=p_transfer_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status',404,'error','Transfer not found'); END IF;
    IF NOT v_transfer.app_consent_required THEN
        RETURN jsonb_build_object('status',409,'error','This transfer uses the existing web workflow');
    END IF;
    -- Lock transfer before participant rows, matching admin membership updates.
    IF p_party='player' THEN
        SELECT public.transfer_phone(phone) INTO v_current_phone FROM public.applications WHERE id=v_subject FOR SHARE;
        IF v_current_phone IS DISTINCT FROM v_player_session.phone THEN
            RETURN jsonb_build_object('status',403,'error','Player authorization changed');
        END IF;
    ELSE
        SELECT public.transfer_phone(captain_phone) INTO v_current_phone FROM public.teams WHERE id=v_subject FOR SHARE;
        IF v_current_phone IS DISTINCT FROM v_team_session.phone THEN
            RETURN jsonb_build_object('status',403,'error','Captain authorization changed');
        END IF;
    END IF;
    v_expected:=CASE p_party WHEN 'player' THEN v_transfer.player_id
        WHEN 'old_team' THEN v_transfer.old_team_id WHEN 'new_team' THEN v_transfer.new_team_id END;
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
    -- Existing admin transfer subscriptions can invalidate their scoped list.
    -- This does not change transfer status or queue a duplicate status message.
    UPDATE public.transfers SET player_confirmed=EXISTS (
        SELECT 1 FROM public.transfer_consents WHERE transfer_id=p_transfer_id
            AND party='player' AND subject_id=v_transfer.player_id AND decision='approved'
    ) WHERE id=p_transfer_id;
    SELECT count(*)=3 INTO v_ready FROM public.transfer_consents
    WHERE transfer_id=p_transfer_id AND decision='approved'
        AND subject_id=CASE party WHEN 'player' THEN v_transfer.player_id
            WHEN 'old_team' THEN v_transfer.old_team_id WHEN 'new_team' THEN v_transfer.new_team_id END;
    RETURN jsonb_build_object('status',200,'success',true,'already_recorded',false,'ready_for_admin',v_ready);
END;
$$;
REVOKE ALL ON FUNCTION public.verify_transfer_player_otp(text,text,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_transfer_app_consent(text,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.verify_transfer_player_otp(text,text,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_transfer_app_consent(text,uuid,text,text) TO service_role;
COMMIT;
