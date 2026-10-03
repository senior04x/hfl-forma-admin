import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeOrganizationAdmin, authorizeGlobalAdmin, AdminAuthorizationError} from './admin-authorization.mjs';
const uid = '00000000-0000-4000-8000-000000000001';
function fixture({user = {id: uid}, authError = null, admin = {id:uid, role:'org_admin', organization_id:1}, dbError = null} = {}) {
 const calls = [];
 return {calls, authClient: {auth: {getUser: async token => { calls.push(['verify', token]); return {data:{user}, error:authError}; }}},
 adminClient: {from: table => { calls.push(['table', table]); return {select: columns => { calls.push(['columns', columns]); return {eq: (field, value) => { calls.push(['identity', field, value]); return {maybeSingle: async () => ({data: admin, error: dbError})}; }}; }}; }}};
}
const invoke = (f, extra = {}) => authorizeOrganizationAdmin({...f, authorization:'Bearer test-token', organizationId:1, ...extra});
const rejects = (promise, status) => assert.rejects(promise, error => error instanceof AdminAuthorizationError && error.status === status);
test('missing or malformed token stops before all network calls', async () => {
 for(const authorization of [null, '', 'test-token', 'Bearer a b', 'Bearer ']) {
  const f=fixture(); await rejects(invoke(f,{authorization}),401); assert.deepEqual(f.calls,[]);
 }
});
test('invalid organization stops before authentication', async () => {
 for(const organizationId of [null, 0, -1, '1', 1.5, Number.MAX_SAFE_INTEGER + 1]) {
  const f=fixture(); await rejects(invoke(f,{organizationId}),400); assert.deepEqual(f.calls,[]);
 }
});
test('rejected token cannot query authoritative membership', async () => {
 const f=fixture({authError:{message:'private upstream error'}}); await rejects(invoke(f),401); assert.equal(f.calls.length,1);
});
function ownerFixture(rows=[{id:1,admin_email:'owner@example.test'}],user={id:uid,email:'owner@example.test',email_confirmed_at:'2026-01-01'},error=null) {
 return {authClient:{auth:{getUser:async()=>({data:{user}})}},adminClient:{from:table=>{
  assert.equal(table,'organizations');return {select:columns=>{assert.equal(columns,'id,admin_email');return {ilike:()=>({limit:async()=>({data:rows,error})})};}};
 }}};
}
test('verified organization owner retains exact access without admin_users membership',async()=>{
 assert.deepEqual(await invoke(ownerFixture()),{userId:uid,organizationId:1,role:'org_admin'});
});
test('other organization, duplicates, missing and unverified owner are denied',async()=>{
 for(const rows of [[],[{id:2,admin_email:'owner@example.test'}],[{id:1,admin_email:'wrong@example.test'}],[{id:1},{id:2}]]) await rejects(invoke(ownerFixture(rows)),403);
 await rejects(invoke(ownerFixture(undefined,{id:uid,email:'owner@example.test'})),403);
});
test('owner lookup errors do not disclose upstream details',async()=>{
 await assert.rejects(invoke(ownerFixture(undefined,undefined,{message:'private'})),e=>e.status===503&&e.message==='AUTH_UNAVAILABLE');
});

test('global provisioning rejects organization admins and forged global metadata', async () => {
 for (const f of [fixture(), fixture({user:{id:uid,user_metadata:{role:'super_admin'}},admin:null}),
   fixture({admin:{id:'other',role:'super_admin',organization_id:1}})]) {
  await rejects(authorizeGlobalAdmin({...f, authorization:'Bearer test-token'}),403);
 }
});

test('global provisioning grants only the verified database super admin', async () => {
 const f=fixture({admin:{id:uid,role:'super_admin',organization_id:null}});
 assert.deepEqual(await authorizeGlobalAdmin({...f,authorization:'Bearer test-token'}),{userId:uid,role:'super_admin'});
 assert.deepEqual(f.calls.at(-1),['identity','id',uid]);
});

test('global provisioning denies missing tokens and sanitizes database errors', async () => {
 const f=fixture();
 await rejects(authorizeGlobalAdmin({...f,authorization:''}),401);
 assert.deepEqual(f.calls,[]);
 await assert.rejects(authorizeGlobalAdmin({...fixture({dbError:{message:'private'}}),authorization:'Bearer test-token'}),
   error => error.status===503 && error.message==='AUTH_UNAVAILABLE');
});
