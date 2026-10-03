BEGIN;
ALTER TABLE public.transfer_notifications
    ADD COLUMN recipient_type text NOT NULL DEFAULT 'player' CHECK (recipient_type IN ('player','old_team','new_team')),
    ADD COLUMN app_consent_required boolean NOT NULL DEFAULT false,
    ADD COLUMN player_name text NOT NULL DEFAULT '',
    ADD COLUMN old_team_name text NOT NULL DEFAULT '',
    ADD COLUMN resolved_chat_id text CHECK (resolved_chat_id ~ '^[1-9][0-9]*$');
ALTER TABLE public.transfer_notifications DROP CONSTRAINT transfer_notifications_transfer_id_event_key;
ALTER TABLE public.transfer_notifications ADD CONSTRAINT transfer_notification_role_unique UNIQUE(transfer_id,event,recipient_type);
CREATE UNIQUE INDEX transfer_notification_private_chat_unique ON public.transfer_notifications(transfer_id,event,resolved_chat_id)
WHERE resolved_chat_id IS NOT NULL AND state IN ('processing','sent','uncertain');

CREATE OR REPLACE FUNCTION public.enqueue_transfer_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_party text;
BEGIN
    IF NEW.requested_by_team_id IS NULL OR NEW.player_id IS NULL THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
    IF NEW.status NOT IN ('pending','approved','rejected') THEN RETURN NEW; END IF;
    FOREACH v_party IN ARRAY CASE WHEN NEW.app_consent_required THEN ARRAY['player','old_team','new_team'] ELSE ARRAY['player'] END LOOP
        INSERT INTO public.transfer_notifications(transfer_id,player_id,event,team_name,recipient_type,app_consent_required,player_name,old_team_name)
        VALUES(NEW.id,NEW.player_id,NEW.status,coalesce(NEW.new_team_name,''),v_party,NEW.app_consent_required,
            coalesce(NEW.player_name,''),coalesce(NEW.old_team_name,'')) ON CONFLICT DO NOTHING;
    END LOOP;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_transfer_notification()
RETURNS SETOF public.transfer_notifications LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_id bigint;
BEGIN
    UPDATE public.transfer_notifications SET state='uncertain',failure_code='stale_claim'
    WHERE state='processing' AND claimed_at<clock_timestamp()-interval '5 minutes';
    UPDATE public.transfer_notifications SET state='failed',failure_code='expired'
    WHERE state='pending' AND created_at<clock_timestamp()-interval '7 days';
    SELECT n.id INTO v_id FROM public.transfer_notifications n WHERE n.state='pending' AND n.available_at<=clock_timestamp()
        AND NOT EXISTS (SELECT 1 FROM public.transfer_notifications earlier WHERE earlier.transfer_id=n.transfer_id
            AND earlier.recipient_type=n.recipient_type AND earlier.id<n.id AND earlier.state IN ('pending','processing'))
    ORDER BY n.available_at,n.id FOR UPDATE OF n SKIP LOCKED LIMIT 1;
    IF v_id IS NULL THEN RETURN; END IF;
    RETURN QUERY UPDATE public.transfer_notifications SET state='processing',claimed_at=clock_timestamp(),claim_token=gen_random_uuid()
    WHERE id=v_id RETURNING *;
END;
$$;

CREATE FUNCTION public.reserve_transfer_notification_chat(p_id bigint,p_claim_token uuid,p_chat_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
    IF p_chat_id IS NULL OR p_chat_id !~ '^[1-9][0-9]*$' THEN RETURN false; END IF;
    UPDATE public.transfer_notifications SET resolved_chat_id=p_chat_id
    WHERE id=p_id AND claim_token=p_claim_token AND state='processing';
    RETURN FOUND;
EXCEPTION WHEN unique_violation THEN RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_transfer_notification(
    p_id bigint,p_claim_token uuid,p_state text,p_message_id bigint DEFAULT NULL,
    p_failure_code text DEFAULT NULL,p_retry_seconds integer DEFAULT 60
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
    IF p_state IS NULL OR p_state NOT IN ('pending','sent','failed','uncertain') THEN RAISE EXCEPTION 'Invalid delivery state'; END IF;
    UPDATE public.transfer_notifications SET state=p_state,message_id=p_message_id,failure_code=left(p_failure_code,64),
        resolved_chat_id=CASE WHEN p_state='pending' THEN NULL ELSE resolved_chat_id END,
        available_at=clock_timestamp()+make_interval(secs=>greatest(5,least(coalesce(p_retry_seconds,60),86400)))
    WHERE id=p_id AND claim_token=p_claim_token AND state='processing';
    RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_transfer_notification_chat(bigint,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_transfer_notification_chat(bigint,uuid,text) TO service_role;
COMMIT;
