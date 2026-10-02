import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const sql=await readFile(new URL('../drafts/provisioning-rate-limit.sql',import.meta.url),'utf8');
const first='11111111-1111-4111-8111-111111111111';
const second='22222222-2222-4222-8222-222222222222';
test('shared actor rate limit denies excess requests without extending expiry',async()=>{
 const db=new PGlite();
 try {
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; GRANT USAGE ON SCHEMA public TO service_role;');
  await db.exec(sql);
  const consume=async(id=first)=>(await db.query('SELECT consume_organization_provisioning_rate($1) AS allowed',[id])).rows[0].allowed;
  for(const role of ['anon','authenticated']) {
   await db.exec(`SET ROLE ${role}`);
   await assert.rejects(consume(),{code:'42501'});
   await assert.rejects(db.query('SELECT * FROM organization_provisioning_rate'),{code:'42501'});
   await db.exec('RESET ROLE');
  }
  await db.exec('SET ROLE service_role');
  await assert.rejects(consume(null),{code:'22023'});
  const results=await Promise.all(Array.from({length:8},()=>consume()));
  assert.equal(results.filter(Boolean).length,5);
  assert.equal(await consume(second),true);
  const before=(await db.query('SELECT window_started,attempts FROM organization_provisioning_rate WHERE actor_id=$1',[first])).rows[0];
  assert.equal(await consume(),false);
  assert.deepEqual((await db.query('SELECT window_started,attempts FROM organization_provisioning_rate WHERE actor_id=$1',[first])).rows[0],before);
  await db.query("UPDATE organization_provisioning_rate SET window_started=clock_timestamp()-interval '16 minutes' WHERE actor_id=$1",[first]);
  assert.equal(await consume(),true);
  assert.equal((await db.query('SELECT attempts FROM organization_provisioning_rate WHERE actor_id=$1',[first])).rows[0].attempts,1);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM organization_provisioning_rate')).rows[0].n,2);
 } finally {await db.close();}
});
