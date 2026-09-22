const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

test('admin decisions atomically move membership, career and notification; legacy reversals stay safe',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`
   CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
   CREATE SCHEMA auth;
   CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
   CREATE TABLE organizations(id bigint PRIMARY KEY);
   CREATE TABLE admin_users(id uuid PRIMARY KEY,organization_id bigint,role text);
   CREATE FUNCTION public.get_user_org_id() RETURNS bigint LANGUAGE sql SECURITY DEFINER AS
     $$ SELECT organization_id FROM public.admin_users WHERE id=auth.uid() $$;
   CREATE TABLE teams(id uuid PRIMARY KEY,name text,organization_id bigint);
   CREATE TABLE applications(id uuid PRIMARY KEY,team_id uuid,status text DEFAULT 'approved');
   CREATE TABLE transfers(id uuid PRIMARY KEY,player_id uuid REFERENCES applications(id),old_team_id uuid,new_team_id uuid,
     old_team_name text,new_team_name text,status text DEFAULT 'pending',organization_id bigint,created_at timestamptz DEFAULT now());
   ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;
   CREATE POLICY read_transfers ON transfers FOR SELECT USING (true);
   GRANT USAGE ON SCHEMA auth TO authenticated,anon;
   GRANT SELECT,UPDATE,DELETE ON transfers TO authenticated,anon;
   INSERT INTO organizations VALUES(7),(8);
   INSERT INTO admin_users VALUES('${id(90)}',7,'org_admin'),('${id(91)}',8,'org_admin'),('${id(92)}',7,'user');
   INSERT INTO teams VALUES('${id(1)}','Old',7),('${id(2)}','New',7),('${id(3)}','Third',7),('${id(4)}','Foreign',8);
   INSERT INTO applications(id,team_id) VALUES('${id(10)}','${id(1)}'),('${id(11)}','${id(1)}'),('${id(12)}','${id(1)}');
  `);
  const migration=async name=>db.exec(readFileSync(resolve(__dirname,'../migrations',name),'utf8'));
  await migration('20260922_team_initiated_transfers.sql');
  await migration('20260924_admin_only_transfer_decisions.sql');
  await migration('20260925_transfer_notifications.sql');
  await migration('20260927_atomic_admin_transfer.sql');
  await migration('20260927_atomic_admin_transfer.sql');
  const insert=async(n,player=10,from=1,to=2,team=true)=>db.exec(`RESET ROLE;
   INSERT INTO transfers(id,player_id,old_team_id,new_team_id,new_team_name,organization_id,requested_by_team_id)
   VALUES('${id(n)}','${id(player)}','${id(from)}','${id(to)}','Target',7,${team?`'${id(to)}'`:'NULL'});`);
  const login=async(n=90,role='authenticated')=>db.exec(`RESET ROLE; SET test.uid='${id(n)}'; SET request.jwt.claim.role='${role}'; SET ROLE ${role}`);
  const update=(n,status)=>db.exec(`UPDATE transfers SET status='${status}' WHERE id='${id(n)}'`);
  const snapshot=async()=>{await db.exec('RESET ROLE');return (await db.query(`SELECT
   (SELECT team_id FROM applications WHERE id='${id(10)}') AS team,
   (SELECT status FROM transfers WHERE id='${id(20)}') AS status,
   (SELECT count(*)::int FROM player_career_history) AS history,
   (SELECT count(*)::int FROM transfer_notifications WHERE event='approved') AS notifications`)).rows[0];};
  await insert(20); await insert(21);
  await login(91); await update(20,'approved'); // RLS hides other org: zero rows.
  assert.equal((await snapshot()).status,'pending');
  await login(92); await assert.rejects(update(20,'approved'),/Only the organization admin/);
  await login(90,'anon'); await update(20,'approved');
  assert.equal((await snapshot()).status,'pending');
  await db.exec(`CREATE FUNCTION fail_career() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.created_via='transfer' THEN RAISE EXCEPTION 'injected career failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fail_career BEFORE INSERT ON player_career_history FOR EACH ROW EXECUTE FUNCTION fail_career()`);
  await login(); await assert.rejects(update(20,'approved'),/injected career failure/);
  assert.deepEqual(await snapshot(),{team:id(1),status:'pending',history:0,notifications:0});
  await db.exec('DROP TRIGGER fail_career ON player_career_history');
  await login(); await update(20,'approved');
  assert.deepEqual(await snapshot(),{team:id(2),status:'approved',history:2,notifications:1});
  const career=(await db.query('SELECT team_id,joined_at,left_at FROM player_career_history ORDER BY joined_at,id')).rows;
  const closed=career.find(r=>r.left_at),open=career.find(r=>!r.left_at);
  assert.equal(closed.team_id,id(1));assert.equal(open.team_id,id(2));assert.deepEqual(closed.left_at,open.joined_at);
  await login(); await update(20,'approved'); // Idempotent, no duplicate history/notification.
  assert.equal((await snapshot()).history,2);
  await login(); await assert.rejects(update(20,'pending'),/Only pending/);
  await assert.rejects(update(21,'approved'),/membership changed/);
  await update(21,'rejected');assert.equal((await snapshot()).history,2);
  await insert(22,11,1,4);await login();await assert.rejects(update(22,'approved'),/same organization/);
  await insert(23,11,1,2,false);await login();await update(23,'approved');await update(23,'pending');
  await db.exec('RESET ROLE');
  assert.equal((await db.query(`SELECT team_id FROM applications WHERE id='${id(11)}'`)).rows[0].team_id,id(1));
  await login();await update(23,'approved');
  await insert(24,11,2,3,false);await login();await update(24,'approved');
  await assert.rejects(update(23,'pending'),/membership changed/);
  // Even returning to the same team later cannot revive an old reversal.
  await insert(25,11,3,2,false);await login();await update(25,'approved');
  await assert.rejects(update(23,'pending'),/Career history/);
  await db.exec('RESET ROLE');
  await assert.rejects(db.exec(`INSERT INTO transfers(id,status) VALUES('${id(99)}','approved')`),/start pending/);
  await login();await assert.rejects(db.exec(`UPDATE transfers SET new_team_id='${id(3)}' WHERE id='${id(23)}'`),/participants/);
  await insert(26,12);await db.exec(`UPDATE applications SET status='pending' WHERE id='${id(12)}'`);
  await login();await assert.rejects(update(26,'approved'),/registration/);
  await db.exec('RESET ROLE');
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM player_career_history WHERE player_id='${id(12)}'`)).rows[0].n,0);
 } finally {await db.close();}
});
