import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTransferApi} from '../js/transfer-api.mjs';
const token='a'.repeat(64);
const login={team:{id:'team',name:'Team'},sessionToken:token,expiresAt:'2030-01-01T00:00:00Z'};
const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
test('session token stays out of URLs and request identity',async()=>{
 const calls=[];
 const api=createTransferApi(async(url,options)=>{
   calls.push({url,options}); return response(url.endsWith('verify-otp')?login:{success:true});
 });
 const result=await api.login('901234567','1234');
 assert.equal(result.sessionToken,undefined);
 await api.request('player',' Reason ');
 assert.ok(!calls[1].url.includes(token));
 assert.equal(calls[1].options.headers.Authorization,'Bearer '+token);
 assert.deepEqual(JSON.parse(calls[1].options.body),{player_id:'player',reason:'Reason'});
 await api.logout();
 await assert.rejects(api.page('context'),e=>e.status===401);
});
test('expired/401 sessions cannot make further requests',async()=>{
 let time=Date.parse('2029-01-01T00:00:00Z'),count=0;
 const api=createTransferApi(async()=>{count++;return response(login);},()=>time);
 await api.login('901234567','1234'); time=Date.parse('2031-01-01T00:00:00Z');
 await assert.rejects(api.page('context'),e=>e.status===401); assert.equal(count,1);
 const denied=createTransferApi(async url=>url.endsWith('verify-otp')?response(login):response({},401));
 await denied.login('901234567','1234'); await assert.rejects(denied.page('context'),e=>e.status===401);
 await assert.rejects(denied.page('context'),e=>e.status===401);
});
test('clearing a session during pending login cannot resurrect it',async()=>{
 let finish;
 const api=createTransferApi(()=>new Promise(resolve=>{finish=resolve;}));
 const waiting=api.login('901234567','1234'); api.clear(); finish(response(login));
 await assert.rejects(waiting,e=>e.name==='AbortError');
 await assert.rejects(api.page('context'),e=>e.status===401);
});
test('failed request is never automatically retried',async()=>{
 let calls=0;
 const api=createTransferApi(async url=>{
   if(url.endsWith('verify-otp')) return response(login);
   calls++;throw new Error('timeout');
 });
 await api.login('901234567','1234'); await assert.rejects(api.request('player','Reason'),e=>e.status===0);
 assert.equal(calls,1);
});
