-- Apply after all 20260922 transfer migrations.
BEGIN;

CREATE OR REPLACE FUNCTION public.transfer_phone(value text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog
AS $$ SELECT CASE WHEN regexp_replace(value, '[^0-9]', '', 'g') ~ '^(998)?[0-9]{9}$'
    THEN right(regexp_replace(value, '[^0-9]', '', 'g'), 9) END $$;

CREATE INDEX IF NOT EXISTS teams_transfer_captain_phone_idx
ON public.teams (public.transfer_phone(captain_phone));
CREATE INDEX IF NOT EXISTS transfers_pending_player_idx
ON public.transfers (player_id) WHERE status = 'pending';

-- Hashes only: possession of a session-table snapshot must not grant access.
REVOKE ALL ON public.team_sessions FROM anon, authenticated;

-- Both backend and bot upsert OTPs; a new issuance must reset the counter.
CREATE OR REPLACE FUNCTION public.reset_transfer_otp_attempts()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.attempts := 0;
    ELSIF NEW.is_used IS FALSE AND
        ROW(NEW.code, NEW.expires_at, NEW.created_at) IS DISTINCT FROM
        ROW(OLD.code, OLD.expires_at, OLD.created_at) THEN
        NEW.attempts := 0;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS reset_transfer_otp_attempts ON public.otp_codes;
CREATE TRIGGER reset_transfer_otp_attempts BEFORE INSERT OR UPDATE ON public.otp_codes
FOR EACH ROW EXECUTE FUNCTION public.reset_transfer_otp_attempts();

CREATE OR REPLACE FUNCTION public.verify_team_transfer_otp(
    p_phone text, p_code text, p_token_hash text, p_team_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
    v_otp public.otp_codes%ROWTYPE;
    v_team public.teams%ROWTYPE;
    v_count integer;
    v_expiry timestamptz := clock_timestamp() + interval '24 hours';
BEGIN
    IF p_phone IS NULL OR p_phone !~ '^[0-9]{9}$'
       OR p_code IS NULL OR p_code !~ '^[0-9]{4}$'
       OR p_token_hash IS NULL OR p_token_hash !~ '^sha256:[0-9a-f]{64}$' THEN
        RETURN jsonb_build_object('status', 400, 'error', 'Invalid request');
    END IF;
    -- Serialize guesses, OTP consumption and issuance across all callers.
    SELECT * INTO v_otp FROM public.otp_codes WHERE phone = p_phone FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 401, 'error', 'Invalid or expired OTP');
    END IF;
    IF coalesce(v_otp.attempts, 0) >= 5 THEN
        UPDATE public.otp_codes SET is_used = true WHERE phone = p_phone;
        RETURN jsonb_build_object('status', 429, 'error', 'Too many attempts. Request a new OTP');
    END IF;
    IF v_otp.is_used IS DISTINCT FROM false OR v_otp.expires_at IS NULL
       OR v_otp.expires_at <= clock_timestamp() THEN
        RETURN jsonb_build_object('status', 401, 'error', 'Invalid or expired OTP');
    END IF;
    IF v_otp.code::text IS DISTINCT FROM p_code THEN
        UPDATE public.otp_codes SET attempts = coalesce(attempts, 0) + 1,
            is_used = coalesce(attempts, 0) + 1 >= 5 WHERE phone = p_phone;
        RETURN jsonb_build_object('status', CASE WHEN coalesce(v_otp.attempts,0) >= 4 THEN 429 ELSE 401 END,
            'error', 'Invalid OTP or attempt limit reached');
    END IF;
    IF p_team_id IS NULL THEN
        SELECT count(*) INTO v_count FROM public.teams
        WHERE public.transfer_phone(captain_phone) = p_phone;
        IF v_count > 1 THEN
            RETURN jsonb_build_object('status', 409, 'error', 'Select your captain team',
                'teams', (SELECT jsonb_agg(jsonb_build_object('id',c.id,'name',c.name)) FROM (
                    SELECT id,name FROM public.teams WHERE public.transfer_phone(captain_phone)=p_phone
                    ORDER BY id LIMIT 50
                ) c));
        END IF;
    END IF;
    SELECT * INTO v_team FROM public.teams
    WHERE public.transfer_phone(captain_phone) = p_phone
      AND (p_team_id IS NULL OR id = p_team_id) FOR SHARE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 403, 'error', 'Captain account required');
    END IF;
    INSERT INTO public.team_sessions(token, phone, team_id, expires_at)
    VALUES (p_token_hash, p_phone, v_team.id, v_expiry);
    UPDATE public.otp_codes SET is_used = true WHERE phone = p_phone;
    RETURN jsonb_build_object('status', 200, 'success', true, 'role', 'captain',
        'expiresAt', v_expiry, 'canRequestTransfers', true,
        'team', jsonb_build_object('id', v_team.id, 'name', v_team.name,
            'organization_id', v_team.organization_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.request_team_transfer(
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
        status, player_confirmed, requested_by_team_id, organization_id)
    VALUES (v_player.id, v_old.id, v_old.name, v_old.logo_url,
        v_team.id, v_team.name, v_team.logo_url,
        btrim(concat_ws(' ', v_player.first_name, v_player.last_name)), v_player.photo_url,
        btrim(p_reason), 'pending', false, v_team.id, v_team.organization_id)
    RETURNING * INTO v_transfer;
    RETURN jsonb_build_object('status', 201, 'success', true, 'transfer', to_jsonb(v_transfer));
END;
$$;

REVOKE ALL ON FUNCTION public.verify_team_transfer_otp(text,text,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_team_transfer(text,uuid,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_team_transfer_otp(text,text,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_team_transfer(text,uuid,text,uuid) TO service_role;
COMMIT;
