import test from 'node:test';
import assert from 'node:assert/strict';
import {submitOrganizationProvisioning} from './organizationProvisioning.js';
test('only confirmed server result is accepted',async()=>{
 assert.equal(await submitOrganizationProvisioning({functions:{invoke:async()=>({data:{code:'PROVISIONED',organizationId:7}})}},{}),7);
 for(const data of [null,{code:'PROVISIONED',organizationId:0},{code:'OTHER',organizationId:7}])
  await assert.rejects(submitOrganizationProvisioning({functions:{invoke:async()=>({data})}},{}));
});
test('disabled endpoint and upstream errors never expose private details',async()=>{
 const error={message:'private database credential',context:new Response(JSON.stringify({code:'PROVISIONING_DISABLED'}))};
 await assert.rejects(submitOrganizationProvisioning({functions:{invoke:async()=>({error})}},{}),e=>e.message.includes('vaqtincha yopiq')&&!e.message.includes('private'));
 await assert.rejects(submitOrganizationProvisioning({functions:{invoke:async()=>{throw new Error('private');}}},{}),e=>!e.message.includes('private'));
});
