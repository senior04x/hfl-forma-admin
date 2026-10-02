import test from 'node:test';
import assert from 'node:assert/strict';
import {createProvisioningHandler} from './provisioning-http.mjs';
function fixture(extra={}) {
 const calls=[];
 const handler=createProvisioningHandler({enabled:true,allowedOrigins:['https://admin.example.invalid'],
  consumeRate:async()=>{calls.push('rate');return true;},
  run:async({beforeProvisioning})=>{await beforeProvisioning('verified-actor');calls.push('run');return {organizationId:7};},...extra});
 return {handler,calls};
}
const request=(body='{}',headers={})=>new Request('https://example.invalid',{method:'POST',headers:{authorization:'Bearer synthetic','content-type':'application/json',...headers},body});
test('disabled, disallowed origins and malformed bodies never start writes',async()=>{
 for(const [extra,req,status] of [
  [{enabled:false},request(),503], [{},request('{}',{origin:'https://other.invalid'}),403],
  [{},request('bad-json'),400],[{},request('[]'),400],[{},request('{"secret":"extra"}'),400],
  [{},request('x'.repeat(8193)),413],[{},request('{}',{authorization:''}),401],
  [{},request('{}',{'content-type':'text/plain'}),415],
 ]) {const {handler,calls}=fixture(extra);assert.equal((await handler(req)).status,status);assert.deepEqual(calls,[]);}
});
test('rate failures fail closed and successful responses do not cache',async()=>{
 for(const [consumeRate,status] of [[async()=>false,429],[async()=>{throw new Error('private token');},503]]) {
  const {handler,calls}=fixture({consumeRate});const res=await handler(request());
  assert.equal(res.status,status);assert.deepEqual(calls,[]);assert.ok(!(await res.text()).includes('private'));
 }
 const {handler,calls}=fixture();const res=await handler(request('{}',{origin:'https://admin.example.invalid'}));
 assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-store');
 assert.equal(res.headers.get('access-control-allow-origin'),'https://admin.example.invalid');
 assert.deepEqual(calls,['rate','run']);
});
test('unexpected backend errors are sanitized',async()=>{
 const {handler}=fixture({run:async()=>{throw new Error('database password');}});
 const res=await handler(request());assert.equal(res.status,503);assert.equal((await res.json()).code,'PROVISIONING_UNAVAILABLE');
});
