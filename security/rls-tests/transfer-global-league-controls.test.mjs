import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
test('global window resets every team; league overrides remain scoped and cannot bypass closed window',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
   CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
   INSERT INTO auth.users VALUES('11111111-1111-4111-8111-111111111111','owner@test.invalid',now()),('99999999-9999-4999-8999-999999999999','other@test.invalid',now());
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT '11111111-1111-4111-8111-111111111111'::uuid$$;
   CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT 'authenticated'::text$$;
   CREATE TABLE organizations(id bigint PRIMARY KEY,admin_email text,transfer_window_open boolean);
   INSERT INTO organizations VALUES(1,'owner@test.invalid',false),(2,'other@test.invalid',true);
   CREATE TABLE teams(id uuid PRIMARY KEY,organization_id bigint,league text);
   INSERT INTO teams VALUES('22222222-2222-4222-8222-222222222222',1,'A'),('33333333-3333-4333-8333-333333333333',1,'A'),('44444444-4444-4444-8444-444444444444',1,'B'),('55555555-5555-4555-8555-555555555555',2,'A');`);
  for(const file of ['team-transfer-permissions.sql','transfer-owner-bindings.sql','transfer-global-league-controls.sql'])
   await db.exec(await readFile(new URL('../drafts/'+file,import.meta.url),'utf8'));
  const states=async()=> (await db.query('SELECT p.allowed FROM team_transfer_permissions p JOIN teams t ON t.id=p.team_id WHERE t.organization_id=1 ORDER BY t.id')).rows.map(r=>r.allowed);
  assert.deepEqual(await states(),[false,false,false]);
  await assert.rejects(db.query("SELECT admin_set_league_transfer_access(1,'A',true)"),{code:'P0001'});
  await db.exec('UPDATE organizations SET transfer_window_open=true WHERE id=1');
  assert.deepEqual(await states(),[true,true,true]);
  await db.query("SELECT set_team_transfer_permission(auth.uid(),1,'22222222-2222-4222-8222-222222222222',false)");
  assert.deepEqual(await states(),[false,true,true]);
  await db.query("SELECT admin_set_league_transfer_access(1,'A',false)");
  assert.deepEqual(await states(),[false,false,true]);
  await assert.rejects(db.query("SELECT admin_set_league_transfer_access(2,'A',false)"),{code:'42501'});
  await assert.rejects(db.query('UPDATE organizations SET transfer_window_open=false WHERE id=2'),{code:'42501'});
  await db.exec('UPDATE organizations SET transfer_window_open=false WHERE id=1');
  assert.deepEqual(await states(),[false,false,false]);
  await assert.rejects(db.query("SELECT set_team_transfer_permission(auth.uid(),1,'22222222-2222-4222-8222-222222222222',true)"),{code:'P0001'});
  await db.exec('UPDATE organizations SET transfer_window_open=true WHERE id=1');
  assert.deepEqual(await states(),[true,true,true]);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM team_transfer_permissions p JOIN teams t ON t.id=p.team_id WHERE t.organization_id=2')).rows[0].n,0);
 }finally{await db.close();}
});
