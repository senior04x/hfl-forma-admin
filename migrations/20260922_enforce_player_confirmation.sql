-- Migration: Enforce Player Confirmation for Team-Initiated Transfers
-- Date: 2026-09-22
-- Description: Database-level constraint to prevent approval without player confirmation

-- ============================================
-- Trigger Function: Check player confirmation before approval
-- ============================================

CREATE OR REPLACE FUNCTION public.check_player_confirmation_before_approval()
RETURNS TRIGGER AS $$
BEGIN
    -- Only check if status is changing TO 'approved'
    -- (OLD.status IS DISTINCT FROM 'approved' ensures we're not already approved)
    IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status IS DISTINCT FROM 'approved') THEN

        -- Check if this is a team-initiated transfer
        -- (requested_by_team_id IS NOT NULL means team initiated it)
        IF NEW.requested_by_team_id IS NOT NULL THEN

            -- Check if player has confirmed
            IF NEW.player_confirmed = false OR NEW.player_confirmed IS NULL THEN
                RAISE EXCEPTION 'Player has not confirmed this transfer. Team-initiated transfers require player confirmation before approval.';
            END IF;

        END IF;
        -- For player-initiated transfers (requested_by_team_id IS NULL), no check needed

    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Trigger: Apply check before UPDATE
-- ============================================

DROP TRIGGER IF EXISTS enforce_player_confirmation ON public.transfers;

CREATE TRIGGER enforce_player_confirmation
    BEFORE UPDATE ON public.transfers
    FOR EACH ROW
    EXECUTE FUNCTION public.check_player_confirmation_before_approval();

COMMENT ON FUNCTION public.check_player_confirmation_before_approval() IS 'Prevents approval of team-initiated transfers without player confirmation - database-level enforcement';
COMMENT ON TRIGGER enforce_player_confirmation ON public.transfers IS 'Enforces player_confirmed=true requirement for team-initiated transfers before status=approved';
