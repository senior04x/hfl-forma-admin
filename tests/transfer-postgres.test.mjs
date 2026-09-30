import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { PGlite } = await import(process.env.PGLITE_TEST_MODULE || '@electric-sql/pglite');
const migrations = new URL('../supabase/migrations/', import.meta.url);
const db = new PGlite();
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('test.role',true) $$;
CREATE FUNCTION public.get_user_org_id() RETURNS bigint LANGUAGE sql AS $$ SELECT nullif(current_setting('test.org',true),'')::bigint $$;
CREATE FUNCTION public.transfer_phone(value text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT right(regexp_replace(value,'[^0-9]','','g'),9) $$;
CREATE TABLE organizations(id bigint PRIMARY KEY,transfer_window_open boolean);
CREATE TABLE admin_users(id uuid PRIMARY KEY,organization_id bigint,role text);
CREATE TABLE teams(id uuid PRIMARY KEY,organization_id bigint,name text,logo_url text,captain_phone text);
CREATE TABLE applications(id uuid PRIMARY KEY,team_id uuid,phone text,status text,first_name text,last_name text,photo_url text);
CREATE TABLE team_sessions(token text PRIMARY KEY,team_id uuid,phone text,expires_at timestamptz);
CREATE TABLE otp_codes(phone text PRIMARY KEY,code text,is_used boolean,expires_at timestamptz,attempts integer);
CREATE TABLE transfers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_at timestamptz DEFAULT now(),player_id uuid REFERENCES applications(id),old_team_id uuid,new_team_id uuid,reason text,status text,player_name text,player_photo text,old_team_name text,old_team_logo text,new_team_name text,new_team_logo text,organization_id bigint,player_confirmed boolean,requested_by_team_id uuid);
CREATE TABLE player_career_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),player_id uuid,team_id uuid,team_name text,organization_id bigint,joined_at timestamptz,left_at timestamptz,created_via text);
`);
for (const name of ['20260924000100_admin_only_transfer_decisions.sql','20260925000100_transfer_notifications.sql','20260927000100_atomic_admin_transfer.sql','20261001000100_three_party_transfer_consent.sql','20261001000200_transfer_app_decisions.sql','20261001000300_transfer_app_requests.sql','20261001000400_transfer_app_reads.sql','20261001000500_transfer_app_notifications.sql']) {
 try { await db.exec(fs.readFileSync(new URL(name,migrations),'utf8')); } catch(error) { throw new Error(`Migration ${name}: ${error.message}`); }
}
const ids={old:'00000000-0000-0000-0000-000000000001',new:'00000000-0000-0000-0000-000000000002',player:'00000000-0000-0000-0000-000000000003',admin:'00000000-0000-0000-0000-000000000004',foreign:'00000000-0000-0000-0000-000000000005'};
const token = char => 'sha256:'+char.repeat(64);
await db.query('INSERT INTO organizations VALUES(1,true),(2,true)');
await db.query(`INSERT INTO teams(id,organization_id,name,captain_phone) VALUES($1,1,'Old','901111111'),($2,1,'New','902222222'),($3,2,'Foreign','903333333')`,[ids.old,ids.new,ids.foreign]);
await db.query(`INSERT INTO applications VALUES($1,$2,'904444444','approved','Ali','Player',null)`,[ids.player,ids.old]);
await db.query(`INSERT INTO admin_users VALUES($1,1,'org_admin')`,[ids.admin]);
await db.query(`INSERT INTO team_sessions VALUES($1,$2,'901111111',now()+interval '1 hour'),($3,$4,'902222222',now()+interval '1 hour'),($5,$6,'903333333',now()+interval '1 hour')`,[token('a'),ids.old,token('b'),ids.new,token('c'),ids.foreign]);
await db.query(`INSERT INTO transfer_player_sessions VALUES($1,$2,'904444444',now()+interval '1 hour',now())`,[token('d'),ids.player]);
const rpc = async (expression,args=[]) => (await db.query('SELECT '+expression+' AS result',args)).rows[0].result;
const request = () => rpc('request_transfer_app($1,$2,$3)',[token('b'),ids.player,'Real reason']);
const consent = (id,party,decision='approved',key=party==='player'?'d':party==='old_team'?'a':'b') => rpc('record_transfer_app_consent($1,$2,$3,$4)',[token(key),id,party,decision]);
const approve = async id => { await db.exec(`SELECT set_config('test.role','authenticated',false),set_config('test.uid','${ids.admin}',false),set_config('test.org','1',false)`);return db.query("UPDATE transfers SET status='approved' WHERE id=$1",[id]); };
await test('mobile workflow, consent authorization and atomic final admin approval',async()=>{
 const created=await request();assert.equal(created.status,201);const id=created.transfer.id;
 assert.equal((await request()).status,409);
 assert.equal((await consent(id,'old_team','approved','c')).status,403);
 await assert.rejects(approve(id),/three transfer parties/);
 assert.equal((await consent(id,'player')).status,200);
 assert.equal((await consent(id,'player')).already_recorded,true);
 assert.equal((await consent(id,'player','rejected')).status,409);
 await consent(id,'old_team');await assert.rejects(approve(id),/three transfer parties/);
 assert.equal((await consent(id,'new_team')).ready_for_admin,true);
 await approve(id);
 assert.equal((await db.query('SELECT team_id FROM applications WHERE id=$1',[ids.player])).rows[0].team_id,ids.new);
 const career=(await db.query('SELECT team_id,transfer_id FROM player_career_history WHERE player_id=$1 AND left_at IS NULL',[ids.player])).rows;
 assert.equal(career.length,1);assert.equal(career[0].team_id,ids.new);assert.equal(career[0].transfer_id,id);
 assert.equal((await db.query("SELECT count(*)::int AS count FROM transfer_notifications WHERE transfer_id=$1 AND event='approved'",[id])).rows[0].count,3);
 await assert.rejects(db.query("UPDATE transfers SET status='pending' WHERE id=$1",[id]),/pending transfers/);
});
await test('legacy web remains admin-only without participant consent',async()=>{
 const id=(await db.query(`INSERT INTO transfers(player_id,old_team_id,new_team_id,organization_id,requested_by_team_id,status,new_team_name) VALUES($1,$2,$3,1,$3,'pending','Old') RETURNING id`,[ids.player,ids.new,ids.old])).rows[0].id;
 assert.equal((await consent(id,'player')).status,409);
 await approve(id);
 assert.equal((await db.query('SELECT team_id FROM applications WHERE id=$1',[ids.player])).rows[0].team_id,ids.old);
 assert.equal((await db.query('SELECT count(*)::int AS count FROM transfer_notifications WHERE transfer_id=$1',[id])).rows[0].count,2);
});
await test('a rejection blocks final approval and foreign actors cannot read a request',async()=>{
 const created=await request(),id=created.transfer.id;
 await consent(id,'player','rejected');await consent(id,'old_team');await consent(id,'new_team');await assert.rejects(approve(id),/three transfer parties/);
 const foreign=await rpc('transfer_app_page($1,$2,$3,null,$4)',[token('c'),'captain','all',id]);assert.deepEqual(foreign.items,[]);
 const own=await rpc('transfer_app_page($1,$2)',[token('d'),'player']);assert.ok(own.items.some(r=>r.id===id));
 const jobs=(await db.query('SELECT id FROM transfer_notifications WHERE transfer_id=$1 ORDER BY id',[id])).rows;
 const lease='11111111-1111-1111-1111-111111111111';await db.query("UPDATE transfer_notifications SET state='processing',claim_token=$1 WHERE id IN ($2,$3)",[lease,jobs[0].id,jobs[1].id]);
 assert.equal(await rpc('reserve_transfer_notification_chat($1,$2,$3)',[jobs[0].id,lease,'123']),true);
 assert.equal(await rpc('reserve_transfer_notification_chat($1,$2,$3)',[jobs[1].id,lease,'123']),false);
 assert.equal(await rpc("finish_transfer_notification($1,$2,'pending',null,null,60)",[jobs[0].id,lease]),true);
 assert.equal(await rpc('reserve_transfer_notification_chat($1,$2,$3)',[jobs[1].id,lease,'123']),true);
});

await test('OTP sessions reject wrong, exhausted, reused and expired codes',async()=>{
 await db.query("INSERT INTO otp_codes VALUES('904444444','1234',false,now()+interval '10 minutes',0)");
 for(let attempt=0;attempt<5;attempt++) {
  const result=await rpc('verify_transfer_player_otp($1,$2,$3,$4)',['904444444','9999',ids.player,token('e')]);
  assert.equal(result.status,attempt===4?429:401);
 }
 await db.query("UPDATE otp_codes SET is_used=false,attempts=0 WHERE phone='904444444'");
 assert.equal((await rpc('verify_transfer_player_otp($1,$2,$3,$4)',['904444444','1234',ids.player,token('e')])).status,200);
 assert.equal((await rpc('verify_transfer_player_otp($1,$2,$3,$4)',['904444444','1234',ids.player,token('f')])).status,401);
 await db.query("UPDATE transfer_player_sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1",[token('e')]);
 assert.equal((await rpc('transfer_app_page($1,$2)',[token('e'),'player'])).status,401);
});
await test('mobile SQL entry points cannot be called by anonymous clients',async()=>{
 for(const signature of ['record_transfer_app_consent(text,uuid,text,text)','request_transfer_app(text,uuid,text,uuid)','transfer_app_page(text,text,text,uuid,uuid)','verify_transfer_player_otp(text,text,uuid,text)','reserve_transfer_notification_chat(bigint,uuid,text)']) {
  assert.equal(await rpc("has_function_privilege('anon',$1,'EXECUTE')",[signature]),false);
  assert.equal(await rpc("has_function_privilege('authenticated',$1,'EXECUTE')",[signature]),false);
  assert.equal(await rpc("has_function_privilege('service_role',$1,'EXECUTE')",[signature]),true);
 }
});
await db.close();
