-- DRAFT ONLY: coordinate superadmin server provisioning and owner-email changes first.
-- Public reads remain unchanged; this change protects writes only.
BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='organizations'
  AND cmd IN ('ALL','UPDATE','INSERT','DELETE') AND policyname NOT IN
  ('Allow authenticated manage organizations','Org admins can update own org','Service role manage organizations')) THEN
  RAISE EXCEPTION 'Unexpected organization write policies';
 END IF;
END $$;
DROP POLICY IF EXISTS "Allow authenticated manage organizations" ON public.organizations;
DROP POLICY IF EXISTS "Org admins can update own org" ON public.organizations;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.organizations FROM PUBLIC,anon,authenticated;
DO $$ DECLARE col record; BEGIN
 FOR col IN SELECT attname FROM pg_attribute WHERE attrelid='public.organizations'::regclass AND attnum>0 AND NOT attisdropped LOOP
  EXECUTE format('REVOKE INSERT (%I), UPDATE (%I), REFERENCES (%I) ON public.organizations FROM PUBLIC,anon,authenticated',col.attname,col.attname,col.attname);
  IF col.attname=ANY(ARRAY['name','slug','logo_url','brand_colors','contact_phone','transfer_window_open','is_registration_open','export_bg_url']) THEN
   EXECUTE format('GRANT UPDATE (%I) ON public.organizations TO authenticated',col.attname);
  END IF;
 END LOOP;
END $$;
CREATE FUNCTION public.organization_owner_can_update(p_org bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS(SELECT 1 FROM auth.users u JOIN public.organizations o ON lower(o.admin_email)=lower(u.email)
  WHERE u.id=auth.uid() AND u.email_confirmed_at IS NOT NULL AND o.id=p_org
   AND (SELECT count(*) FROM public.organizations other WHERE lower(other.admin_email)=lower(u.email))=1)
$$;
REVOKE ALL ON FUNCTION public.organization_owner_can_update(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.organization_owner_can_update(bigint) TO authenticated;
CREATE POLICY organization_owner_update ON public.organizations FOR UPDATE TO authenticated
 USING(public.organization_owner_can_update(id)) WITH CHECK(public.organization_owner_can_update(id));
COMMIT;
