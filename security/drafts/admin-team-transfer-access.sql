-- DRAFT after team-transfer-permissions.sql AND protected admin_users authority.
BEGIN;
CREATE INDEX teams_transfer_access_page_idx ON public.teams(organization_id,league,id);
CREATE FUNCTION public.admin_team_transfer_access_page(p_org bigint,p_league text DEFAULT NULL,p_after uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE items jsonb; filters jsonb;
BEGIN
 IF p_org IS NULL OR p_org<=0 OR (p_league IS NOT NULL AND length(p_league)>120) THEN RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.admin_users WHERE id=auth.uid() AND organization_id=p_org AND role IN ('org_admin','super_admin')) THEN
  RAISE EXCEPTION 'ADMIN_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]'::jsonb) INTO items FROM (
  SELECT t.id,t.name,t.league,coalesce(p.allowed,true) AS allowed FROM public.teams t
   LEFT JOIN public.team_transfer_permissions p ON p.team_id=t.id
   WHERE t.organization_id=p_org AND coalesce(t.is_archived,false)=false
    AND (p_league IS NULL OR t.league=p_league) AND (p_after IS NULL OR t.id>p_after)
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
CREATE FUNCTION public.admin_set_team_transfer_access(p_org bigint,p_team uuid,p_allowed boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 -- Server derives actor from signed JWT. No actor identifier supplied by UI.
 RETURN public.set_team_transfer_permission(auth.uid(),p_org,p_team,p_allowed);
END $$;
REVOKE ALL ON FUNCTION public.admin_team_transfer_access_page(bigint,text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.admin_set_team_transfer_access(bigint,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_team_transfer_access_page(bigint,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_team_transfer_access(bigint,uuid,boolean) TO authenticated;
COMMIT;
