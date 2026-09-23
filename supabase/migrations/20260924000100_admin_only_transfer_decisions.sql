-- Supersedes the player-consent requirement. Apply after 20260923 migrations.
-- The bot only notifies; an authenticated organization admin makes the decision.
BEGIN;

DROP TRIGGER IF EXISTS enforce_player_confirmation ON public.transfers;
DROP FUNCTION IF EXISTS public.check_player_confirmation_before_approval();

CREATE OR REPLACE FUNCTION public.guard_team_transfer_decision()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
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

DROP TRIGGER IF EXISTS guard_team_transfer_decision ON public.transfers;
CREATE TRIGGER guard_team_transfer_decision BEFORE INSERT OR UPDATE ON public.transfers
FOR EACH ROW EXECUTE FUNCTION public.guard_team_transfer_decision();

COMMENT ON COLUMN public.transfers.player_confirmed IS
    'Legacy compatibility field; team transfers require admin review, not player consent';
COMMIT;
