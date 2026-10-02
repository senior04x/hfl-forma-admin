-- DRAFT ONLY. Global authority must be verified by the server before invocation.
BEGIN;
CREATE FUNCTION public.update_organization_details(p_id bigint,p_name text,p_slug text,p_logo_url text,p_expected jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE existing record;
BEGIN
 IF p_id IS NULL OR p_id<=0 OR p_name IS NULL OR length(trim(p_name)) NOT BETWEEN 1 AND 120
  OR p_slug IS NULL OR length(p_slug) NOT BETWEEN 1 AND 80 OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  OR (p_logo_url IS NOT NULL AND (length(p_logo_url)>2048 OR p_logo_url !~ '^https://'))
  OR p_expected IS NULL THEN RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE='22023'; END IF;
 SELECT name,slug,logo_url INTO existing FROM public.organizations WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORGANIZATION_NOT_FOUND' USING ERRCODE='22023'; END IF;
 -- Identical retry after a lost response is safe, even if the snapshot is old.
 IF existing.name=trim(p_name) AND existing.slug=p_slug AND existing.logo_url IS NOT DISTINCT FROM p_logo_url THEN RETURN p_id; END IF;
 IF jsonb_build_object('name',existing.name,'slug',existing.slug,'logoUrl',existing.logo_url) <> p_expected THEN
  RAISE EXCEPTION 'ORGANIZATION_CHANGED' USING ERRCODE='40001';
 END IF;
 UPDATE public.organizations SET name=trim(p_name),slug=p_slug,logo_url=p_logo_url WHERE id=p_id;
 RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.update_organization_details(bigint,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_organization_details(bigint,text,text,text,jsonb) TO service_role;
COMMIT;
