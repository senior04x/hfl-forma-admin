import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const owner=id(1),other=id(2),unverified=id(3),oldTeam=id(10),newTeam=id(11),player=id(20),transfer=id(30);
const token=`sha256:${'a'.repeat(64)}`;
const load=path=>readFile(new URL(path,import.meta.url),'utf8');
const migration=await load('../drafts/two-team-transfer-admin-authority.sql');

test('transfer admin authority uses verified bound organization owner, never admin_users',async t=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
   CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
   CREATE FUNCTION get_user_org_id() RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
   CREATE FUNCTION transfer_phone(text) RETURNS text LANGUAGE sql AS $$ SELECT $1 $$;
   CREATE TABLE organizations(id bigint PRIMARY KEY,admin_email text);
   CREATE TABLE teams(id uuid PRIMARY KEY,name text,organization_id bigint,captain_phone text);
   CREATE TABLE applications(id uuid PRIMARY KEY,team_id uuid,status text);
   CREATE TABLE team_sessions(token text PRIMARY KEY,team_id uuid,phone text,expires_at timestamptz);
   CREATE TABLE transfers(id uuid PRIMARY KEY,player_id uuid,old_team_id uuid,new_team_id uuid,
    organization_id bigint,requested_by_team_id uuid,status text,app_consent_required boolean);
   CREATE TABLE transfer_consents(transfer_id uuid,party text,subject_id uuid,decision text,PRIMARY KEY(transfer_id,party));
   CREATE TABLE player_career_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),player_id uuid,team_id uuid,team_name text,
    organization_id bigint,joined_at timestamptz,left_at timestamptz,created_via text,transfer_id uuid);
   INSERT INTO auth.users VALUES('${owner}','owner@test.invalid',now()),('${other}','other@test.invalid',now()),('${unverified}','unverified@test.invalid',NULL);
   INSERT INTO organizations VALUES(1,'owner@test.invalid'),(2,'other@test.invalid'),(3,'unverified@test.invalid');
   INSERT INTO teams VALUES('${oldTeam}','Old',1,'901234567'),('${newTeam}','New',1,'901234568');
   INSERT INTO applications VALUES('${player}','${oldTeam}','approved');
   INSERT INTO team_sessions VALUES('${token}','${newTeam}','901234568',now()+interval '1 hour');
   GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
   GRANT SELECT,UPDATE,DELETE ON transfers TO anon,authenticated;
   GRANT SELECT ON transfer_consents TO anon,authenticated;
   CREATE POLICY legacy_public_transfers ON transfers FOR ALL TO PUBLIC USING(true) WITH CHECK(true);
   CREATE POLICY legacy_public_consents ON transfer_consents FOR SELECT TO PUBLIC USING(true);`);
  await db.exec(await load('../drafts/transfer-owner-bindings.sql'));
  const source=await load('../../supabase/migrations/20261001000900_cancel_mobile_transfer.sql');
  await db.exec(source.slice(0,source.indexOf('CREATE OR REPLACE FUNCTION public.transfer_app_page'))+'COMMIT;');
  await db.exec(`CREATE TRIGGER guard_team_transfer_decision BEFORE INSERT OR UPDATE ON transfers FOR EACH ROW EXECUTE FUNCTION guard_team_transfer_decision();
   CREATE TRIGGER z_apply_transfer_membership BEFORE INSERT OR UPDATE ON transfers FOR EACH ROW EXECUTE FUNCTION apply_transfer_membership();`);
  await db.exec(await load('../drafts/two-team-transfer-consent.sql'));
  await db.exec('CREATE TRIGGER enforce_three_party_transfer_consent BEFORE UPDATE ON transfers FOR EACH ROW EXECUTE FUNCTION enforce_three_party_transfer_consent()');
  const definition=async name=>(await db.query(`SELECT pg_get_functiondef($1::regprocedure) AS body`,[`${name}()`])).rows[0].body.replace(/\r\n/g,'\n');
  const guardBefore=await definition('guard_team_transfer_decision'),memberBefore=await definition('apply_transfer_membership');
  await db.exec(migration);
  assert.equal(await definition('guard_team_transfer_decision'),guardBefore.replace('public.get_user_org_id() IS DISTINCT FROM OLD.organization_id','NOT public.transfer_admin_authorized(OLD.organization_id)'));
  assert.equal(await definition('apply_transfer_membership'),memberBefore.replace("NOT EXISTS (\n        SELECT 1 FROM public.admin_users au WHERE au.id=auth.uid()\n          AND au.organization_id=OLD.organization_id AND au.role IN ('org_admin','super_admin')\n    )",'NOT public.transfer_admin_authorized(OLD.organization_id)'));
  const identity=async(actor=owner,role='authenticated')=>{
   await db.exec('RESET ROLE');
   await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[actor,role]);
   await db.exec(`SET ROLE ${role}`);
  };
  const reset=async()=>{
   await db.exec(`RESET ROLE;TRUNCATE transfers,transfer_consents,transfer_app_cancellations,player_career_history;
    UPDATE applications SET team_id='${oldTeam}';
    INSERT INTO transfers VALUES('${transfer}','${player}','${oldTeam}','${newTeam}',1,'${newTeam}','pending',true),
     ('${id(31)}','${id(21)}','${id(12)}','${id(13)}',2,'${id(13)}','pending',true);
    INSERT INTO transfer_consents VALUES('${transfer}','old_team','${oldTeam}','approved'),('${transfer}','new_team','${newTeam}','approved'),
     ('${transfer}','player','${player}','rejected'),('${id(31)}','old_team','${id(12)}','approved');`);
  };
  const allowed=async org=>(await db.query('SELECT transfer_admin_authorized($1) AS result',[org])).rows[0].result;

  await t.test('owner sees only own transfer and consent despite permissive legacy policies',async()=>{
   await reset();await identity();
   assert.equal(await allowed(1),true);assert.equal(await allowed(2),false);
   assert.deepEqual((await db.query('SELECT id FROM transfers')).rows,[{id:transfer}]);
   assert.equal((await db.query('SELECT count(*)::int AS n FROM transfer_consents')).rows[0].n,3);
   assert.equal((await db.query("UPDATE transfers SET status='rejected' WHERE organization_id=2 RETURNING id")).rows.length,0);
  });
  await t.test('owner without any admin_users table can approve atomic membership/career changes',async()=>{
   await reset();await identity();
   await db.exec(`UPDATE transfers SET status='approved' WHERE id='${transfer}'`);
   await db.exec('RESET ROLE');
   assert.equal((await db.query('SELECT team_id FROM applications')).rows[0].team_id,newTeam);
   assert.equal((await db.query('SELECT count(*)::int AS n FROM player_career_history')).rows[0].n,2);
   await identity();
   await assert.rejects(db.exec(`UPDATE transfers SET status='pending' WHERE id='${transfer}'`),/Only pending transfers/);
  });
  await t.test('other owner, unverified user and missing binding fail closed',async()=>{
   await reset();await identity(other);assert.equal(await allowed(1),false);
   await identity(unverified);assert.equal(await allowed(3),false);
   await db.exec(`RESET ROLE;DELETE FROM organization_transfer_admin_bindings WHERE organization_id=1`);
   await identity();assert.equal(await allowed(1),false);
   await db.exec(`RESET ROLE;INSERT INTO organization_transfer_admin_bindings(organization_id,owner_id) VALUES(1,'${owner}')`);
  });
  await t.test('changed email and ambiguous organization/user email matches cannot grant authority',async()=>{
   await db.exec("RESET ROLE;UPDATE organizations SET admin_email='other@test.invalid' WHERE id=1");
   await identity();assert.equal(await allowed(1),false);
   await db.exec("RESET ROLE;UPDATE organizations SET admin_email='owner@test.invalid' WHERE id=1;INSERT INTO organizations VALUES(4,'owner@test.invalid')");
   await identity();assert.equal(await allowed(1),false);
   await db.exec(`RESET ROLE;DELETE FROM organizations WHERE id=4;INSERT INTO auth.users VALUES('${id(99)}','owner@test.invalid',now())`);
   await identity();assert.equal(await allowed(1),false);
   await db.exec(`RESET ROLE;DELETE FROM auth.users WHERE id='${id(99)}'`);
  });
  await t.test('anon cannot read, owner cannot forge protected binding or directly write consents',async()=>{
   await identity(owner,'anon');assert.equal((await db.query('SELECT count(*)::int AS n FROM transfers')).rows[0].n,0);
   assert.equal((await db.query('SELECT count(*)::int AS n FROM transfer_consents')).rows[0].n,0);
   await identity();
   await assert.rejects(db.exec(`UPDATE organization_transfer_admin_bindings SET owner_id='${other}' WHERE organization_id=1`),e=>e.code==='42501');
   await assert.rejects(db.exec(`INSERT INTO transfer_consents VALUES('${transfer}','player','${player}','approved')`),e=>e.code==='42501');
  });
  await t.test('two-team gate and membership race protection still block invalid approvals',async()=>{
   await reset();await db.exec(`DELETE FROM transfer_consents WHERE transfer_id='${transfer}' AND party='old_team'`);
   await identity();await assert.rejects(db.exec(`UPDATE transfers SET status='approved' WHERE id='${transfer}'`),e=>e.code==='23514');
   await reset();await db.exec(`UPDATE applications SET team_id='${newTeam}'`);
   await identity();await assert.rejects(db.exec(`UPDATE transfers SET status='approved' WHERE id='${transfer}'`),/Player membership changed/);
   await db.exec('RESET ROLE');assert.equal((await db.query('SELECT count(*)::int AS n FROM player_career_history')).rows[0].n,0);
  });
  await t.test('receiving-captain cancellation still works without admin authority',async()=>{
   await reset();await identity(newTeam,'service_role');
   const result=(await db.query('SELECT cancel_transfer_app($1,$2) AS result',[token,transfer])).rows[0].result;
   assert.equal(result.status,200);
   await db.exec('RESET ROLE');assert.equal((await db.query('SELECT status FROM transfers WHERE id=$1',[transfer])).rows[0].status,'rejected');
   assert.equal((await db.query('SELECT team_id FROM applications')).rows[0].team_id,oldTeam);
  });
  await t.test('draft is repeatable and unknown guard code aborts transaction',async()=>{
   await db.exec('RESET ROLE');await db.exec(migration);
   await db.exec('CREATE OR REPLACE FUNCTION guard_team_transfer_decision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$');
   await assert.rejects(db.exec(migration),/Unrecognized transfer decision guard/);await db.exec('ROLLBACK');
  });
 }finally{await db.close();}
});
