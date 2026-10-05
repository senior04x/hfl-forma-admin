import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const old=id(1),receiving=id(2),archived=id(3),active=id(4),token=`sha256:${'a'.repeat(64)}`;
const migration=await readFile(new URL('../drafts/free-agent-transfers.sql',import.meta.url),'utf8');

test('free agent transfers waive only the old team, retain payment/window guards and allow blank reason',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
   CREATE FUNCTION transfer_phone(text) RETURNS text LANGUAGE sql AS $$ SELECT $1 $$;
   CREATE TABLE organizations(id bigint PRIMARY KEY,transfer_window_open boolean);
   CREATE TABLE teams(id uuid PRIMARY KEY,name text,logo_url text,organization_id bigint,captain_phone text,telegram_chat_id text,is_archived boolean);
   CREATE TABLE applications(id uuid PRIMARY KEY,team_id uuid,organization_id bigint,status text,is_archived boolean,first_name text,last_name text,photo_url text,player_number text,position text);
   CREATE TABLE team_sessions(token text PRIMARY KEY,team_id uuid,phone text,expires_at timestamptz);
   CREATE TABLE transfer_player_sessions(token text,player_id uuid,phone text,expires_at timestamptz);
   CREATE TABLE transfer_telegram_contacts(chat_id text,user_id text,phone text);
   CREATE TABLE team_transfer_permissions(team_id uuid,allowed boolean);
   CREATE TABLE transfers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_at timestamptz DEFAULT now(),player_id uuid,old_team_id uuid,new_team_id uuid,organization_id bigint,status text,app_consent_required boolean,requested_by_team_id uuid,old_team_name text,new_team_name text,old_team_logo text,new_team_logo text,player_name text,player_photo text,reason text,player_confirmed boolean);
   CREATE TABLE transfer_consents(transfer_id uuid,party text,subject_id uuid,decision text,decided_at timestamptz DEFAULT now(),PRIMARY KEY(transfer_id,party));
   CREATE TABLE transfer_app_cancellations(transfer_id uuid,team_id uuid);
   CREATE TABLE transfer_notifications(id bigserial PRIMARY KEY,transfer_id uuid,player_id uuid,event text,team_name text,recipient_type text,app_consent_required boolean,player_name text,old_team_name text,state text DEFAULT 'pending',failure_code text,UNIQUE(transfer_id,event,recipient_type));
   INSERT INTO organizations VALUES(1,true);
   INSERT INTO teams(id,name,organization_id,captain_phone,is_archived) VALUES('${old}','Old',1,'901234567',false),('${receiving}','New',1,'901234568',false);
   INSERT INTO applications(id,team_id,organization_id,status,is_archived,first_name) VALUES('${archived}','${old}',1,'approved',true,'Free'),('${active}','${old}',1,'approved',false,'Active');
   INSERT INTO team_sessions VALUES('${token}','${receiving}','901234568',now()+interval '1 hour');`);
  await db.exec(await readFile(new URL('./fixtures/free-agent-before.sql',import.meta.url),'utf8'));
  await db.exec(`INSERT INTO transfers(id,player_id,old_team_id,new_team_id,organization_id,status,app_consent_required) VALUES
   ('${id(10)}','${archived}','${old}','${receiving}',1,'pending',true),
   ('${id(11)}','${archived}','${old}','${receiving}',1,'approved',true),
   ('${id(12)}','${active}','${old}','${receiving}',1,'pending',true);`);
  await db.exec(migration);
  assert.deepEqual((await db.query('SELECT old_team_consent_required FROM transfers ORDER BY id')).rows.map(r=>r.old_team_consent_required),[false,true,true]);
  await db.exec("DELETE FROM transfers WHERE status='pending'");
  await db.exec('CREATE TRIGGER gate BEFORE UPDATE ON transfers FOR EACH ROW EXECUTE FUNCTION enforce_three_party_transfer_consent(); CREATE TRIGGER notices AFTER INSERT OR UPDATE ON transfers FOR EACH ROW EXECUTE FUNCTION enqueue_transfer_notification();');
  const request=async(player,reason='')=>(await db.query('SELECT request_transfer_app($1,$2,$3,NULL) result',[token,player,reason])).rows[0].result;
  let result=await request(archived);
  assert.equal(result.status,201);
  assert.equal(result.transfer.reason,'');
  assert.equal(result.transfer.old_team_consent_required,false);
  const free=result.transfer.id;
  assert.deepEqual((await db.query('SELECT party FROM transfer_consents WHERE transfer_id=$1',[free])).rows,[{party:'new_team'}]);
  assert.deepEqual((await db.query("SELECT recipient_type FROM transfer_notifications WHERE transfer_id=$1 AND event='pending'",[free])).rows,[{recipient_type:'new_team'}]);
  await assert.rejects(db.query('UPDATE transfers SET old_team_consent_required=true WHERE id=$1',[free]),{code:'23514'});
  await db.query('DELETE FROM transfer_consents WHERE transfer_id=$1',[free]);
  await assert.rejects(db.query("UPDATE transfers SET status='approved' WHERE id=$1",[free]),{code:'23514'});
  const ready=(await db.query("SELECT record_transfer_app_consent($1,$2,'new_team','approved') result",[token,free])).rows[0].result;
  assert.equal(ready.ready_for_admin,true);
  await db.exec(`INSERT INTO team_sessions VALUES('sha256:${'b'.repeat(64)}','${old}','901234567',now()+interval '1 hour')`);
  assert.equal((await db.query("SELECT record_transfer_app_consent($1,$2,'old_team','rejected') result",[`sha256:${'b'.repeat(64)}`,free])).rows[0].result.status,409);
  await db.query("UPDATE transfers SET status='approved' WHERE id=$1",[free]);
  assert.equal((await db.query("SELECT record_transfer_telegram_consent('123','123',$1,'rejected') result",[free])).rows[0].result.status,409);
  result=await request(active,'  ');
  assert.equal(result.status,201);
  assert.equal(result.transfer.old_team_consent_required,true);
  const regular=result.transfer.id;
  await assert.rejects(db.query("UPDATE transfers SET status='approved' WHERE id=$1",[regular]),{code:'23514'});
  await db.query('INSERT INTO transfer_consents VALUES($1,$2,$3,$4,now())',[regular,'old_team',old,'approved']);
  await db.query("UPDATE transfers SET status='approved' WHERE id=$1",[regular]);
  assert.equal((await request(active,'x'.repeat(1001))).status,400);
  await db.exec('UPDATE organizations SET transfer_window_open=false');
  assert.equal((await request(active)).status,403);
  await db.exec(`UPDATE organizations SET transfer_window_open=true; INSERT INTO team_transfer_permissions VALUES('${receiving}',false)`);
  assert.equal((await request(active)).code,'TEAM_TRANSFER_PAYMENT_REQUIRED');
  await db.exec('DELETE FROM team_transfer_permissions');
  const candidates=(await db.query("SELECT team_transfer_page($1,'players','',NULL,NULL) result",[token])).rows[0].result.items;
  assert.equal(candidates.find(p=>p.id===archived).is_archived,true);
 } finally {await db.close();}
});
