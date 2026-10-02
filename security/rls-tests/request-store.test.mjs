import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createProvisioningStore } from '../../supabase/functions/_shared/provisioning-store.mjs';
const sql=await readFile(new URL('../drafts/provisioning-request-store.sql',import.meta.url),'utf8');
const actor='11111111-1111-4111-8111-111111111111';
const request='22222222-2222-4222-8222-222222222222';
const user='33333333-3333-4333-8333-333333333333';
const payload={name:'Synthetic',email:'synthetic@example.invalid',slug:'synthetic',logoUrl:null};
test('durable reservations, lease expiry and phase transitions fail closed',async()=>{
 const db=new PGlite();
 try {
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; GRANT USAGE ON SCHEMA public TO service_role;');
  await db.exec(sql);
  const rpcClient={rpc:async(name,args)=>{
   try {
    const entries=Object.entries(args);
    const result=await db.query(`SELECT ${name}(${entries.map(([key],i)=>`${key} => $${i+1}`).join(',')}) AS value`,entries.map(([,v])=>v));
    return {data:result.rows[0].value};
   } catch(error) {return {error};}
  }};
  const store=createProvisioningStore(rpcClient);
  const claim=(overrides={})=>store.claim({actorId:actor,requestId:request,payload,...overrides});
  await db.exec('SET ROLE authenticated');
  await assert.rejects(claim(),/PROVISIONING_STORE_UNAVAILABLE/);
  await assert.rejects(db.query('SELECT payload FROM organization_provisioning_requests'),{code:'42501'});
  await db.exec('RESET ROLE; SET ROLE service_role');
  // Concurrent promises on PGlite's serialized connection exercise competing
  // claims; hosted multi-connection transaction races need separate validation.
  const claims=await Promise.all([claim(),claim()]);
  assert.equal(claims.filter(c=>c.state==='new').length,1);
  assert.equal(claims.filter(c=>c.state==='busy').length,1);
  const first=claims.find(c=>c.state==='new');
  await assert.rejects(claim({payload:{...payload,name:'Changed'}}));
  await assert.rejects(claim({requestId:user})); // Same email/slug, different key.
  await assert.rejects(claim({payload:{...payload,password:'must-not-persist'}}));
  await store.markAuthCreating(first.lease);
  await db.exec("UPDATE organization_provisioning_requests SET lease_until=clock_timestamp()-interval '1 second'");
  assert.equal((await claim()).state,'auth_creating');
  await assert.rejects(store.markAuthCreated(first.lease,user));
  // Fixture-only recovery simulation. Production requires reviewed resolution.
  await db.query("UPDATE organization_provisioning_requests SET phase='auth_created',auth_user_id=$1",[user]);
  const resumed=await claim();assert.equal(resumed.state,'auth_created');assert.equal(resumed.userId,user);
  assert.notEqual(resumed.lease,first.lease);
  await assert.rejects(store.complete(first.lease,7));
  await store.complete(resumed.lease,7);
  assert.deepEqual(await claim(),{state:'complete',organizationId:7});
  await assert.rejects(store.markAuthCreating(resumed.lease));
  const rows=(await db.query('SELECT payload,auth_user_id FROM organization_provisioning_requests')).rows;
  assert.equal(rows.length,1);assert.deepEqual(rows[0].payload,payload);assert.equal(rows[0].auth_user_id,user);
 } finally {await db.close();}
});
