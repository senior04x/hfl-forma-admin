-- Only the trusted login backend invokes this after consuming the OTP.
BEGIN;
CREATE INDEX IF NOT EXISTS transfer_player_sessions_subject_expiry_idx ON public.transfer_player_sessions(player_id,expires_at);
CREATE FUNCTION public.issue_transfer_login_sessions(p_phone text,p_sessions jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s jsonb; v_id uuid; v_phone text; v_expiry timestamptz:=clock_timestamp()+interval '7 days'; v_result jsonb:='[]';
BEGIN
 IF p_phone IS NULL OR p_phone !~ '^[0-9]{9}$' OR jsonb_typeof(p_sessions) IS DISTINCT FROM 'array' OR jsonb_array_length(p_sessions)>20 THEN RAISE EXCEPTION 'Invalid session request'; END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(p_sessions) LOOP
  IF s->>'actor' IS NULL OR s->>'actor' NOT IN ('player','captain') OR s->>'token_hash' IS NULL OR s->>'token_hash' !~ '^sha256:[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid actor session'; END IF;
  v_id:=(s->>'subject_id')::uuid;
  v_phone:=NULL;
  IF s->>'actor'='player' THEN
   SELECT public.transfer_phone(phone) INTO v_phone FROM public.applications WHERE id=v_id AND status='approved' FOR SHARE;
  ELSE
   SELECT public.transfer_phone(captain_phone) INTO v_phone FROM public.teams WHERE id=v_id FOR SHARE;
  END IF;
  IF v_phone IS DISTINCT FROM p_phone THEN CONTINUE; END IF;
  IF s->>'actor'='player' THEN
   DELETE FROM public.transfer_player_sessions WHERE player_id=v_id AND expires_at<=clock_timestamp();
   INSERT INTO public.transfer_player_sessions(token_hash,player_id,phone,expires_at) VALUES(s->>'token_hash',v_id,p_phone,v_expiry);
  ELSE
   DELETE FROM public.team_sessions WHERE team_id=v_id AND expires_at<=clock_timestamp();
   INSERT INTO public.team_sessions(token,team_id,phone,expires_at) VALUES(s->>'token_hash',v_id,p_phone,v_expiry);
  END IF;
  v_result:=v_result||jsonb_build_array(jsonb_build_object('actor',s->>'actor','subject_id',v_id,'expires_at',v_expiry));
 END LOOP;
 RETURN jsonb_build_object('sessions',v_result);
END;
$$;
REVOKE ALL ON FUNCTION public.issue_transfer_login_sessions(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.issue_transfer_login_sessions(text,jsonb) TO service_role;
COMMIT;
