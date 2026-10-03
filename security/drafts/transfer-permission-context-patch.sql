-- Preserve the currently deployed functions, including newer player fields.
BEGIN;
DO $patch$
DECLARE fn regprocedure; original text; changed text; marker text;
BEGIN
 fn:='public.team_transfer_page(text,text,text,uuid,uuid)'::regprocedure;
 original:=pg_get_functiondef(fn);
 marker:='''transfer_window_open'',coalesce(v_window,false))';
 IF strpos(original,marker)=0 OR strpos(original,'team_transfer_allowed')>0 THEN
  RAISE EXCEPTION 'Unexpected team transfer context definition';
 END IF;
 changed:=replace(original,marker,
  '''transfer_window_open'',coalesce(v_window,false), ''team_transfer_allowed'',coalesce((SELECT allowed FROM public.team_transfer_permissions WHERE team_id=v_team.id),true), ''organization_contact_phone'',(SELECT contact_phone FROM public.organizations WHERE id=v_team.organization_id))');
 EXECUTE changed;
 -- Both web and mobile receiving requests return the same safe machine code.
 FOREACH fn IN ARRAY ARRAY[
  'public.request_team_transfer(text,uuid,text,uuid)'::regprocedure,
  'public.request_transfer_app(text,uuid,text,uuid)'::regprocedure
 ] LOOP
  original:=pg_get_functiondef(fn);
  marker:='INSERT INTO public.transfers';
  IF strpos(original,marker)=0 OR strpos(original,'TEAM_TRANSFER_PAYMENT_REQUIRED')>0 THEN
   RAISE EXCEPTION 'Unexpected receiving transfer request definition';
  END IF;
  changed:=replace(original,marker,
   'IF EXISTS (SELECT 1 FROM public.team_transfer_permissions WHERE team_id=v_team.id AND allowed=false) THEN RETURN jsonb_build_object(''status'',403,''error'',''Receiving team transfer access is closed'',''code'',''TEAM_TRANSFER_PAYMENT_REQUIRED''); END IF; '||marker);
  EXECUTE changed;
 END LOOP;
END $patch$;
COMMIT;
