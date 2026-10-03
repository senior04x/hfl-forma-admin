-- Mobile-only requests; legacy web RPC remains unchanged.
BEGIN;
CREATE FUNCTION public.request_transfer_app(
    p_token_hash text, p_player_id uuid, p_reason text, p_team_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
    v_session public.team_sessions%ROWTYPE;
    v_player public.applications%ROWTYPE;
    v_team public.teams%ROWTYPE;
    v_old public.teams%ROWTYPE;
    v_window boolean;
    v_transfer public.transfers%ROWTYPE;
BEGIN
    IF p_token_hash IS NULL OR p_token_hash !~ '^sha256:[0-9a-f]{64}$' THEN
        RETURN jsonb_build_object('status', 401, 'error', 'Invalid session');
    END IF;
    IF p_player_id IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 1000 THEN
        RETURN jsonb_build_object('status', 400, 'error', 'Invalid request');
    END IF;
    SELECT * INTO v_session FROM public.team_sessions
    WHERE token = p_token_hash AND expires_at > clock_timestamp() FOR SHARE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 401, 'error', 'Invalid or expired session');
    END IF;
    IF p_team_id IS NOT NULL AND p_team_id <> v_session.team_id THEN
        RETURN jsonb_build_object('status', 403, 'error', 'Session belongs to another team');
    END IF;
    SELECT * INTO v_team FROM public.teams WHERE id = v_session.team_id FOR SHARE;
    IF NOT FOUND OR public.transfer_phone(v_team.captain_phone) IS DISTINCT FROM v_session.phone
       OR v_team.organization_id IS NULL THEN
        RETURN jsonb_build_object('status', 403, 'error', 'Captain authorization changed');
    END IF;
    -- Lock the player so concurrent requests see the first committed pending row.
    SELECT * INTO v_player FROM public.applications WHERE id = p_player_id FOR UPDATE;
    IF NOT FOUND OR v_player.team_id IS NULL OR v_player.team_id = v_team.id
       OR v_player.status IS DISTINCT FROM 'approved' THEN
        RETURN jsonb_build_object('status', 400, 'error', 'Player must belong to another team');
    END IF;
    SELECT * INTO v_old FROM public.teams WHERE id = v_player.team_id FOR SHARE;
    IF NOT FOUND OR v_old.organization_id IS DISTINCT FROM v_team.organization_id THEN
        RETURN jsonb_build_object('status', 403, 'error', 'Player belongs to a different organization');
    END IF;
    SELECT transfer_window_open INTO v_window FROM public.organizations
    WHERE id = v_team.organization_id FOR SHARE;
    IF v_window IS DISTINCT FROM true THEN
        RETURN jsonb_build_object('status', 403, 'error', 'Transfer window is closed');
    END IF;
    IF EXISTS (SELECT 1 FROM public.transfers WHERE player_id = p_player_id AND status = 'pending') THEN
        RETURN jsonb_build_object('status', 409, 'error', 'Player already has a pending transfer');
    END IF;
    INSERT INTO public.transfers(player_id, old_team_id, old_team_name, old_team_logo,
        new_team_id, new_team_name, new_team_logo, player_name, player_photo, reason,
        status, player_confirmed, requested_by_team_id, organization_id, app_consent_required)
    VALUES (v_player.id, v_old.id, v_old.name, v_old.logo_url,
        v_team.id, v_team.name, v_team.logo_url,
        btrim(concat_ws(' ', v_player.first_name, v_player.last_name)), v_player.photo_url,
        btrim(p_reason), 'pending', false, v_team.id, v_team.organization_id, true)
    RETURNING * INTO v_transfer;
    RETURN jsonb_build_object('status', 201, 'success', true, 'transfer', to_jsonb(v_transfer));
END;
$$;
REVOKE ALL ON FUNCTION public.request_transfer_app(text,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_transfer_app(text,uuid,text,uuid) TO service_role;
COMMIT;
