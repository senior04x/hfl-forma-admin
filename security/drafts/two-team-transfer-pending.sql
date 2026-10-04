-- DRAFT ONLY. Apply with two-team-transfer-consent.sql, team-only RPC,
-- Telegram authorization/delivery and both clients; never deploy in isolation.
-- Requires the existing consent tables/triggers. No historical message replay.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Prevent requests, decisions and approvals from observing a partial conversion.
-- Fail quickly on a busy database rather than waiting with a growing queue.
LOCK TABLE public.transfers IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_trigger
        WHERE tgrelid='public.transfers'::regclass
          AND tgname='enforce_three_party_transfer_consent'
          AND NOT tgisinternal AND tgenabled='O'
    ) THEN
        RAISE EXCEPTION 'Expected enabled transfer workflow guard is missing';
    END IF;
END;
$$;

-- This guard normally forbids workflow changes. DDL is transactional: any
-- failure restores its original enabled state along with all changed rows.
-- Other transfer triggers remain enabled throughout.
ALTER TABLE public.transfers DISABLE TRIGGER enforce_three_party_transfer_consent;
UPDATE public.transfers SET app_consent_required=true
WHERE status='pending' AND app_consent_required IS DISTINCT FROM true;
ALTER TABLE public.transfers ENABLE TRIGGER enforce_three_party_transfer_consent;

-- Submission is evidence only for the requesting receiving team. Preserve all
-- existing decisions, including rejections or inconsistent legacy records.
-- Missing/invalid participants stay gated for manual review, never auto-approved.
INSERT INTO public.transfer_consents(transfer_id,party,subject_id,decision)
SELECT tr.id,'new_team',tr.new_team_id,'approved'
FROM public.transfers tr
WHERE tr.status='pending' AND tr.app_consent_required
  AND tr.new_team_id IS NOT NULL
  AND tr.requested_by_team_id=tr.new_team_id
  AND tr.old_team_id IS NOT NULL AND tr.old_team_id<>tr.new_team_id
  AND NOT EXISTS (
      SELECT 1 FROM public.transfer_consents c
      WHERE c.transfer_id=tr.id AND c.party='new_team'
  )
ON CONFLICT (transfer_id,party) DO NOTHING;

-- Neither transfer status nor queue rows are changed. The existing enqueue
-- trigger skips same-status UPDATEs; sent/processing/uncertain deliveries stay
-- untouched. Old-team consent must still be obtained explicitly.
COMMIT;
