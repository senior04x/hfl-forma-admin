-- Approval, membership, career and queued notifications commit together.
-- Apply after 20260926; no historical transfers are replayed.
BEGIN;
ALTER TABLE public.player_career_history ADD COLUMN IF NOT EXISTS transfer_id uuid
    REFERENCES public.transfers(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS player_career_one_current_idx
    ON public.player_career_history(player_id) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS transfers_admin_page_idx
    ON public.transfers(organization_id,status,created_at DESC,id DESC);

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
REVOKE ALL ON FUNCTION public.apply_transfer_membership() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS apply_transfer_membership ON public.transfers;
DROP TRIGGER IF EXISTS z_apply_transfer_membership ON public.transfers;
-- Run after the existing BEFORE guard, before any AFTER notification enqueue.
CREATE TRIGGER z_apply_transfer_membership BEFORE INSERT OR UPDATE ON public.transfers
FOR EACH ROW EXECUTE FUNCTION public.apply_transfer_membership();
COMMIT;
