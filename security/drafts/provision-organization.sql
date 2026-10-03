-- DRAFT: requires protected admin_users and a separately authorized server endpoint.
BEGIN;
CREATE OR REPLACE FUNCTION public.provision_organization(
  p_user_id uuid, p_email text, p_name text, p_slug text, p_logo_url text DEFAULT NULL
) RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE existing record; created_id bigint;
BEGIN
  IF p_user_id IS NULL OR p_email IS NULL OR p_name IS NULL OR p_slug IS NULL
    OR length(trim(p_name)) NOT BETWEEN 1 AND 120
    OR length(p_email) NOT BETWEEN 3 AND 254
    OR length(p_slug) NOT BETWEEN 1 AND 80 OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    OR (p_logo_url IS NOT NULL AND (length(p_logo_url) > 2048 OR p_logo_url !~ '^https://')) THEN
    RAISE EXCEPTION 'INVALID_PROVISIONING_INPUT' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id AND lower(email) = lower(p_email)) THEN
    RAISE EXCEPTION 'AUTH_IDENTITY_MISMATCH' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('provision-email:' || lower(p_email), 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('provision-slug:' || p_slug, 0));
  SELECT o.admin_email, o.id, o.name, o.slug, o.logo_url INTO existing
    FROM public.organizations o WHERE lower(o.admin_email)=lower(p_email);
  IF FOUND THEN
    IF (SELECT count(*) FROM public.organizations WHERE lower(admin_email)=lower(p_email))=1
      AND existing.name = trim(p_name) AND existing.slug = p_slug
      AND existing.logo_url IS NOT DISTINCT FROM p_logo_url THEN
      RETURN existing.id;
    END IF;
    RAISE EXCEPTION 'PROVISIONING_CONFLICT' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM public.organizations WHERE slug = p_slug) THEN
    RAISE EXCEPTION 'PROVISIONING_CONFLICT' USING ERRCODE = '23505';
  END IF;
  INSERT INTO public.organizations(name, slug, logo_url, admin_email) VALUES(trim(p_name), p_slug, p_logo_url, lower(p_email))
    RETURNING id INTO created_id;
  RETURN created_id;
END $$;
REVOKE ALL ON FUNCTION public.provision_organization(uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_organization(uuid,text,text,text,text) TO service_role;
COMMIT;
