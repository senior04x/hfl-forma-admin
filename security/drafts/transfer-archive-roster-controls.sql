BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE definition text; needle text:='UPDATE public.applications SET team_id=v_to.id WHERE id=v_player.id;';
BEGIN
 definition:=pg_get_functiondef('public.apply_transfer_membership()'::regprocedure);
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'Unexpected membership function'; END IF;
 EXECUTE replace(definition,needle,'UPDATE public.applications SET team_id=v_to.id, is_archived=CASE WHEN NEW.status=''approved'' THEN false ELSE is_archived END WHERE id=v_player.id;');
END $$;

CREATE TABLE public.captain_roster_rate (
 team_id uuid PRIMARY KEY REFERENCES public.teams(id) ON DELETE CASCADE,
 window_started timestamptz NOT NULL,
 attempts integer NOT NULL CHECK(attempts BETWEEN 1 AND 60)
);
ALTER TABLE public.captain_roster_rate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.captain_roster_rate FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.captain_roster_manage(p_token_hash text,p_team_id uuid,p_player_id uuid,p_action text,p_number integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.team_sessions%ROWTYPE; player public.applications%ROWTYPE;
 team public.teams%ROWTYPE; window_open boolean; rate_allowed boolean;
BEGIN
 IF p_token_hash IS NULL OR p_token_hash !~ '^sha256:[0-9a-f]{64}$' OR p_team_id IS NULL
 OR p_action IS NULL OR p_action NOT IN ('context','archive','number') THEN
  RETURN jsonb_build_object('status',400,'error','Invalid request'); END IF;
 SELECT * INTO s FROM team_sessions WHERE token=p_token_hash AND expires_at>clock_timestamp() FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status',401,'error','Session expired'); END IF;
 IF s.team_id IS DISTINCT FROM p_team_id THEN RETURN jsonb_build_object('status',403,'error','Access denied'); END IF;
 INSERT INTO public.captain_roster_rate AS r(team_id,window_started,attempts)
 VALUES(p_team_id,clock_timestamp(),1)
 ON CONFLICT(team_id) DO UPDATE SET
  window_started=CASE WHEN r.window_started<=clock_timestamp()-interval '1 minute' THEN clock_timestamp() ELSE r.window_started END,
  attempts=CASE WHEN r.window_started<=clock_timestamp()-interval '1 minute' THEN 1 ELSE r.attempts+1 END
 WHERE r.window_started<=clock_timestamp()-interval '1 minute' OR r.attempts<60
 RETURNING true INTO rate_allowed;
 IF rate_allowed IS DISTINCT FROM true THEN RETURN jsonb_build_object('status',429,'error','Try again later'); END IF;
 -- Same player-before-team lock order as membership changes; team lock serializes numbers.
 IF p_action<>'context' THEN
  SELECT * INTO player FROM applications WHERE id=p_player_id FOR UPDATE;
  IF NOT FOUND OR player.team_id IS DISTINCT FROM p_team_id OR player.status IS DISTINCT FROM 'approved' THEN
   RETURN jsonb_build_object('status',403,'error','Player unavailable'); END IF;
 END IF;
 IF p_action='context' THEN
  SELECT * INTO team FROM teams WHERE id=p_team_id;
 ELSE
  SELECT * INTO team FROM teams WHERE id=p_team_id FOR UPDATE;
 END IF;
 IF NOT FOUND OR public.transfer_phone(team.captain_phone) IS NULL
 OR public.transfer_phone(team.captain_phone) IS DISTINCT FROM s.phone THEN
  RETURN jsonb_build_object('status',403,'error','Captain authorization changed'); END IF;
 SELECT transfer_window_open INTO window_open FROM organizations WHERE id=team.organization_id FOR SHARE;
 IF p_action='context' THEN RETURN jsonb_build_object('status',200,'transfer_window_open',coalesce(window_open,false)); END IF;
 IF window_open IS DISTINCT FROM true THEN RETURN jsonb_build_object('status',403,'error','Transfer window closed'); END IF;
 IF player.organization_id IS DISTINCT FROM team.organization_id THEN RETURN jsonb_build_object('status',403,'error','Access denied'); END IF;
 IF p_action='archive' THEN
  IF EXISTS(SELECT 1 FROM transfers WHERE player_id=player.id AND status='pending') THEN
   RETURN jsonb_build_object('status',409,'error','Pending transfer'); END IF;
  UPDATE applications SET is_archived=true WHERE id=player.id;
 ELSE
  IF p_number IS NULL OR p_number NOT BETWEEN 1 AND 99 THEN RETURN jsonb_build_object('status',400,'error','Invalid number'); END IF;
  IF player.is_archived THEN RETURN jsonb_build_object('status',409,'error','Player archived'); END IF;
  IF EXISTS(SELECT 1 FROM applications WHERE team_id=team.id AND id<>player.id
   AND status='approved' AND coalesce(is_archived,false)=false AND player_number::text=p_number::text) THEN
   RETURN jsonb_build_object('status',409,'error','Number already used'); END IF;
  UPDATE applications SET player_number=p_number::text WHERE id=player.id;
 END IF;
 RETURN jsonb_build_object('status',200,'success',true);
END $$;
REVOKE ALL ON FUNCTION public.captain_roster_manage(text,uuid,uuid,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.captain_roster_manage(text,uuid,uuid,text,integer) TO service_role;

-- Captains cannot bypass the window by calling the legacy table API directly.
CREATE OR REPLACE FUNCTION public.guard_captain_roster_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF ROW(NEW.is_archived,NEW.player_number) IS DISTINCT FROM ROW(OLD.is_archived,OLD.player_number)
 AND auth.role() IN ('anon','authenticated') AND NOT public.transfer_admin_authorized(OLD.organization_id) THEN
  RAISE EXCEPTION 'Use authorized roster controls' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_captain_roster_fields BEFORE UPDATE OF is_archived,player_number ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.guard_captain_roster_fields();

-- Repair the reported player only when finalized history matches current membership.
UPDATE public.applications a SET is_archived=false
WHERE a.id='24d53633-0f92-4afb-a150-44ffe4c209fe' AND a.is_archived AND a.status='approved' AND EXISTS(
 SELECT 1 FROM public.transfers tr JOIN public.player_career_history h ON h.transfer_id=tr.id
 WHERE tr.status='approved' AND tr.player_id=a.id AND tr.new_team_id=a.team_id
 AND h.player_id=a.id AND h.team_id=a.team_id AND h.left_at IS NULL);
COMMIT;
