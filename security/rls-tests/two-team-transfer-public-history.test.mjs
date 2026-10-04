import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
test('public career RPC exposes approved fields only with scoped stable pagination',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
   CREATE TABLE transfers(id uuid PRIMARY KEY,player_id uuid,old_team_name text,old_team_logo text,new_team_name text,new_team_logo text,status text,created_at timestamptz,reason text);
   ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;
   REVOKE ALL ON transfers FROM anon,authenticated,service_role;`);
  for(let n=1;n<=25;n++) await db.query("INSERT INTO transfers VALUES($1,$2,'Old',NULL,'New',NULL,'approved','2026-01-01','Private reason')",[id(n),id(100)]);
  await db.query("INSERT INTO transfers VALUES($1,$2,'Old',NULL,'New',NULL,'pending',now(),'Private reason'),($3,$2,'Old',NULL,'New',NULL,'rejected',now(),'Private reason'),($4,$5,'Other',NULL,'Other',NULL,'approved',now(),'Private reason')",[id(30),id(100),id(31),id(32),id(101)]);
  await db.exec(await readFile(new URL('../drafts/two-team-transfer-public-history.sql',import.meta.url),'utf8'));
  const page=async(after=null)=>(await db.query('SELECT public_player_transfer_history($1,$2) AS result',[id(100),after])).rows[0].result;
  await db.exec('SET ROLE service_role');
  const first=await page();assert.equal(first.items.length,20);assert.equal(first.items[0].id,id(25));assert.equal(first.next_cursor,id(6));
  assert.deepEqual(Object.keys(first.items[0]).sort(),['id','player_id','old_team_name','old_team_logo','new_team_name','new_team_logo','status','created_at'].sort());
  const second=await page(first.next_cursor);assert.equal(second.items.length,5);assert.equal(second.next_cursor,null);
  assert.equal(new Set([...first.items,...second.items].map(r=>r.id)).size,25);
  assert.ok([...first.items,...second.items].every(r=>r.status==='approved'&&r.player_id===id(100)));
  for(const cursor of [id(30),id(31),id(32),id(99)]) assert.equal((await page(cursor)).status,400);
  await assert.rejects(db.query('SELECT * FROM transfers'),e=>e.code==='42501');
  await db.exec('RESET ROLE');
  for(const role of ['anon','authenticated']){await db.exec(`SET ROLE ${role}`);await assert.rejects(page(),e=>e.code==='42501');await db.exec('RESET ROLE');}
 }finally{await db.close();}
});
