BEGIN;
CREATE OR REPLACE FUNCTION public.guard_public_registration_open()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE registration_open boolean;
BEGIN
 -- Public web/mobile registration uses the anon role. Admin/service operations
 -- and updates to existing records retain their current authorization rules.
 IF current_setting('role',true) IS DISTINCT FROM 'anon' THEN RETURN NEW; END IF;
 SELECT is_registration_open INTO registration_open FROM public.organizations
 WHERE id=NEW.organization_id FOR SHARE;
 IF registration_open IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'REGISTRATION_CLOSED' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_public_registration_open() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_public_registration_open BEFORE INSERT ON public.applications
 FOR EACH ROW EXECUTE FUNCTION public.guard_public_registration_open();
CREATE TRIGGER guard_public_registration_open BEFORE INSERT ON public.teams
 FOR EACH ROW EXECUTE FUNCTION public.guard_public_registration_open();
COMMIT;
