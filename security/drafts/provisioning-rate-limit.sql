-- DRAFT ONLY. Only verified server actor IDs may reach this function.
BEGIN;
CREATE TABLE public.organization_provisioning_rate (
  actor_id uuid PRIMARY KEY,
  window_started timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts BETWEEN 1 AND 5)
);
ALTER TABLE public.organization_provisioning_rate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organization_provisioning_rate FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.organization_provisioning_rate TO service_role;
CREATE POLICY provisioning_rate_backend ON public.organization_provisioning_rate
  TO service_role USING(true) WITH CHECK(true);

CREATE FUNCTION public.consume_organization_provisioning_rate(p_actor uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE consumed integer; request_time timestamptz := clock_timestamp();
BEGIN
  IF p_actor IS NULL THEN RAISE EXCEPTION 'INVALID_ACTOR' USING ERRCODE='22023'; END IF;
  -- Atomic upsert: row locking serializes simultaneous attempts per actor.
  -- Denied attempts do not grow counters or postpone window expiry.
  INSERT INTO public.organization_provisioning_rate AS limits(actor_id,window_started,attempts)
    VALUES(p_actor,request_time,1)
  ON CONFLICT(actor_id) DO UPDATE SET
    window_started=CASE WHEN limits.window_started <= request_time-interval '15 minutes'
      THEN request_time ELSE limits.window_started END,
    attempts=CASE WHEN limits.window_started <= request_time-interval '15 minutes'
      THEN 1 ELSE limits.attempts+1 END
  WHERE limits.window_started <= request_time-interval '15 minutes' OR limits.attempts<5
  RETURNING attempts INTO consumed;
  RETURN consumed IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION public.consume_organization_provisioning_rate(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_organization_provisioning_rate(uuid) TO service_role;
COMMIT;
