-- Explicitly requested captain notices for current pending transfers.
-- Deploy the edit-target RPC and bot first. Sent/processing/uncertain jobs stay
-- untouched. Receiving submission already supplies receiving-team consent.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
INSERT INTO public.transfer_notifications(transfer_id,player_id,event,team_name,
    recipient_type,app_consent_required,player_name,old_team_name)
SELECT tr.id,tr.player_id,'pending',coalesce(tr.new_team_name,''),
    'old_team',true,coalesce(tr.player_name,''),coalesce(tr.old_team_name,'')
FROM public.transfers tr
WHERE tr.status='pending' AND tr.app_consent_required
  AND tr.old_team_id IS NOT NULL AND tr.new_team_id IS NOT NULL
  AND tr.old_team_id<>tr.new_team_id
  AND NOT EXISTS(SELECT 1 FROM public.transfer_consents c
      WHERE c.transfer_id=tr.id AND c.party='old_team')
ON CONFLICT (transfer_id,event,recipient_type) DO NOTHING;

-- Only retry the known duplicate suppression when a delivered informational
-- message can be upgraded. Unknown outcomes and real delivery errors are not retried.
UPDATE public.transfer_notifications job
SET state='pending',available_at=clock_timestamp(),failure_code=NULL,
    claim_token=NULL,claimed_at=NULL,resolved_chat_id=NULL
FROM public.transfers tr JOIN public.teams captain ON captain.id=tr.old_team_id
WHERE job.transfer_id=tr.id AND job.event='pending' AND job.recipient_type='old_team'
  AND tr.status='pending' AND tr.app_consent_required
  AND captain.organization_id=tr.organization_id
  AND job.state='failed' AND job.failure_code IN ('duplicate_private_chat','duplicate_or_lost_claim')
  AND job.created_at>clock_timestamp()-interval '7 days'
  AND NOT EXISTS(SELECT 1 FROM public.transfer_consents c
      WHERE c.transfer_id=tr.id AND c.party='old_team')
  AND EXISTS(SELECT 1 FROM public.transfer_notifications delivered
      WHERE delivered.transfer_id=tr.id AND delivered.event='pending'
        AND delivered.recipient_type IN ('player','new_team') AND delivered.state='sent'
        AND delivered.resolved_chat_id=captain.telegram_chat_id::text AND delivered.message_id>0);
COMMIT;
