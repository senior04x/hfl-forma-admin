import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const player=id(1),oldTeam=id(2),newTeam=id(3),foreign=id(4),token=`sha256:${'a'.repeat(64)}`;
const load=path=>readFile(new URL(path,import.meta.url),'utf8');

test('legacy and app requests share guarded atomic two-team submission',async t=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
   CREATE TABLE organizations(id bigint PRIMARY KEY,transfer_window_open boolean);
   CREATE TABLE teams(id uuid PRIMARY KEY,name text,logo_url text,organization_id bigint,captain_phone text);
   CREATE TABLE applications(id uuid PRIMARY KEY,team_id uuid,status text,first_name text,last_name text,photo_url text);
   CREATE TABLE team_sessions(token text PRIMARY KEY,team_id uuid,phone text,expires_at timestamptz);
   CREATE TABLE transfers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),player_id uuid,old_team_id uuid,new_team_id uuid,
    old_team_name text,old_team_logo text,new_team_name text,new_team_logo text,player_name text,player_photo text,reason text,
    status text,player_confirmed boolean,requested_by_team_id uuid,organization_id bigint,app_consent_required boolean DEFAULT false);
   CREATE TABLE transfer_consents(transfer_id uuid,party text,subject_id uuid,decision text,decided_at timestamptz DEFAULT clock_timestamp(),PRIMARY KEY(transfer_id,party));
   CREATE TABLE team_transfer_permissions(team_id uuid PRIMARY KEY,allowed boolean);
   INSERT INTO organizations VALUES(1,true),(2,true);
   INSERT INTO teams VALUES('${oldTeam}','Old',NULL,1,'901234567'),('${newTeam}','New',NULL,1,'901234568'),('${foreign}','Foreign',NULL,2,'901234569');
   INSERT INTO applications VALUES('${player}','${oldTeam}','approved','Test','Player',NULL);
   INSERT INTO team_sessions VALUES('${token}','${newTeam}','901234568',clock_timestamp()+interval '1 hour');
   CREATE FUNCTION request_team_transfer(text,uuid,text,uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;`);
  const phone=await load('../../supabase/migrations/20260923000100_atomic_team_transfers.sql');
  await db.exec(phone.slice(phone.indexOf('CREATE OR REPLACE FUNCTION public.transfer_phone'),phone.indexOf('CREATE INDEX')));
  const consent=await load('../../supabase/migrations/20261001000100_three_party_transfer_consent.sql');
  const start=consent.indexOf('CREATE FUNCTION public.validate_transfer_consent_subject()');
  await db.exec(consent.slice(start,consent.indexOf('-- Only mobile requests',start)));
  await db.exec(await load('../../supabase/migrations/20260925000100_transfer_notifications.sql'));
  await db.exec(await load('../../supabase/migrations/20261001000500_transfer_app_notifications.sql'));
  await db.exec(await load('../drafts/two-team-transfer-notifications.sql'));
  await db.exec(await load('../drafts/incoming-transfer-permission-guard.sql'));
  await db.exec(await load('../../supabase/migrations/20261001000700_requesting_team_auto_consent.sql'));
  const appBefore=(await db.query("SELECT pg_get_functiondef('request_transfer_app(text,uuid,text,uuid)'::regprocedure) AS definition")).rows[0].definition;
  await db.exec(await load('../drafts/two-team-transfer-web-request.sql'));
  assert.equal((await db.query("SELECT pg_get_functiondef('request_transfer_app(text,uuid,text,uuid)'::regprocedure) AS definition")).rows[0].definition,appBefore);
  const request=async(name='request_team_transfer',hash=token,team=null)=>(await db.query(`SELECT ${name}($1,$2,$3,$4) AS result`,[hash,player,'Recruit',team])).rows[0].result;
  const reset=async()=>db.exec(`TRUNCATE transfers,transfer_consents,transfer_notifications,team_transfer_permissions;
   UPDATE teams SET captain_phone='901234568' WHERE id='${newTeam}';
   UPDATE organizations SET transfer_window_open=true;
   UPDATE applications SET team_id='${oldTeam}';`);
  await t.test('both entrypoints atomically record receiving-team consent and team queue jobs',async()=>{
   for(const name of ['request_team_transfer','request_transfer_app']){
    await reset();const result=await request(name);
    assert.equal(result.status,201);assert.equal(result.transfer.app_consent_required,true);
    assert.equal(result.transfer.requested_by_team_id,newTeam);
    assert.deepEqual((await db.query('SELECT party,subject_id,decision FROM transfer_consents')).rows,[{party:'new_team',subject_id:newTeam,decision:'approved'}]);
    assert.deepEqual((await db.query('SELECT recipient_type FROM transfer_notifications ORDER BY recipient_type')).rows,[{recipient_type:'new_team'},{recipient_type:'old_team'}]);
   }
  });
  await t.test('repeated legacy submission cannot duplicate request, consent or messages',async()=>{
   assert.equal((await request()).status,409);
   assert.equal((await db.query('SELECT count(*)::int AS n FROM transfers')).rows[0].n,1);
   assert.equal((await db.query('SELECT count(*)::int AS n FROM transfer_consents')).rows[0].n,1);
   assert.equal((await db.query('SELECT count(*)::int AS n FROM transfer_notifications')).rows[0].n,2);
  });
  await t.test('forged receiving team and invalid sessions are rejected',async()=>{
   await reset();assert.equal((await request('request_team_transfer',token,foreign)).status,403);
   assert.equal((await request('request_team_transfer','bad')).status,401);
   assert.equal((await request('request_team_transfer',`sha256:${'b'.repeat(64)}`)).status,401);
  });
  await t.test('changed captain, closed window and cross-organization player fail closed',async()=>{
   await db.exec(`UPDATE teams SET captain_phone='901234569' WHERE id='${newTeam}'`);
   assert.equal((await request()).status,403);await reset();
   await db.exec('UPDATE organizations SET transfer_window_open=false WHERE id=1');
   assert.equal((await request()).status,403);await reset();
   await db.exec(`UPDATE applications SET team_id='${foreign}'`);
   assert.equal((await request()).status,403);await reset();
  });
  await t.test('receiving-team payment/access trigger remains enforced without side effects',async()=>{
   await db.exec(`INSERT INTO team_transfer_permissions VALUES('${newTeam}',false)`);
   for(const name of ['request_team_transfer','request_transfer_app']) await assert.rejects(request(name),/TEAM_TRANSFER_PAYMENT_REQUIRED/);
   for(const table of ['transfers','transfer_consents','transfer_notifications']) assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n,0);
  });
  await t.test('browser roles cannot call legacy service-only submission',async()=>{
   for(const role of ['anon','authenticated']){
    await db.exec(`SET ROLE ${role}`);await assert.rejects(request(),e=>e.code==='42501');await db.exec('RESET ROLE');
   }
  });
 }finally{await db.close();}
});
