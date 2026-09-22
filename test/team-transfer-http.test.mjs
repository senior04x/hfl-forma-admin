import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTransferHandler, tokenHash } from '../supabase/functions/_shared/team-transfer-http.mjs';

const player = '00000000-0000-4000-8000-000000000001';
const token = 'a'.repeat(64);
const req = (body, authorization) => new Request('https://example.test', {
  method: 'POST', headers: authorization ? { Authorization: authorization } : {},
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
test('HTTP rejects malformed input before database access', async () => {
  const rpc = () => { throw new Error('Unexpected database access'); };
  const verify = createTransferHandler('verify', rpc);
  const request = createTransferHandler('request', rpc);
  assert.equal((await verify(new Request('https://example.test'))).status,405);
  assert.equal((await verify(new Request('https://example.test',{method:'OPTIONS'}))).status,204);
  for (const body of ['{', 'null', '[]', { phone: {}, code:'1234' },
    {phone:'1901234567',code:'1234'}, {phone:'901234567',code:1234}]) {
    assert.equal((await verify(req(body))).status,400);
  }
  assert.equal((await verify(req('x'.repeat(4097)))).status,413);
  assert.equal((await request(req({player_id:player,reason:'Join'}))).status,401);
  assert.equal((await request(req({player_id:player,reason:' '},'Bearer '+token))).status,400);
  assert.equal((await request(req({player_id:'invalid',reason:'Join'},'Bearer '+token))).status,400);
});
test('captain token is random and only its digest is stored', async () => {
  let args;
  const verify = createTransferHandler('verify', async (name, params) => {
    args = { name, params }; return { data:{status:200,success:true,role:'captain'},error:null };
  });
  const response = await verify(req({phone:'+998 (90) 123-45-67',code:'1234'}));
  const result = await response.json();
  assert.match(result.sessionToken,/^[0-9a-f]{64}$/);
  assert.equal(args.name,'verify_team_transfer_otp');
  assert.equal(args.params.p_phone,'901234567');
  assert.equal(args.params.p_token_hash,await tokenHash(result.sessionToken));
  assert.notEqual(args.params.p_token_hash,result.sessionToken);
  assert.equal(response.headers.get('cache-control'),'no-store');
});
test('transfer identity comes from token; spoofed fields are ignored', async () => {
  let args;
  const handler = createTransferHandler('request', async (name,params) => {
    args = {name,params}; return {data:{status:201,success:true},error:null};
  });
  const response = await handler(req({player_id:player,reason:' Join ',captain_phone:'FAKE',
    organization_id:999,player_confirmed:true,status:'approved'},'Bearer '+token));
  assert.equal(response.status,201);
  assert.deepEqual(args,{name:'request_team_transfer',params:{p_token_hash:await tokenHash(token),
    p_player_id:player,p_reason:'Join',p_team_id:null}});
});
test('errors never expose database internals or issue a token', async () => {
  const handler = createTransferHandler('verify', async () => ({error:{message:'private database detail'}}));
  const response = await handler(req({phone:'901234567',code:'1234'}));
  assert.equal(response.status,500);
  assert.deepEqual(await response.json(),{error:'Request failed. Please retry'});
  const rejected = createTransferHandler('verify',async () => ({data:{status:403,error:'Captain account required'}}));
  const body = await (await rejected(req({phone:'901234567',code:'1234'}))).json();
  assert.equal(body.sessionToken,undefined);
});

test('page validates action and cursor; client organization is never forwarded', async () => {
  let args;
  const handler = createTransferHandler('page',async(name,params)=>{
    args={name,params}; return {data:{status:200,items:[]}};
  });
  assert.equal((await handler(req({action:'history',organization_id:999},'Bearer '+token))).status,200);
  assert.deepEqual(args,{name:'team_transfer_page',params:{p_token_hash:await tokenHash(token),
    p_action:'history',p_query:'',p_after:null}});
  assert.equal((await handler(req({action:'drop'},'Bearer '+token))).status,400);
  assert.equal((await handler(req({action:'players',after:'invalid'},'Bearer '+token))).status,400);
});
