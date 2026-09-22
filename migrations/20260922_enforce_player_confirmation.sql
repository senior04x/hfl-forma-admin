-- Apply AFTER 20260922_team_initiated_transfers.sql.
-- RLS controls organization membership; this trigger protects player consent.
BEGIN;

CREATE OR REPLACE FUNCTION public.check_player_confirmation_before_approval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.requested_by_team_id IS NOT NULL
           AND (NEW.status IS DISTINCT FROM 'pending'
                OR NEW.player_confirmed IS DISTINCT FROM false) THEN
            RAISE EXCEPTION 'New team transfers must await player confirmation';
        END IF;
        RETURN NEW;
    END IF;

    -- Keep the participants for whom consent was requested immutable.
    IF OLD.requested_by_team_id IS NOT NULL OR NEW.requested_by_team_id IS NOT NULL THEN
        IF ROW(NEW.requested_by_team_id, NEW.player_id, NEW.old_team_id,
               NEW.new_team_id, NEW.organization_id)
           IS DISTINCT FROM
           ROW(OLD.requested_by_team_id, OLD.player_id, OLD.old_team_id,
               OLD.new_team_id, OLD.organization_id) THEN
            RAISE EXCEPTION 'Team transfer participants cannot be changed';
        END IF;

        -- Only trusted server code (the bot) can record player consent.
        -- A missing JWT role must fail closed too.
        IF NEW.player_confirmed IS DISTINCT FROM OLD.player_confirmed THEN
            IF auth.role() IS DISTINCT FROM 'service_role' THEN
                RAISE EXCEPTION 'Only the player confirmation service can record consent';
            END IF;
            IF OLD.status IS DISTINCT FROM 'pending'
               OR NEW.status IS DISTINCT FROM 'pending'
               OR OLD.player_confirmed IS TRUE
               OR NEW.player_confirmed IS DISTINCT FROM true THEN
                RAISE EXCEPTION 'Player consent requires a pending transfer';
            END IF;
        END IF;

        IF OLD.status IN ('approved', 'rejected') AND NEW.status IS DISTINCT FROM OLD.status THEN
            RAISE EXCEPTION 'Completed team transfers cannot be reopened';
        END IF;

        IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved'
           AND (OLD.player_confirmed IS DISTINCT FROM true
                OR NEW.player_confirmed IS DISTINCT FROM true) THEN
            RAISE EXCEPTION 'Player has not confirmed this transfer';
        END IF;
    END IF;
    -- Legacy player-initiated transfers retain their existing behavior.
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_player_confirmation ON public.transfers;
CREATE TRIGGER enforce_player_confirmation
    BEFORE INSERT OR UPDATE ON public.transfers
    FOR EACH ROW EXECUTE FUNCTION public.check_player_confirmation_before_approval();

COMMIT;
