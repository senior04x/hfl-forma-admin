BEGIN;
CREATE FUNCTION public.captain_profile_edit(p_token_hash text,p_team_id uuid,p_player_id uuid,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE context jsonb; tm public.teams%ROWTYPE; pl public.applications%ROWTYPE; opened boolean; num integer; k text; val text;
BEGIN
 IF p_action IS NULL OR p_action NOT IN ('team_edit','player_edit') OR p_data IS NULL OR jsonb_typeof(p_data)<>'object' THEN RETURN jsonb_build_object('status',400,'error','Invalid request'); END IF;
 context:=public.captain_roster_manage(p_token_hash,p_team_id,NULL,'context',NULL);
 IF (context->>'status')::integer<>200 THEN RETURN context; END IF;
 -- Match the player-before-team locking order used by roster and transfer changes.
 IF p_action='player_edit' THEN
  SELECT * INTO pl FROM applications WHERE id=p_player_id FOR UPDATE;
  IF NOT FOUND OR pl.team_id IS DISTINCT FROM p_team_id OR pl.status IS DISTINCT FROM 'approved' OR coalesce(pl.is_archived,false) THEN RETURN jsonb_build_object('status',403,'error','Player unavailable'); END IF;
 END IF;
 SELECT * INTO tm FROM teams WHERE id=p_team_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM team_sessions WHERE token=p_token_hash AND team_id=tm.id AND expires_at>clock_timestamp() AND phone=public.transfer_phone(tm.captain_phone)) THEN RETURN jsonb_build_object('status',403,'error','Captain authorization changed'); END IF;
 SELECT transfer_window_open INTO opened FROM organizations WHERE id=tm.organization_id FOR SHARE;
 IF opened IS DISTINCT FROM true THEN RETURN jsonb_build_object('status',403,'error','Transfer window closed'); END IF;
 IF p_action='player_edit' AND pl.organization_id IS DISTINCT FROM tm.organization_id THEN RETURN jsonb_build_object('status',403,'error','Access denied'); END IF;
 FOR k,val IN SELECT key,value FROM jsonb_each_text(p_data) LOOP
  IF k<>ALL(CASE WHEN p_action='player_edit' THEN ARRAY['phone','photo_url','player_number'] ELSE ARRAY['logo_url','captain_name','captain_phone','coach_name','coach_phone','president_name','president_phone'] END) OR val IS NULL OR length(val)>2048 THEN RETURN jsonb_build_object('status',400,'error','Invalid field'); END IF;
  IF k='captain_phone' AND val='' THEN RETURN jsonb_build_object('status',400,'error','Invalid captain phone'); END IF;
  IF k LIKE '%phone' AND val<>'' AND val !~ '^[0-9]{9}$' THEN RETURN jsonb_build_object('status',400,'error','Invalid phone'); END IF;
  IF k LIKE '%name' AND length(val)>120 THEN RETURN jsonb_build_object('status',400,'error','Invalid name'); END IF;
  IF k LIKE '%url' AND val<>'' AND val !~ '^https://' THEN RETURN jsonb_build_object('status',400,'error','Invalid image'); END IF;
 END LOOP;
 IF p_action='player_edit' THEN
  IF p_data ? 'player_number' THEN
   IF p_data->>'player_number' !~ '^[1-9][0-9]?$' THEN RETURN jsonb_build_object('status',400,'error','Invalid number'); END IF;
   num:=(p_data->>'player_number')::integer;
   IF EXISTS(SELECT 1 FROM applications WHERE team_id=tm.id AND id<>pl.id AND status='approved' AND coalesce(is_archived,false)=false AND regexp_replace(btrim(player_number::text),'^0+','')=num::text) THEN RETURN jsonb_build_object('status',409,'error','Number already used'); END IF;
  END IF;
  UPDATE applications SET phone=CASE WHEN p_data ? 'phone' THEN p_data->>'phone' ELSE phone END,photo_url=CASE WHEN p_data ? 'photo_url' THEN nullif(p_data->>'photo_url','') ELSE photo_url END,player_number=CASE WHEN num IS NOT NULL THEN num::text ELSE player_number END WHERE id=pl.id;
 ELSE
  UPDATE teams SET logo_url=coalesce(p_data->>'logo_url',logo_url),captain_name=coalesce(p_data->>'captain_name',captain_name),captain_phone=coalesce(p_data->>'captain_phone',captain_phone),coach_name=coalesce(p_data->>'coach_name',coach_name),coach_phone=coalesce(p_data->>'coach_phone',coach_phone),president_name=coalesce(p_data->>'president_name',president_name),president_phone=coalesce(p_data->>'president_phone',president_phone) WHERE id=tm.id;
 END IF;
 RETURN jsonb_build_object('status',200,'success',true);
END $$;
REVOKE ALL ON FUNCTION public.captain_profile_edit(text,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.captain_profile_edit(text,uuid,uuid,text,jsonb) TO service_role;
-- Existing organization-admin authorization is preserved; mobile captains use the RPC.
CREATE FUNCTION public.guard_captain_profile_fields() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF auth.role() IN ('anon','authenticated') AND NOT public.transfer_admin_authorized(OLD.organization_id) THEN RAISE EXCEPTION 'Use authorized profile controls' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_captain_player_profile BEFORE UPDATE OF phone,photo_url ON public.applications FOR EACH ROW WHEN (OLD.phone IS DISTINCT FROM NEW.phone OR OLD.photo_url IS DISTINCT FROM NEW.photo_url) EXECUTE FUNCTION public.guard_captain_profile_fields();
CREATE TRIGGER guard_captain_team_profile BEFORE UPDATE OF logo_url,captain_name,captain_phone,coach_name,coach_phone,president_name,president_phone ON public.teams FOR EACH ROW WHEN (ROW(OLD.logo_url,OLD.captain_name,OLD.captain_phone,OLD.coach_name,OLD.coach_phone,OLD.president_name,OLD.president_phone) IS DISTINCT FROM ROW(NEW.logo_url,NEW.captain_name,NEW.captain_phone,NEW.coach_name,NEW.coach_phone,NEW.president_name,NEW.president_phone)) EXECUTE FUNCTION public.guard_captain_profile_fields();
COMMIT;
