import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
const actor='11111111-1111-4111-8111-111111111111',team='22222222-2222-4222-8222-222222222222';
test('team overrides never bypass the global window or organization boundary',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
   CREATE TABLE organizations(id bigint PRIMARY KEY,transfer_window_open boolean);INSERT INTO organizations VALUES(1,true),(2,true);
   CREATE TABLE teams(id uuid PRIMARY KEY,organization_id bigint);INSERT INTO teams VALUES('${team}',1);
   CREATE TABLE admin_users(id uuid PRIMARY KEY,role text,organization_id bigint);INSERT INTO admin_users VALUES('${actor}','org_admin',1);
   GRANT USAGE ON SCHEMA public TO service_role;GRANT SELECT ON organizations,admin_users TO service_role;GRANT SELECT,UPDATE ON teams TO service_role;`);
  await db.exec(await readFile(new URL('../drafts/team-transfer-permissions.sql',import.meta.url),'utf8'));
  const allowed=async()=>(await db.query('SELECT team_transfer_allowed($1) AS allowed',[team])).rows[0].allowed;
  const set=(flag,org=1)=>db.query('SELECT set_team_transfer_permission($1,$2,$3,$4)',[actor,org,team,flag]);
  await db.exec('SET ROLE authenticated');await assert.rejects(set(false),{code:'42501'});
  await db.exec('RESET ROLE;SET ROLE service_role');assert.equal(await allowed(),true);
  await set(false);assert.equal(await allowed(),false);await set(true);assert.equal(await allowed(),true);
  await assert.rejects(set(false,2),{code:'42501'});assert.equal(await allowed(),true);
  await db.exec('RESET ROLE;UPDATE organizations SET transfer_window_open=false WHERE id=1;SET ROLE service_role');
  assert.equal(await allowed(),false);await set(true);assert.equal(await allowed(),false);
  assert.equal((await db.query('SELECT team_transfer_allowed(NULL) AS allowed')).rows[0].allowed,false);
  await db.exec(`RESET ROLE;CREATE SCHEMA auth;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   ALTER TABLE teams ADD COLUMN name text,ADD COLUMN league text,ADD COLUMN is_archived boolean DEFAULT false;
   UPDATE teams SET name='Synthetic team',league='Synthetic league';`);
  await db.exec(await readFile(new URL('../drafts/admin-team-transfer-access.sql',import.meta.url),'utf8'));
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[actor]);
  await db.exec('SET ROLE authenticated');
  const page=await db.query('SELECT admin_team_transfer_access_page(1) AS data');
  assert.equal(page.rows[0].data.items[0].name,'Synthetic team');
  assert.deepEqual(page.rows[0].data.leagues,['Synthetic league']);
  await assert.rejects(db.query('SELECT admin_team_transfer_access_page(2)'),{code:'42501'});
  await db.query('SELECT admin_set_team_transfer_access(1,$1,false)',[team]);
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",['33333333-3333-4333-8333-333333333333']);
  await db.exec('SET ROLE authenticated');
  await assert.rejects(db.query('SELECT admin_set_team_transfer_access(1,$1,true)',[team]),{code:'42501'});
 }finally{await db.close();}
});
