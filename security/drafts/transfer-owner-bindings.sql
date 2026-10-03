-- Install after team-transfer-permissions.sql. Protect transfer authority without
-- changing the existing superadmin or organization profile write paths.
BEGIN;
CREATE TABLE public.organization_transfer_admin_bindings (
 organization_id bigint PRIMARY KEY REFERENCES public.organizations(id) ON DELETE RESTRICT,
 owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.organization_transfer_admin_bindings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organization_transfer_admin_bindings FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.organization_transfer_admin_bindings TO service_role;
CREATE POLICY transfer_binding_backend ON public.organization_transfer_admin_bindings
 TO service_role USING(true) WITH CHECK(true);
-- Bootstrap only unambiguous, verified existing owners. Never infer organization 1.
INSERT INTO public.organization_transfer_admin_bindings(organization_id,owner_id)
 SELECT o.id,u.id FROM public.organizations o JOIN auth.users u ON lower(u.email)=lower(o.admin_email)
 WHERE u.email_confirmed_at IS NOT NULL
 AND (SELECT count(*) FROM public.organizations x WHERE lower(x.admin_email)=lower(u.email))=1
 AND (SELECT count(*) FROM auth.users x WHERE lower(x.email)=lower(u.email))=1;
CREATE OR REPLACE FUNCTION public.organization_owner_matches(p_actor uuid,p_org bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.organization_transfer_admin_bindings b
  JOIN auth.users u ON u.id=b.owner_id
  JOIN public.organizations o ON o.id=b.organization_id
  WHERE b.owner_id=p_actor AND b.organization_id=p_org
   AND u.email_confirmed_at IS NOT NULL AND lower(o.admin_email)=lower(u.email)
   AND (SELECT count(*) FROM public.organizations x WHERE lower(x.admin_email)=lower(u.email))=1
 )
$$;
REVOKE ALL ON FUNCTION public.organization_owner_matches(uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.organization_owner_matches(uuid,bigint) TO service_role;
COMMIT;
