import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const sql = await readFile(new URL('../drafts/provision-organization.sql', import.meta.url), 'utf8');
const uid = '11111111-1111-4111-8111-111111111111';
test('provisioning is atomic, repeatable and unavailable to clients', async () => {
 const db = new PGlite();
 try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
   CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
   INSERT INTO auth.users VALUES('${uid}','synthetic@example.invalid');
   CREATE TABLE organizations(id serial PRIMARY KEY,name text,slug text UNIQUE,logo_url text,admin_email text);
   CREATE TABLE admin_users(id uuid PRIMARY KEY,email text,role text,organization_id integer REFERENCES organizations);
   GRANT USAGE ON SCHEMA public,auth TO service_role;
   GRANT SELECT ON auth.users TO service_role;
   GRANT ALL ON organizations,admin_users TO service_role;
   GRANT USAGE ON SEQUENCE organizations_id_seq TO service_role;`);
  await db.exec(sql);
  const invoke = (name='Synthetic', slug='synthetic') => db.query(
   'SELECT provision_organization($1,$2,$3,$4) AS id',[uid,'synthetic@example.invalid',name,slug]);
  await db.exec('SET ROLE authenticated');
  await assert.rejects(invoke(),{code:'42501'});
  await db.exec('RESET ROLE; SET ROLE service_role');
  const first = (await invoke()).rows[0].id;
  assert.equal((await invoke()).rows[0].id,first);
  await assert.rejects(invoke('Changed'),{code:'23505'});
  await db.exec('RESET ROLE');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM organizations')).rows[0].n,1);
  assert.equal((await db.query('SELECT admin_email FROM organizations WHERE id=$1',[first])).rows[0].admin_email,'synthetic@example.invalid');
  // A failed organization insert must not leave a partial record.
  await db.exec(`INSERT INTO auth.users VALUES('22222222-2222-4222-8222-222222222222','fail@example.invalid');
   ALTER TABLE organizations ADD CONSTRAINT deny_fixture CHECK(admin_email <> 'fail@example.invalid');
   SET ROLE service_role;`);
  await assert.rejects(db.query("SELECT provision_organization('22222222-2222-4222-8222-222222222222','fail@example.invalid','Fail','fail')"),{code:'23514'});
  await db.exec('RESET ROLE');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM organizations')).rows[0].n,1);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM admin_users')).rows[0].n,0);
 } finally { await db.close(); }
});
