import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const draft = await readFile(new URL('../drafts/admin-users-isolation.sql', import.meta.url), 'utf8');
async function fixture() {
  const db = new PGlite(); // Memory only: no URL, env, production credentials or persisted files.
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    CREATE TABLE public.admin_users (id uuid PRIMARY KEY, email text, role text, organization_id integer);
    INSERT INTO public.admin_users VALUES
      ('${first}', 'synthetic-a@example.invalid', 'org_admin', 1),
      ('${second}', 'synthetic-b@example.invalid', 'org_admin', 2);
    ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
    GRANT ALL ON public.admin_users TO anon, authenticated, service_role;
    GRANT SELECT(email) ON public.admin_users TO authenticated;
    CREATE POLICY "Allow manage admin_users" ON public.admin_users FOR ALL TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY "Allow read admin_users" ON public.admin_users FOR SELECT TO anon, authenticated USING (true);
  `);
  return db;
}
async function asRole(db, role, uid, sql) {
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [uid]);
  await db.exec(`SET ROLE ${role}`); // Role is a fixed test constant, never user input.
  try { return await db.query(sql); } finally { await db.exec('RESET ROLE'); }
}
test('real PostgreSQL RLS isolates identities and denies client membership writes', async () => {
  const db = await fixture();
  try {
    assert.equal((await asRole(db, 'anon', '', 'SELECT email FROM admin_users')).rows.length, 2);
    await db.exec(draft);
    await assert.rejects(asRole(db, 'anon', '', 'SELECT id FROM admin_users'), { code: '42501' });
    assert.deepEqual((await asRole(db, 'authenticated', first, 'SELECT id, role, organization_id FROM admin_users')).rows,
      [{ id: first, role: 'org_admin', organization_id: 1 }]);
    assert.equal((await asRole(db, 'authenticated', first, `SELECT id FROM admin_users WHERE id='${second}'`)).rows.length, 0);
    await assert.rejects(asRole(db, 'authenticated', first, 'SELECT email FROM admin_users'), { code: '42501' });
    for (const sql of [
      "UPDATE admin_users SET role='super_admin'",
      'UPDATE admin_users SET organization_id=2',
      `DELETE FROM admin_users WHERE id='${second}'`,
      "INSERT INTO admin_users VALUES ('33333333-3333-4333-8333-333333333333','fake@example.invalid','super_admin',1)",
    ]) await assert.rejects(asRole(db, 'authenticated', first, sql), { code: '42501' });
    assert.equal((await asRole(db, 'authenticated', second, 'SELECT organization_id FROM admin_users')).rows[0].organization_id, 2);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM admin_users')).rows[0].n, 2);
    await asRole(db, 'service_role', '', "INSERT INTO admin_users VALUES ('33333333-3333-4333-8333-333333333333','server@example.invalid','org_admin',3)");
    assert.equal((await db.query('SELECT count(*)::int AS n FROM admin_users')).rows[0].n, 3);
  } finally { await db.close(); }
});
test('unknown policies abort and rollback the draft', async () => {
  const db = await fixture();
  try {
    await db.exec('CREATE POLICY unexpected_access ON admin_users FOR SELECT TO anon USING (true)');
    await assert.rejects(db.exec(draft), /Unexpected admin_users policies/);
    await db.exec('ROLLBACK');
    assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_policies WHERE tablename='admin_users'")).rows[0].n, 3);
  } finally { await db.close(); }
});
