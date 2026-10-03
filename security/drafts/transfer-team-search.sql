BEGIN;
-- Keep the three-argument RPC compatible with existing admin versions.
CREATE FUNCTION public.admin_team_transfer_access_page(p_org bigint,p_league text,p_after uuid,p_query text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE items jsonb; filters jsonb; query text; pattern text;
BEGIN
 query:=btrim(coalesce(p_query,''));
 IF p_org IS NULL OR p_org<=0 OR (p_league IS NOT NULL AND length(p_league)>120)
  OR (query<>'' AND length(query) NOT BETWEEN 2 AND 80) THEN
  RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE='22023'; END IF;
 IF NOT public.organization_owner_matches(auth.uid(),p_org) THEN
  RAISE EXCEPTION 'ADMIN_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 pattern:='%'||replace(replace(replace(lower(query),chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_')||'%';
 SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]'::jsonb) INTO items FROM (
  SELECT t.id,t.name,t.league,coalesce(p.allowed,true) AS allowed FROM public.teams t
  LEFT JOIN public.team_transfer_permissions p ON p.team_id=t.id
  WHERE t.organization_id=p_org AND coalesce(t.is_archived,false)=false
   AND (p_league IS NULL OR t.league=p_league) AND (p_after IS NULL OR t.id>p_after)
   AND (query='' OR lower(t.name) LIKE pattern)
  ORDER BY t.id LIMIT 31
 ) r;
 IF p_after IS NULL THEN
  SELECT coalesce(jsonb_agg(name ORDER BY name),'[]'::jsonb) INTO filters FROM (
   SELECT DISTINCT league AS name FROM public.teams WHERE organization_id=p_org
   AND coalesce(is_archived,false)=false AND league IS NOT NULL AND league<>'' ORDER BY league LIMIT 100
  ) r;
 END IF;
 RETURN jsonb_build_object('items',items,'leagues',filters);
END $$;
REVOKE ALL ON FUNCTION public.admin_team_transfer_access_page(bigint,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_team_transfer_access_page(bigint,text,uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
