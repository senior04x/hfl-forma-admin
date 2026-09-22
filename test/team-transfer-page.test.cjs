const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const hash='sha256:'+'a'.repeat(64);
test('captain page scopes all reads and paginates without private fields',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE organizations(id bigint PRIMARY KEY,transfer_window_open boolean);
    CREATE TABLE teams(id uuid PRIMARY KEY,name text,captain_phone text,organization_id bigint);
    CREATE TABLE applications(id uuid PRIMARY KEY,first_name text,last_name text,team_id uuid,status text,phone text);
    CREATE TABLE team_sessions(id uuid DEFAULT gen_random_uuid(),token text,phone text,team_id uuid,expires_at timestamptz);
    CREATE TABLE transfers(id uuid PRIMARY KEY,player_id uuid,requested_by_team_id uuid,organization_id bigint,
      player_name text,old_team_name text,status text,created_at timestamptz,reason text);
    CREATE FUNCTION public.transfer_phone(value text) RETURNS text LANGUAGE sql IMMUTABLE STRICT AS
      $$ SELECT right(regexp_replace(value,'[^0-9]','','g'),9) $$;
    INSERT INTO organizations VALUES (7,true),(8,false);
    INSERT INTO teams VALUES ('${id(1)}','Mine','901234567',7),('${id(2)}','Other','909876543',7),('${id(3)}','Foreign','908888888',8);
    INSERT INTO team_sessions(token,phone,team_id,expires_at) VALUES ('${hash}','901234567','${id(1)}',now()+interval '1 day');
    INSERT INTO applications VALUES ('${id(31)}','Ali','Mine','${id(1)}','approved','private'),
      ('${id(32)}','Ali','Foreign','${id(3)}','approved','private'),
      ('${id(33)}','Ali','Pending','${id(2)}','pending','private');
  `);
  for(let n=40;n<62;n++) await db.query('INSERT INTO applications VALUES ($1,$2,$3,$4,$5,$6)',[id(n),'Ali','Player',id(2),'approved','private']);
  for(let n=70;n<92;n++) await db.query('INSERT INTO transfers VALUES ($1,$2,$3,7,$4,$5,$6,$7,$8)',
    [id(n),id(40),id(1),'Ali','Other','pending',new Date(2026,0,n-69).toISOString(),'Reason']);
  await db.query('INSERT INTO transfers VALUES ($1,$2,$3,7,$4,$5,$6,now(),$7)',[id(99),id(40),id(2),'Hidden','Other','pending','Private']);
  await db.exec(readFileSync(resolve(__dirname,'../migrations/20260926_team_transfer_page.sql'),'utf8'));
  const page=async(action,query='',after=null,token=hash)=>(await db.query(
    'SELECT team_transfer_page($1,$2,$3,$4) AS r',[token,action,query,after])).rows[0].r;
  assert.equal((await page('context')).team.id,id(1));
  const first=await page('players','Al'); assert.equal(first.items.length,20);
  assert.ok(first.items.every(p=>p.team_name==='Other'&&!('phone' in p)));
  assert.equal(first.items[0].has_pending,true);
  const next=await page('players','Al',first.next_cursor); assert.equal(next.items.length,2);
  assert.equal(next.next_cursor,null);
  assert.equal(new Set([...first.items,...next.items].map(p=>p.id)).size,22);
  assert.equal((await page('players','%%')).items.length,0);
  assert.equal((await page('players','A')).status,400);
  const history=await page('history'); assert.equal(history.items.length,20);
  assert.equal(history.items[0].id,id(91));
  assert.equal((await page('history','',history.next_cursor)).items.length,2);
  assert.equal((await page('history','',id(99))).status,400);
  assert.equal((await page('context','',null,'sha256:'+'b'.repeat(64))).status,401);
  await db.exec("UPDATE organizations SET transfer_window_open=false WHERE id=7");
  assert.equal((await page('context')).transfer_window_open,false);
  await db.exec(`UPDATE teams SET captain_phone='900000000' WHERE id='${id(1)}'`);
  assert.equal((await page('history')).status,401);
  await db.exec(`UPDATE teams SET captain_phone='901234567' WHERE id='${id(1)}'`);
  assert.equal((await page('logout')).success,true);
  assert.equal((await page('context')).status,401);
  await db.exec('SET ROLE anon'); await assert.rejects(page('context'),/permission denied/);
 } finally { await db.close(); }
});
