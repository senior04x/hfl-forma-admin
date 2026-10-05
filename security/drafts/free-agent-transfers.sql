BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
ALTER TABLE public.transfers ADD COLUMN old_team_consent_required boolean NOT NULL DEFAULT true;

-- Only pending requests whose player still belongs to the archived old team.
UPDATE public.transfers tr SET old_team_consent_required=false
FROM public.applications a WHERE tr.player_id=a.id AND tr.status='pending'
 AND a.is_archived AND a.team_id=tr.old_team_id AND a.organization_id=tr.organization_id;

CREATE FUNCTION public.capture_transfer_archive_consent() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE archived boolean;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.old_team_consent_required IS DISTINCT FROM OLD.old_team_consent_required THEN
   RAISE EXCEPTION 'Transfer consent requirement cannot change' USING ERRCODE='23514';
  END IF;
 ELSE
  SELECT is_archived INTO archived FROM applications
   WHERE id=NEW.player_id AND team_id=NEW.old_team_id AND organization_id=NEW.organization_id FOR UPDATE;
  NEW.old_team_consent_required:=NOT coalesce(archived,false);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a_capture_transfer_archive_consent BEFORE INSERT OR UPDATE ON public.transfers
FOR EACH ROW EXECUTE FUNCTION public.capture_transfer_archive_consent();

CREATE OR REPLACE FUNCTION public.enforce_three_party_transfer_consent() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.app_consent_required IS DISTINCT FROM OLD.app_consent_required THEN
  RAISE EXCEPTION 'Transfer workflow cannot be changed after creation' USING ERRCODE='23514';
 END IF;
 IF NEW.app_consent_required AND NEW.status='approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
  IF (NEW.old_team_consent_required AND NOT EXISTS(SELECT 1 FROM transfer_consents c
    WHERE c.transfer_id=NEW.id AND c.party='old_team' AND c.subject_id=NEW.old_team_id AND c.decision='approved'))
   OR NOT EXISTS(SELECT 1 FROM transfer_consents c WHERE c.transfer_id=NEW.id
    AND c.party='new_team' AND c.subject_id=NEW.new_team_id AND c.decision='approved') THEN
   RAISE EXCEPTION 'Required transfer teams must consent before admin approval' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;

-- Patch installed functions, retaining current payment, auth and membership guards.
CREATE FUNCTION pg_temp.patch_transfer(signature text,needle text,replacement text) RETURNS void
LANGUAGE plpgsql AS $$ DECLARE definition text; BEGIN
 definition:=replace(pg_get_functiondef(signature::regprocedure),chr(13),'');
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'Unexpected function: %',signature; END IF;
 EXECUTE replace(definition,needle,replacement);
END $$;
SELECT pg_temp.patch_transfer('public.request_transfer_app(text,uuid,text,uuid)',
 'p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 1000',
 'length(btrim(coalesce(p_reason,'''')))>1000');
SELECT pg_temp.patch_transfer('public.request_transfer_app(text,uuid,text,uuid)',
 'btrim(p_reason), ''pending''','btrim(coalesce(p_reason,'''')), ''pending''');
SELECT pg_temp.patch_transfer('public.record_transfer_app_consent(text,uuid,text,text)',
 'SELECT * INTO v_existing FROM public.transfer_consents WHERE transfer_id=p_transfer_id AND party=p_party;',
 'IF p_party=''old_team'' AND NOT v_transfer.old_team_consent_required THEN RETURN jsonb_build_object(''status'',409,''error'',''Old team consent not required''); END IF;
    SELECT * INTO v_existing FROM public.transfer_consents WHERE transfer_id=p_transfer_id AND party=p_party;');
SELECT pg_temp.patch_transfer('public.record_transfer_app_consent(text,uuid,text,text)',
 'SELECT EXISTS (SELECT 1 FROM public.transfer_consents
        WHERE transfer_id=p_transfer_id AND party=''old_team''
            AND subject_id=v_transfer.old_team_id AND decision=''approved'')',
 'SELECT (NOT v_transfer.old_team_consent_required OR EXISTS (SELECT 1 FROM public.transfer_consents
        WHERE transfer_id=p_transfer_id AND party=''old_team''
            AND subject_id=v_transfer.old_team_id AND decision=''approved''))');
SELECT pg_temp.patch_transfer('public.record_transfer_telegram_consent(text,text,uuid,text)',
 'v_transfer.app_consent_required IS DISTINCT FROM true OR v_transfer.old_team_id IS NULL',
 'v_transfer.app_consent_required IS DISTINCT FROM true OR v_transfer.old_team_id IS NULL OR NOT v_transfer.old_team_consent_required');
SELECT pg_temp.patch_transfer('public.transfer_app_page(text,text,text,uuid,uuid)',
 'tr.reason,tr.status,tr.organization_id,tr.app_consent_required,',
 'tr.reason,tr.status,tr.organization_id,tr.app_consent_required,tr.old_team_consent_required,');
SELECT pg_temp.patch_transfer('public.team_transfer_page(text,text,text,uuid,uuid)',
 'a.player_number,a.position,t.name AS team_name,',
 'a.player_number,a.position,a.is_archived,t.name AS team_name,');
SELECT pg_temp.patch_transfer('public.enqueue_transfer_notification()',
 'WHEN NEW.app_consent_required AND NEW.status=''pending'' THEN ARRAY[''old_team'',''new_team'']',
 'WHEN NEW.app_consent_required AND NEW.status=''pending'' AND NOT NEW.old_team_consent_required THEN ARRAY[''new_team'']
        WHEN NEW.app_consent_required AND NEW.status=''pending'' THEN ARRAY[''old_team'',''new_team'']');

-- Already delivered messages remain historical; stale buttons cannot record consent.
UPDATE public.transfer_notifications job SET state='failed',failure_code='old_team_consent_not_required'
FROM public.transfers tr WHERE tr.id=job.transfer_id AND NOT tr.old_team_consent_required
 AND tr.status='pending' AND job.event='pending' AND job.recipient_type='old_team' AND job.state='pending';
NOTIFY pgrst,'reload schema';
COMMIT;
