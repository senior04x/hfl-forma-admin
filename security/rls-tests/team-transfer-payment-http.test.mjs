import test from 'node:test';import assert from 'node:assert/strict';
import {createTransferHandler} from '../../supabase/functions/_shared/team-transfer-http.mjs';
test('known payment guard has a safe machine-readable 403 response',async()=>{
 const handler=createTransferHandler('request',async()=>({error:{code:'P0001',message:'TEAM_TRANSFER_PAYMENT_REQUIRED'}}));
 const res=await handler(new Request('https://example.invalid',{method:'POST',headers:{authorization:`Bearer ${'a'.repeat(64)}`},body:JSON.stringify({player_id:'11111111-1111-4111-8111-111111111111',reason:'Synthetic'})}));
 assert.equal(res.status,403);assert.equal((await res.json()).code,'TEAM_TRANSFER_PAYMENT_REQUIRED');
});
