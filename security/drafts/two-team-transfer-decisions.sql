-- Draft only: deploy together with pending migration, Telegram delivery and clients.
-- Does not replace admin, cancellation, membership or notification guards.
BEGIN;
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
COMMIT;
