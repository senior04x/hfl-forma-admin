BEGIN;
CREATE TABLE public.transfer_app_cancellations (
 transfer_id uuid PRIMARY KEY REFERENCES public.transfers(id) ON DELETE CASCADE,
 team_id uuid NOT NULL REFERENCES public.teams(id),
 cancelled_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.transfer_app_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.transfer_app_cancellations FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.guard_team_transfer_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN

    IF TG_OP='UPDATE' AND OLD.status='pending' AND NEW.status='rejected'
       AND OLD.app_consent_required AND NEW.app_consent_required
       AND ROW(NEW.player_id,NEW.old_team_id,NEW.new_team_id,NEW.organization_id,NEW.requested_by_team_id)
           IS NOT DISTINCT FROM ROW(OLD.player_id,OLD.old_team_id,OLD.new_team_id,OLD.organization_id,OLD.requested_by_team_id)
       AND EXISTS (SELECT 1 FROM public.transfer_app_cancellations c
           WHERE c.transfer_id=OLD.id AND c.team_id=OLD.requested_by_team_id) THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'INSERT' THEN
        IF NEW.requested_by_team_id IS NOT NULL AND NEW.status IS DISTINCT FROM 'pending' THEN
            RAISE EXCEPTION 'New team transfers must await admin review';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.requested_by_team_id IS NOT NULL OR NEW.requested_by_team_id IS NOT NULL THEN
        IF ROW(NEW.requested_by_team_id, NEW.player_id, NEW.old_team_id,
               NEW.new_team_id, NEW.organization_id)
           IS DISTINCT FROM
           ROW(OLD.requested_by_team_id, OLD.player_id, OLD.old_team_id,
               OLD.new_team_id, OLD.organization_id) THEN
            RAISE EXCEPTION 'Team transfer participants cannot be changed';
        END IF;

        IF NEW.status IS DISTINCT FROM OLD.status THEN
            IF auth.role() IS DISTINCT FROM 'authenticated'
               OR OLD.organization_id IS NULL
               OR public.get_user_org_id() IS DISTINCT FROM OLD.organization_id THEN
                RAISE EXCEPTION 'Only the organization admin can decide this transfer';
            END IF;
            IF OLD.status IS DISTINCT FROM 'pending'
               OR NEW.status IS NULL OR NEW.status NOT IN ('approved', 'rejected') THEN
                RAISE EXCEPTION 'Only pending transfers can be approved or rejected';
            END IF;
        END IF;
        -- player_confirmed is retained for compatibility, but is not a gate.
    END IF;
    RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.apply_transfer_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE
    v_player public.applications%ROWTYPE;
    v_from public.teams%ROWTYPE;
    v_to public.teams%ROWTYPE;
    v_career public.player_career_history%ROWTYPE;
    v_from_id uuid;
    v_to_id uuid;
    v_at timestamptz;
BEGIN

    IF TG_OP='UPDATE' AND OLD.status='pending' AND NEW.status='rejected'
       AND OLD.app_consent_required AND NEW.app_consent_required
       AND ROW(NEW.player_id,NEW.old_team_id,NEW.new_team_id,NEW.organization_id,NEW.requested_by_team_id)
           IS NOT DISTINCT FROM ROW(OLD.player_id,OLD.old_team_id,OLD.new_team_id,OLD.organization_id,OLD.requested_by_team_id)
       AND EXISTS (SELECT 1 FROM public.transfer_app_cancellations c
           WHERE c.transfer_id=OLD.id AND c.team_id=OLD.requested_by_team_id) THEN
        RETURN NEW;
    END IF;
    -- Inserts must start pending, including legacy requests.
    IF TG_OP='INSERT' THEN
        IF NEW.status IS DISTINCT FROM 'pending' THEN
            RAISE EXCEPTION 'Transfers must start pending' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
    END IF;
    IF (OLD.status='approved' OR NEW.status='approved') AND
       ROW(NEW.player_id,NEW.old_team_id,NEW.new_team_id,NEW.organization_id)
       IS DISTINCT FROM ROW(OLD.player_id,OLD.old_team_id,OLD.new_team_id,OLD.organization_id) THEN
        RAISE EXCEPTION 'Transfer participants cannot change during or after approval' USING ERRCODE='23514';
    END IF;
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
    -- Auth identity comes from the signed Supabase session, never request fields.
    IF auth.role() IS DISTINCT FROM 'authenticated' OR NOT EXISTS (
        SELECT 1 FROM public.admin_users au WHERE au.id=auth.uid()
          AND au.organization_id=OLD.organization_id AND au.role IN ('org_admin','super_admin')
    ) THEN
        RAISE EXCEPTION 'Only the organization admin can decide this transfer' USING ERRCODE='42501';
    END IF;
    IF NEW.status IS NULL OR NEW.status NOT IN ('pending','approved','rejected') THEN
        RAISE EXCEPTION 'Invalid transfer status' USING ERRCODE='23514';
    END IF;
    IF NEW.status='approved' THEN
        v_from_id:=OLD.old_team_id; v_to_id:=OLD.new_team_id;
    ELSIF OLD.status='approved' THEN
        -- Legacy reversals remain available, but never overwrite a later transfer.
        -- Team-initiated decisions cannot be reopened (existing guard trigger).
        v_from_id:=OLD.new_team_id; v_to_id:=OLD.old_team_id;
    ELSE RETURN NEW; -- Rejection/reopening without membership changes.
    END IF;
    IF v_from_id IS NULL OR v_to_id IS NULL OR v_from_id=v_to_id THEN
        RAISE EXCEPTION 'Invalid transfer teams' USING ERRCODE='23514';
    END IF;
    SELECT * INTO v_player FROM public.applications WHERE id=OLD.player_id FOR UPDATE;
    IF NOT FOUND OR v_player.team_id IS DISTINCT FROM v_from_id THEN
        RAISE EXCEPTION 'Player membership changed; refresh the request' USING ERRCODE='23514';
    END IF;
    IF NEW.status='approved' AND v_player.status IS DISTINCT FROM 'approved' THEN
        RAISE EXCEPTION 'Player registration is not approved' USING ERRCODE='23514';
    END IF;
    -- Stable lock order for the two team rows.
    PERFORM id FROM public.teams WHERE id IN (v_from_id,v_to_id) ORDER BY id FOR SHARE;
    SELECT * INTO v_from FROM public.teams WHERE id=v_from_id;
    SELECT * INTO v_to FROM public.teams WHERE id=v_to_id;
    IF v_from.id IS NULL OR v_to.id IS NULL OR OLD.organization_id IS NULL
       OR v_from.organization_id IS DISTINCT FROM OLD.organization_id
       OR v_to.organization_id IS DISTINCT FROM OLD.organization_id THEN
        RAISE EXCEPTION 'Transfer teams must belong to the same organization' USING ERRCODE='23514';
    END IF;
    -- A request made while the window was open may be reviewed after it closes.
    v_at:=clock_timestamp();
    SELECT * INTO v_career FROM public.player_career_history
        WHERE player_id=v_player.id AND left_at IS NULL FOR UPDATE;
    IF FOUND THEN
        IF v_career.team_id IS DISTINCT FROM v_from_id
           OR v_career.organization_id IS DISTINCT FROM OLD.organization_id
           OR v_career.joined_at>v_at
           OR (OLD.status='approved' AND v_career.transfer_id IS DISTINCT FROM OLD.id) THEN
            RAISE EXCEPTION 'Career history does not match current membership' USING ERRCODE='23514';
        END IF;
        UPDATE public.player_career_history SET left_at=v_at WHERE id=v_career.id;
    ELSE
        -- The original joining date is unknown. Record first observation at
        -- transfer time instead of inventing a historical joining date.
        INSERT INTO public.player_career_history(player_id,team_id,team_name,organization_id,joined_at,left_at,created_via)
        VALUES (v_player.id,v_from.id,v_from.name,OLD.organization_id,v_at,v_at,'registration');
    END IF;
    INSERT INTO public.player_career_history(player_id,team_id,team_name,organization_id,joined_at,created_via,transfer_id)
    VALUES (v_player.id,v_to.id,v_to.name,OLD.organization_id,v_at,'transfer',OLD.id);
    UPDATE public.applications SET team_id=v_to.id WHERE id=v_player.id;
    RETURN NEW;
END;
$$;

CREATE FUNCTION public.cancel_transfer_app(p_token_hash text,p_transfer_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_session public.team_sessions%ROWTYPE; v_transfer public.transfers%ROWTYPE; v_phone text;
BEGIN
 IF p_token_hash IS NULL OR p_token_hash !~ '^sha256:[0-9a-f]{64}$' OR p_transfer_id IS NULL THEN
  RETURN jsonb_build_object('status',400,'error','Invalid request'); END IF;
 SELECT * INTO v_session FROM public.team_sessions WHERE token=p_token_hash AND expires_at>clock_timestamp() FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status',401,'error','Session expired'); END IF;
 SELECT * INTO v_transfer FROM public.transfers WHERE id=p_transfer_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status',404,'error','Transfer not found'); END IF;
 IF NOT v_transfer.app_consent_required OR v_transfer.requested_by_team_id IS DISTINCT FROM v_session.team_id THEN
  RETURN jsonb_build_object('status',403,'error','Not your request'); END IF;
 SELECT public.transfer_phone(captain_phone) INTO v_phone FROM public.teams WHERE id=v_session.team_id FOR SHARE;
 IF v_phone IS DISTINCT FROM v_session.phone THEN RETURN jsonb_build_object('status',403,'error','Captain authorization changed'); END IF;
 IF EXISTS(SELECT 1 FROM public.transfer_app_cancellations WHERE transfer_id=p_transfer_id) THEN
  RETURN jsonb_build_object('status',200,'success',true,'already_cancelled',true); END IF;
 IF v_transfer.status IS DISTINCT FROM 'pending' THEN RETURN jsonb_build_object('status',409,'error','Transfer already decided'); END IF;
 INSERT INTO public.transfer_app_cancellations(transfer_id,team_id) VALUES(p_transfer_id,v_session.team_id);
 UPDATE public.transfers SET status='rejected' WHERE id=p_transfer_id;
 RETURN jsonb_build_object('status',200,'success',true,'already_cancelled',false);
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_transfer_app(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_transfer_app(text,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.transfer_app_page(p_token_hash text,p_actor text,
    p_direction text DEFAULT 'all',p_after uuid DEFAULT NULL,p_transfer_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_player_session public.transfer_player_sessions%ROWTYPE;
    v_team_session public.team_sessions%ROWTYPE; v_subject uuid; v_phone text;
    v_after_time timestamptz; v_items jsonb;
BEGIN
    IF p_token_hash IS NULL OR p_token_hash !~ '^sha256:[0-9a-f]{64}$'
        OR p_actor IS NULL OR p_actor NOT IN ('player','captain')
        OR p_direction IS NULL OR p_direction NOT IN ('all','incoming','outgoing') THEN
        RETURN jsonb_build_object('status',400,'error','Invalid request');
    END IF;
    IF p_actor='player' THEN
        SELECT * INTO v_player_session FROM public.transfer_player_sessions
        WHERE token_hash=p_token_hash AND expires_at>clock_timestamp();
        IF NOT FOUND THEN RETURN jsonb_build_object('status',401,'error','Session expired'); END IF;
        v_subject:=v_player_session.player_id;
        SELECT public.transfer_phone(phone) INTO v_phone FROM public.applications WHERE id=v_subject;
        IF v_phone IS DISTINCT FROM v_player_session.phone THEN
            RETURN jsonb_build_object('status',403,'error','Player authorization changed');
        END IF;
    ELSE
        SELECT * INTO v_team_session FROM public.team_sessions WHERE token=p_token_hash AND expires_at>clock_timestamp();
        IF NOT FOUND THEN RETURN jsonb_build_object('status',401,'error','Session expired'); END IF;
        v_subject:=v_team_session.team_id;
        SELECT public.transfer_phone(captain_phone) INTO v_phone FROM public.teams WHERE id=v_subject;
        IF v_phone IS DISTINCT FROM v_team_session.phone THEN
            RETURN jsonb_build_object('status',403,'error','Captain authorization changed');
        END IF;
    END IF;
    IF p_after IS NOT NULL THEN
        SELECT created_at INTO v_after_time FROM public.transfers
        WHERE id=p_after AND app_consent_required AND
            ((p_actor='player' AND player_id=v_subject) OR (p_actor='captain' AND
                ((p_direction IN ('all','incoming') AND new_team_id=v_subject)
                OR (p_direction IN ('all','outgoing') AND old_team_id=v_subject))));
        IF NOT FOUND THEN RETURN jsonb_build_object('status',400,'error','Invalid cursor'); END IF;
    END IF;
    SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC,r.id DESC),'[]'::jsonb) INTO v_items FROM (
        SELECT tr.id,tr.created_at,tr.player_id,tr.player_name,tr.player_photo,tr.old_team_id,
            tr.old_team_name,tr.old_team_logo,tr.new_team_id,tr.new_team_name,tr.new_team_logo,
            tr.reason,tr.status,tr.organization_id,tr.app_consent_required,
            EXISTS(SELECT 1 FROM public.transfer_app_cancellations c WHERE c.transfer_id=tr.id) AS cancelled,
            (p_actor='captain' AND tr.requested_by_team_id=v_subject AND tr.status='pending') AS can_cancel,
            CASE WHEN p_actor='player' THEN 'player' WHEN tr.old_team_id=v_subject THEN 'old_team' ELSE 'new_team' END AS actor_party,
            (SELECT coalesce(jsonb_agg(jsonb_build_object('party',c.party,'decision',c.decision,'decided_at',c.decided_at)),'[]'::jsonb)
                FROM public.transfer_consents c WHERE c.transfer_id=tr.id
                  AND c.subject_id=CASE c.party WHEN 'player' THEN tr.player_id
                      WHEN 'old_team' THEN tr.old_team_id WHEN 'new_team' THEN tr.new_team_id END) AS consents
        FROM public.transfers tr WHERE tr.app_consent_required
            AND (p_transfer_id IS NULL OR tr.id=p_transfer_id)
            AND ((p_actor='player' AND tr.player_id=v_subject) OR (p_actor='captain' AND
                ((p_direction IN ('all','incoming') AND tr.new_team_id=v_subject)
                OR (p_direction IN ('all','outgoing') AND tr.old_team_id=v_subject))))
            AND (p_after IS NULL OR (tr.created_at,tr.id)<(v_after_time,p_after))
        ORDER BY tr.created_at DESC,tr.id DESC LIMIT 21
    ) r;
    RETURN jsonb_build_object('status',200,'items',CASE WHEN jsonb_array_length(v_items)>20 THEN v_items-20 ELSE v_items END,
        'next_cursor',CASE WHEN jsonb_array_length(v_items)>20 THEN v_items->19->>'id' ELSE NULL END,
        'transfer_window_open',CASE WHEN p_actor='captain' THEN (SELECT coalesce(o.transfer_window_open,false)
            FROM public.teams tm JOIN public.organizations o ON o.id=tm.organization_id WHERE tm.id=v_subject) ELSE false END);
END;
$$;
COMMIT;
