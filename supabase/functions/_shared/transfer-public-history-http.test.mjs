import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransferPublicHistoryHandler } from './transfer-public-history-http.mjs';
const id = '00000000-0000-0000-0000-000000000001';
const request = body => new Request('https://example.test', {method:'POST',body:JSON.stringify(body)});
test('public history forwards only validated player and cursor, never requested private status',async()=>{
    const handler=createTransferPublicHistoryHandler(async(name,args)=>{
        assert.equal(name,'public_player_transfer_history');
        assert.deepEqual(args,{p_player_id:id,p_after:null});
        return {data:{status:200,items:[],next_cursor:null}};
    });
    const response=await handler(request({player_id:id,status:'pending',reason:true,organization_id:1}));
    assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
});
test('invalid input never reaches database; internal failures remain generic',async()=>{
    const handler=createTransferPublicHistoryHandler(async()=>assert.fail('Unexpected RPC'));
    for(const body of [null,[],{}, {player_id:'bad'}, {player_id:id,after:'bad'}]) assert.equal((await handler(request(body))).status,400);
    assert.equal((await handler(new Request('https://example.test',{method:'POST',body:'x'.repeat(1025)}))).status,413);
    assert.equal((await handler(new Request('https://example.test'))).status,405);
    const failed=createTransferPublicHistoryHandler(async()=>{throw Error('secret');});
    const response=await failed(request({player_id:id}));assert.equal(response.status,500);assert.doesNotMatch(await response.text(),/secret/);
});
