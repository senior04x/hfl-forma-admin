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
test('verified owner of organization one retains access and only profile authority columns are read', async () => {
 const f=fixture(); assert.deepEqual(await invoke(f),{userId:uid, organizationId:1, role:'org_admin'});
 assert.deepEqual(f.calls,[['verify','test-token'],['table','admin_users'],['columns','id,role,organization_id'],['identity','id',uid]]);
});
test('no admin record, ordinary role and wrong identity are denied', async () => {
 for(const admin of [null,{id:uid,role:'user',organization_id:1},{id:'other',role:'org_admin',organization_id:1}]) await rejects(invoke(fixture({admin})),403);
});
test('other organization is denied even for a super admin', async () => {
 for(const role of ['org_admin','super_admin']) await rejects(invoke(fixture({admin:{id:uid,role,organization_id:2}})),403);
});
test('self-declared user metadata cannot grant admin access', async () => {
 await rejects(invoke(fixture({user:{id:uid,user_metadata:{role:'super_admin',organization_id:1}},admin:null})),403);
});
test('database failure is sanitized and grants no access', async () => {
 await assert.rejects(invoke(fixture({dbError:{message:'sensitive database detail'}})), error => error.status===503 && error.message==='AUTH_UNAVAILABLE');
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
