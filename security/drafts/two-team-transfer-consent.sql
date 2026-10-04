-- Deploy only with the team-only decision RPC and Telegram consent delivery.
-- Keep the existing trigger name so no other transfer guards are replaced.
BEGIN;
CREATE OR REPLACE FUNCTION public.enforce_three_party_transfer_consent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
    IF NEW.app_consent_required IS DISTINCT FROM OLD.app_consent_required THEN
        RAISE EXCEPTION 'Transfer workflow cannot be changed after creation' USING ERRCODE='23514';
    END IF;
    IF NEW.app_consent_required AND NEW.status='approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
        IF NOT EXISTS (SELECT 1 FROM public.transfer_consents c WHERE c.transfer_id=NEW.id
            AND c.party='old_team' AND c.subject_id=NEW.old_team_id AND c.decision='approved')
        OR NOT EXISTS (SELECT 1 FROM public.transfer_consents c WHERE c.transfer_id=NEW.id
            AND c.party='new_team' AND c.subject_id=NEW.new_team_id AND c.decision='approved') THEN
            RAISE EXCEPTION 'Both transfer teams must consent before admin approval' USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
COMMIT;
