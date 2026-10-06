BEGIN;

-- A verified captain linking their private Telegram chat makes only that
-- team's delayed, still-pending old-team requests eligible immediately.
CREATE OR REPLACE FUNCTION public.wake_pending_transfer_notifications(p_chat_id text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_count integer;
BEGIN
    IF p_chat_id IS NULL OR p_chat_id !~ '^[1-9][0-9]{0,15}$' THEN RETURN 0; END IF;

    UPDATE public.transfer_notifications n SET available_at=clock_timestamp()
    FROM public.transfers tr JOIN public.teams old_team ON old_team.id=tr.old_team_id
    WHERE n.transfer_id=tr.id AND n.recipient_type='old_team' AND n.event='pending'
      AND n.state='pending' AND n.available_at>clock_timestamp()
      AND tr.status='pending' AND tr.app_consent_required IS TRUE
      AND old_team.telegram_chat_id::text=p_chat_id;
    GET DIAGNOSTICS v_count=ROW_COUNT;
    RETURN v_count;
END;
$$;

-- Close the tiny race where a worker sees no chat immediately before the
-- verified contact is linked. If the link exists by retry completion, retry now.
CREATE OR REPLACE FUNCTION public.finish_transfer_notification(
    p_id bigint,p_claim_token uuid,p_state text,p_message_id bigint DEFAULT NULL,
    p_failure_code text DEFAULT NULL,p_retry_seconds integer DEFAULT 60
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_available_at timestamptz; v_chat_linked boolean;
BEGIN
    IF p_state IS NULL OR p_state NOT IN ('pending','sent','failed','uncertain') THEN
        RAISE EXCEPTION 'Invalid delivery state';
    END IF;

    v_available_at:=clock_timestamp()+make_interval(secs=>greatest(5,least(coalesce(p_retry_seconds,60),86400)));
    IF p_state='pending' AND p_failure_code='no_private_chat' THEN
        SELECT EXISTS (
            SELECT 1 FROM public.transfer_notifications n
            JOIN public.transfers tr ON tr.id=n.transfer_id
            JOIN public.teams old_team ON old_team.id=tr.old_team_id
            WHERE n.id=p_id AND n.claim_token=p_claim_token AND n.state='processing'
              AND n.recipient_type='old_team' AND n.event='pending'
              AND tr.status='pending' AND tr.app_consent_required IS TRUE
              AND old_team.telegram_chat_id IS NOT NULL
              AND old_team.telegram_chat_id::text ~ '^[1-9][0-9]{0,15}$'
        ) INTO v_chat_linked;
        IF v_chat_linked THEN v_available_at:=clock_timestamp(); END IF;
    END IF;

    UPDATE public.transfer_notifications SET state=p_state,message_id=p_message_id,
        failure_code=left(p_failure_code,64),
        resolved_chat_id=CASE WHEN p_state='pending' THEN NULL ELSE resolved_chat_id END,
        available_at=v_available_at
    WHERE id=p_id AND claim_token=p_claim_token AND state='processing';
    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.wake_pending_transfer_notifications(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.wake_pending_transfer_notifications(text) TO service_role;
REVOKE ALL ON FUNCTION public.finish_transfer_notification(bigint,uuid,text,bigint,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_transfer_notification(bigint,uuid,text,bigint,text,integer) TO service_role;

COMMIT;
