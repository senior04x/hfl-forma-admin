-- Deploy together with consent delivery/UI. Never send historical requests automatically.
BEGIN;

CREATE TABLE public.transfer_consents (
    transfer_id uuid NOT NULL REFERENCES public.transfers(id) ON DELETE CASCADE,
    party text NOT NULL CHECK (party IN ('player','old_team','new_team')),
    subject_id uuid NOT NULL,
    decision text NOT NULL CHECK (decision IN ('approved','rejected')),
    decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (transfer_id, party)
);
ALTER TABLE public.transfer_consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.transfer_consents FROM anon, authenticated;
GRANT SELECT ON public.transfer_consents TO authenticated;
CREATE POLICY transfer_consents_org_read ON public.transfer_consents FOR SELECT
TO authenticated USING (EXISTS (
    SELECT 1 FROM public.transfers tr
    JOIN public.admin_users au ON au.organization_id=tr.organization_id
    WHERE tr.id=transfer_consents.transfer_id AND au.id=auth.uid()
      AND au.role IN ('org_admin','super_admin')
));

-- Consent decisions are written by a trusted application backend after verifying
-- the player/captain session. Telegram only links to the application.
-- Do not expose service_role or accept a client-supplied subject identity.
GRANT SELECT, INSERT ON public.transfer_consents TO service_role;

CREATE FUNCTION public.validate_transfer_consent_subject()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_transfer public.transfers%ROWTYPE; v_subject uuid;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'Recorded transfer decisions cannot be changed' USING ERRCODE='23514';
    END IF;
    -- Share the transfer lock with admin approval: a decision cannot race it.
    SELECT * INTO v_transfer FROM public.transfers WHERE id=NEW.transfer_id FOR UPDATE;
    IF NOT FOUND OR v_transfer.status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'Transfer is not pending' USING ERRCODE='23514';
    END IF;
    v_subject:=CASE NEW.party WHEN 'player' THEN v_transfer.player_id
        WHEN 'old_team' THEN v_transfer.old_team_id WHEN 'new_team' THEN v_transfer.new_team_id END;
    IF v_subject IS NULL OR NEW.subject_id IS DISTINCT FROM v_subject THEN
        RAISE EXCEPTION 'Consent subject does not match transfer party' USING ERRCODE='23514';
    END IF;
    NEW.decided_at:=clock_timestamp();
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_transfer_consent_subject BEFORE INSERT OR UPDATE ON public.transfer_consents
FOR EACH ROW EXECUTE FUNCTION public.validate_transfer_consent_subject();

-- Applies to every approval path, including both existing admin clients.
CREATE FUNCTION public.enforce_three_party_transfer_consent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
    IF NEW.status='approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
        IF NOT EXISTS (SELECT 1 FROM public.transfer_consents c WHERE c.transfer_id=NEW.id
            AND c.party='player' AND c.subject_id=NEW.player_id AND c.decision='approved')
        OR NOT EXISTS (SELECT 1 FROM public.transfer_consents c WHERE c.transfer_id=NEW.id
            AND c.party='old_team' AND c.subject_id=NEW.old_team_id AND c.decision='approved')
        OR NOT EXISTS (SELECT 1 FROM public.transfer_consents c WHERE c.transfer_id=NEW.id
            AND c.party='new_team' AND c.subject_id=NEW.new_team_id AND c.decision='approved') THEN
            RAISE EXCEPTION 'All three transfer parties must consent before admin approval'
                USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_three_party_transfer_consent BEFORE UPDATE ON public.transfers
FOR EACH ROW EXECUTE FUNCTION public.enforce_three_party_transfer_consent();

COMMIT;
