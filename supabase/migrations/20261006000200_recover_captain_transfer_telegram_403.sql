BEGIN;

-- A Telegram 403 often means the captain has not opened the bot yet. Keep
-- consent requests recoverable and wake them after verified chat linking.
CREATE OR REPLACE FUNCTION public.wake_pending_transfer_notifications(p_chat_id text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_count integer;
BEGIN
    IF p_chat_id IS NULL OR p_chat_id !~ '^[1-9][0-9]{0,15}$' THEN RETURN 0; END IF;

    UPDATE public.transfer_notifications n
       SET state='pending', failure_code=NULL, message_id=NULL,
           resolved_chat_id=NULL, available_at=clock_timestamp()
      FROM public.transfers tr JOIN public.teams old_team ON old_team.id=tr.old_team_id
     WHERE n.transfer_id=tr.id AND n.recipient_type='old_team' AND n.event='pending'
       AND ((n.state='pending' AND n.available_at>clock_timestamp())
         OR (n.state='failed' AND n.failure_code='telegram_403'))
       AND tr.status='pending' AND tr.app_consent_required IS TRUE
       AND old_team.telegram_chat_id::text=p_chat_id;
    GET DIAGNOSTICS v_count=ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.wake_pending_transfer_notifications(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wake_pending_transfer_notifications(text) TO service_role;

COMMIT;
