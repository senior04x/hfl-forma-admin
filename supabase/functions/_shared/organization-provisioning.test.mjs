import test from 'node:test';
import assert from 'node:assert/strict';
import { provisionOrganization } from './organization-provisioning.mjs';
const input = { requestId:'11111111-1111-4111-8111-111111111111',name:'Synthetic',email:'synthetic@example.invalid',slug:'synthetic',password:'synthetic-test-password' };
function fixture() {
 const calls=[];
 const args={input,authorization:'Bearer synthetic',authClient:{auth:{getUser:async()=>({data:{user:{id:'actor'}}})}},
  adminClient:{from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:'actor',role:'super_admin'}})})})}),
   auth:{admin:{createUser:async()=>{calls.push('create');return {data:{user:{id:'new-user'}}};}}},
   rpc:async()=>{calls.push('rpc');return {data:7};}},
  store:{claim:async()=>({state:'new',lease:'lease'}),markAuthCreating:async()=>calls.push('persist-before-auth'),
   markAuthCreated:async()=>calls.push('persist-uid'),complete:async()=>calls.push('complete')}};
 return {args,calls};
}
test('persists intent before Auth and UID before organization write',async()=>{
 const {args,calls}=fixture();assert.deepEqual(await provisionOrganization(args),{organizationId:7});
 assert.deepEqual(calls,['persist-before-auth','create','persist-uid','rpc','complete']);
});
test('uncertain, busy and completed requests never create another Auth identity',async()=>{
 for(const state of ['auth_creating','busy','complete']) {
  const {args,calls}=fixture();args.store.claim=async()=>({state,organizationId:7});
  if(state==='complete') assert.deepEqual(await provisionOrganization(args),{organizationId:7});
  else await assert.rejects(provisionOrganization(args),/PROVISIONING_REQUIRES_REVIEW/);
  assert.deepEqual(calls,[]);
 }
});
test('retry with persisted UID skips Auth creation',async()=>{
 const {args,calls}=fixture();args.store.claim=async()=>({state:'auth_created',userId:'persisted-user',lease:'lease'});
 await provisionOrganization(args);assert.deepEqual(calls,['rpc','complete']);
});
test('failed intent persistence prevents external writes',async()=>{
 const {args,calls}=fixture();args.store.markAuthCreating=async()=>{throw new Error('private');};
 await assert.rejects(provisionOrganization(args),/PROVISIONING_REQUIRES_REVIEW/);assert.deepEqual(calls,[]);
});
test('Auth timeout does not continue to organization writes',async()=>{
 const {args,calls}=fixture();args.adminClient.auth.admin.createUser=async()=>{calls.push('create');throw new Error('private');};
 await assert.rejects(provisionOrganization(args),/PROVISIONING_REQUIRES_REVIEW/);
 assert.deepEqual(calls,['persist-before-auth','create']);
});
test('invalid input cannot claim a request or create accounts',async()=>{
 const {args,calls}=fixture();args.input={...input,password:'short'};
 args.store.claim=async()=>{calls.push('claim');};
 await assert.rejects(provisionOrganization(args),/INVALID_INPUT/);assert.deepEqual(calls,[]);
});
