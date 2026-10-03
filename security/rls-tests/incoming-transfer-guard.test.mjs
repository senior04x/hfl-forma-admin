import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
const actor='11111111-1111-4111-8111-111111111111';
const from='22222222-2222-4222-8222-222222222222',to='33333333-3333-4333-8333-333333333333';
test('receiving guard blocks incoming requests and approval, never releasing team alone',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
   CREATE TABLE organizations(id bigint PRIMARY KEY,transfer_window_open boolean);INSERT INTO organizations VALUES(1,true);
   CREATE TABLE teams(id uuid PRIMARY KEY,organization_id bigint);INSERT INTO teams VALUES('${from}',1),('${to}',1);
   CREATE TABLE admin_users(id uuid PRIMARY KEY,role text,organization_id bigint);INSERT INTO admin_users VALUES('${actor}','org_admin',1);
   CREATE TABLE transfers(id serial PRIMARY KEY,old_team_id uuid,new_team_id uuid,organization_id bigint,status text);
   GRANT USAGE ON SCHEMA public TO service_role;GRANT SELECT ON organizations,admin_users TO service_role;GRANT SELECT,UPDATE ON teams TO service_role;`);
  await db.exec(await readFile(new URL('../drafts/team-transfer-permissions.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../drafts/incoming-transfer-permission-guard.sql',import.meta.url),'utf8'));
  const set=(team,value)=>db.query('SELECT set_team_transfer_permission($1,1,$2,$3)',[actor,team,value]);
  const insert=()=>db.query('INSERT INTO transfers(old_team_id,new_team_id,organization_id,status) VALUES($1,$2,1,\'pending\') RETURNING id',[from,to]);
  await set(from,false);const id=(await insert()).rows[0].id;
  await set(to,false);
  await assert.rejects(insert(),e=>e.code==='P0001'&&e.message==='TEAM_TRANSFER_PAYMENT_REQUIRED');
  await assert.rejects(db.query("UPDATE transfers SET status='approved' WHERE id=$1",[id]),{code:'P0001'});
  await db.query("UPDATE transfers SET status='rejected' WHERE id=$1",[id]);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM transfers')).rows[0].n,1);
  await set(to,true);await insert();
  await assert.rejects(db.query("INSERT INTO transfers(new_team_id,organization_id,status) VALUES($1,2,'pending')",[to]),{code:'23514'});
 }finally{await db.close();}
});
