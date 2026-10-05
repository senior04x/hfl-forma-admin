BEGIN;
-- Reuse a positively delivered informational message, never resend an unknown
-- Telegram outcome or edit a message belonging to another transfer/captain.
CREATE OR REPLACE FUNCTION public.transfer_notification_captain_edit_target(
    p_id bigint,p_claim_token uuid,p_chat_id text
) RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
    SELECT delivered.message_id
    FROM public.transfer_notifications job
    JOIN public.transfers tr ON tr.id=job.transfer_id
    JOIN public.teams captain ON captain.id=tr.old_team_id
    JOIN public.transfer_notifications delivered ON delivered.transfer_id=job.transfer_id
    WHERE job.id=p_id AND job.claim_token=p_claim_token AND job.state='processing'
      AND job.event='pending' AND job.recipient_type='old_team'
      AND tr.status='pending' AND tr.app_consent_required
      AND captain.organization_id=tr.organization_id
      AND p_chat_id ~ '^[1-9][0-9]*$' AND captain.telegram_chat_id::text=p_chat_id
      AND NOT EXISTS(SELECT 1 FROM public.transfer_consents c
          WHERE c.transfer_id=tr.id AND c.party='old_team')
      AND delivered.id<>job.id AND delivered.event='pending'
      AND delivered.recipient_type IN ('player','new_team')
      AND delivered.resolved_chat_id=p_chat_id AND delivered.state='sent'
      AND delivered.message_id>0
    ORDER BY delivered.id LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.transfer_notification_captain_edit_target(bigint,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_notification_captain_edit_target(bigint,uuid,text) TO service_role;
COMMIT;
