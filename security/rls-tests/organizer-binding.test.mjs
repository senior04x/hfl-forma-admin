import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const sql=await readFile(new URL('../drafts/organizer-auth-bindings.sql',import.meta.url),'utf8');
const actor='11111111-1111-4111-8111-111111111111';
const user='22222222-2222-4222-8222-222222222222';
const other='33333333-3333-4333-8333-333333333333';
test('explicit verified organizer binding is immutable and own-identity readable',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
   INSERT INTO auth.users VALUES('${actor}','admin@example.invalid',now()),('${user}','organizer@example.invalid',now()),('${other}','other@example.invalid',NULL);
   CREATE TABLE organizations(id bigint PRIMARY KEY);INSERT INTO organizations VALUES(1),(2);
   CREATE TABLE admin_users(id uuid PRIMARY KEY,role text,organization_id bigint);
   INSERT INTO admin_users VALUES('${actor}','org_admin',1);
   CREATE TABLE organization_users(id bigint PRIMARY KEY,email text,role text,organization_id bigint,password text);
   INSERT INTO organization_users VALUES(10,'organizer@example.invalid','user',1,'synthetic-unchanged'),(20,'other@example.invalid','user',2,'synthetic-other');
   GRANT USAGE ON SCHEMA public,auth TO service_role,authenticated;
   GRANT SELECT ON auth.users,admin_users,organizations TO service_role;
   GRANT SELECT,UPDATE ON organization_users TO service_role;`);
  await db.exec(sql);
  const bind=(u=user,p=10,o=1)=>db.query('SELECT bind_organizer_auth($1,$2,$3,$4) AS id',[actor,u,p,o]);
  await db.exec('SET ROLE authenticated');await assert.rejects(bind(),{code:'42501'});
  await db.exec('RESET ROLE;SET ROLE service_role');
  await assert.rejects(bind(other,20,2),{code:'42501'});
  await assert.rejects(bind(other),{code:'22023'});
  assert.equal((await bind()).rows[0].id,10);assert.equal((await bind()).rows[0].id,10);
  await db.exec('RESET ROLE');
  // A confirmed different UID with the same email must still not replace binding.
  await db.query('UPDATE auth.users SET email=$1,email_confirmed_at=now() WHERE id=$2',['organizer@example.invalid',other]);
  await db.exec('SET ROLE service_role');await assert.rejects(bind(other),{code:'23505'});await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('SET ROLE authenticated');
  assert.equal((await db.query('SELECT organization_id FROM organizer_auth_bindings')).rows[0].organization_id,1);
  await assert.rejects(db.query("UPDATE organizer_auth_bindings SET organization_id=2"),{code:'42501'});
  await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[other]);await db.exec('SET ROLE authenticated');
  assert.equal((await db.query('SELECT organization_id FROM organizer_auth_bindings')).rows.length,0);
  await db.exec('RESET ROLE;SET ROLE anon');await assert.rejects(db.query('SELECT profile_id FROM organizer_auth_bindings'),{code:'42501'});
  await db.exec('RESET ROLE');
  assert.equal((await db.query('SELECT password FROM organization_users WHERE id=10')).rows[0].password,'synthetic-unchanged');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM organization_users')).rows[0].n,2);
 } finally {await db.close();}
});
