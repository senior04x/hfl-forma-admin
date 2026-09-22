-- Transactional player notifications. No action buttons or player consent.
BEGIN;
CREATE TABLE IF NOT EXISTS public.transfer_notifications (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    transfer_id uuid NOT NULL REFERENCES public.transfers(id) ON DELETE CASCADE,
    player_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
    event text NOT NULL CHECK (event IN ('pending','approved','rejected')),
    team_name text NOT NULL,
    state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','processing','sent','failed','uncertain')),
    available_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    claimed_at timestamptz,
    claim_token uuid,
    message_id bigint,
    failure_code text,
    UNIQUE (transfer_id,event)
);
ALTER TABLE public.transfer_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.transfer_notifications FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS transfer_notifications_pending_idx
ON public.transfer_notifications(available_at,id) WHERE state='pending';
CREATE INDEX IF NOT EXISTS transfer_notifications_expiry_idx
ON public.transfer_notifications(created_at) WHERE state='pending';
CREATE INDEX IF NOT EXISTS transfer_notifications_processing_idx
ON public.transfer_notifications(claimed_at) WHERE state='processing';

CREATE OR REPLACE FUNCTION public.enqueue_transfer_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
    IF NEW.requested_by_team_id IS NULL OR NEW.player_id IS NULL THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
    IF NEW.status IN ('pending','approved','rejected') THEN
        INSERT INTO public.transfer_notifications(transfer_id,player_id,event,team_name)
        VALUES (NEW.id,NEW.player_id,NEW.status,coalesce(NEW.new_team_name,''))
        ON CONFLICT (transfer_id,event) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enqueue_transfer_notification ON public.transfers;
CREATE TRIGGER enqueue_transfer_notification AFTER INSERT OR UPDATE ON public.transfers
FOR EACH ROW EXECUTE FUNCTION public.enqueue_transfer_notification();

CREATE OR REPLACE FUNCTION public.claim_transfer_notification()
RETURNS SETOF public.transfer_notifications LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE v_id bigint;
BEGIN
    -- Never automatically resend after a crash/unknown Telegram outcome.
    UPDATE public.transfer_notifications SET state='uncertain', failure_code='stale_claim'
    WHERE state='processing' AND claimed_at < clock_timestamp()-interval '5 minutes';
    UPDATE public.transfer_notifications SET state='failed',failure_code='expired'
    WHERE state='pending' AND created_at < clock_timestamp()-interval '7 days';
    SELECT n.id INTO v_id FROM public.transfer_notifications n
    WHERE n.state='pending' AND n.available_at <= clock_timestamp()
      AND NOT EXISTS (SELECT 1 FROM public.transfer_notifications earlier
          WHERE earlier.transfer_id=n.transfer_id AND earlier.id<n.id
            AND earlier.state IN ('pending','processing'))
    ORDER BY n.available_at,n.id FOR UPDATE OF n SKIP LOCKED LIMIT 1;
    IF v_id IS NULL THEN RETURN; END IF;
    RETURN QUERY UPDATE public.transfer_notifications
    SET state='processing',claimed_at=clock_timestamp(),claim_token=gen_random_uuid()
    WHERE id=v_id RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_transfer_notification(
    p_id bigint,p_claim_token uuid,p_state text,p_message_id bigint DEFAULT NULL,
    p_failure_code text DEFAULT NULL,p_retry_seconds integer DEFAULT 60
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
    IF p_state NOT IN ('pending','sent','failed','uncertain') OR p_state IS NULL THEN
        RAISE EXCEPTION 'Invalid delivery state';
    END IF;
    UPDATE public.transfer_notifications SET state=p_state,message_id=p_message_id,
        failure_code=left(p_failure_code,64),
        available_at=clock_timestamp()+make_interval(secs=>greatest(5,least(coalesce(p_retry_seconds,60),86400)))
    WHERE id=p_id AND claim_token=p_claim_token AND state='processing';
    RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_transfer_notification() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finish_transfer_notification(bigint,uuid,text,bigint,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_transfer_notification() TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_transfer_notification(bigint,uuid,text,bigint,text,integer) TO service_role;
COMMIT;
