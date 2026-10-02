-- DRAFT ONLY. Do not deploy before server provisioning and login migration.
BEGIN;
DROP POLICY IF EXISTS "Allow manage admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "Allow read admin_users" ON public.admin_users;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'admin_users') THEN
    RAISE EXCEPTION 'Unexpected admin_users policies; review before proceeding';
  END IF;
END $$;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_users FROM anon, authenticated;
DO $$
DECLARE col record;
BEGIN
  FOR col IN SELECT attname FROM pg_attribute
    WHERE attrelid = 'public.admin_users'::regclass AND attnum > 0 AND NOT attisdropped
  LOOP
    EXECUTE format('REVOKE ALL (%I) ON public.admin_users FROM anon, authenticated', col.attname);
  END LOOP;
END $$;
GRANT SELECT (id, role, organization_id) ON public.admin_users TO authenticated;
CREATE POLICY admin_users_read_own_identity ON public.admin_users
  FOR SELECT TO authenticated USING (id = auth.uid());
COMMIT;
