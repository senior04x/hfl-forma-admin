import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransferAppHandler } from './transfer-app-http.mjs';
const id = '12345678-1234-1234-1234-123456789abc';
const token = 'a'.repeat(64);
const consent = { transfer_id: id, party: 'player', decision: 'approved' };
const request = (body, bearer = token) => new Request('https://example.test/transfer-consent', {
    method: 'POST', headers: bearer ? { Authorization: `Bearer ${bearer}` } : {}, body: JSON.stringify(body)
});
test('consent only forwards a hashed session, transfer, party and decision', async () => {
    let call;
    const handler = createTransferAppHandler('consent', async (name, params) => {
        call = { name, params }; return { data: { status: 200, success: true }, error: null };
    });
    const response = await handler(request({ ...consent, subject_id: 'forged', player_id: 'forged', status: 'approved' }));
    assert.equal(response.status, 200);
    assert.equal(call.name, 'record_transfer_app_consent');
    assert.deepEqual(Object.keys(call.params).sort(), ['p_decision','p_party','p_token_hash','p_transfer_id']);
    assert.match(call.params.p_token_hash, /^sha256:[a-f0-9]{64}$/);
    assert.notEqual(call.params.p_token_hash, token);
});
test('missing sessions, invalid IDs and admin decisions never invoke the database', async () => {
    const handler = createTransferAppHandler('consent', async () => assert.fail('Unexpected database write'));
    assert.equal((await handler(request(consent, null))).status, 401);
    assert.equal((await handler(request(consent, 'invalid'))).status, 401);
    for (const body of [{ ...consent, transfer_id: 'invalid' }, { ...consent, party: 'admin' }, { ...consent, decision: 'pending' }, null, []]) {
        assert.equal((await handler(request(body))).status, 400);
    }
});
test('server ownership and immutable-decision failures reach the application', async () => {
    for (const status of [401,403,404,409,429]) {
        const handler = createTransferAppHandler('consent', async () => ({ data: { status, error: 'Controlled rejection' }, error: null }));
        assert.equal((await handler(request(consent))).status, status);
    }
});
test('repeated consent can return already-recorded without changing the decision', async () => {
    const handler = createTransferAppHandler('consent', async () => ({ data: { status: 200, success: true, already_recorded: true }, error: null }));
    assert.equal((await (await handler(request(consent))).json()).already_recorded, true);
});
test('player OTP success mints an opaque token but stores only its hash', async () => {
    let params;
    const handler = createTransferAppHandler('verify_player', async (name, args) => {
        assert.equal(name, 'verify_transfer_player_otp'); params = args;
        return { data: { status: 200, success: true, expiresAt: '2030-01-01T00:00:00Z' }, error: null };
    });
    const response = await handler(request({ phone: '+998 90 123 45 67', code: '1234', player_id: id }, null));
    const data = await response.json();
    assert.match(data.sessionToken, /^[a-f0-9]{64}$/);
    assert.equal(params.p_phone, '901234567');
    assert.match(params.p_token_hash, /^sha256:[a-f0-9]{64}$/);
    assert.notEqual(params.p_token_hash, data.sessionToken);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
});
test('failed OTP never reveals a session token', async () => {
    const handler = createTransferAppHandler('verify_player', async () => ({ data: { status: 401, error: 'Invalid code' }, error: null }));
    const response = await handler(request({ phone: '901234567', code: '1234', player_id: id }, null));
    assert.equal(response.status, 401);
    assert.equal((await response.json()).sessionToken, undefined);
});
test('database failures do not expose internal error messages or stacks', async () => {
    for (const rpc of [async () => { throw new Error('secret database details'); }, async () => ({ error: { message: 'secret database details' } })]) {
        const response = await createTransferAppHandler('consent', rpc)(request(consent));
        assert.equal(response.status, 500);
        assert.doesNotMatch(await response.text(), /secret/);
    }
});
test('malformed and oversized requests never write to the database', async () => {
    const handler = createTransferAppHandler('consent', async () => assert.fail('Unexpected database write'));
    const rawRequest = body => new Request('https://example.test', { method: 'POST', body });
    assert.equal((await handler(rawRequest('{'))).status, 400);
    assert.equal((await handler(rawRequest('x'.repeat(4097)))).status, 413);
    assert.equal((await handler(new Request('https://example.test'))).status, 405);
});
test('mobile request uses a separate RPC and derives destination from session', async () => {
    let call;
    const handler = createTransferAppHandler('request', async (name, params) => {
        call = { name, params }; return { data: { status: 201, success: true }, error: null };
    });
    assert.equal((await handler(request({ player_id: id, reason: ' Join team ', new_team_id: 'forged', app_consent_required: false }))).status, 201);
    assert.equal(call.name, 'request_transfer_app');
    assert.equal(call.params.p_team_id, null);
    assert.equal(call.params.p_reason, 'Join team');
    assert.equal(call.params.app_consent_required, undefined);
});
test('scoped pages only forward a validated actor, direction and cursor', async () => {
    let call;
    const handler = createTransferAppHandler('page', async (name, params) => {
        call = { name, params }; return { data: { status: 200, items: [], next_cursor: null }, error: null };
    });
    assert.equal((await handler(request({ actor: 'captain', direction: 'incoming', after: id, team_id: 'forged' }))).status, 200);
    assert.equal(call.name, 'transfer_app_page');
    assert.equal(call.params.p_team_id, undefined);
    assert.equal(call.params.p_after, id);
    for (const body of [{ actor: 'admin' }, { actor: 'player', after: 'invalid' }, { actor: 'captain', direction: 'public' }]) {
        assert.equal((await handler(request(body))).status, 400);
    }
});

test('cancel endpoint derives ownership from the hashed session and ignores forged team IDs',async()=>{
 let call;const handler=createTransferAppHandler('cancel',async(name,params)=>{call={name,params};return {data:{status:200,success:true},error:null};});
 assert.equal((await handler(request({transfer_id:id,team_id:'forged',actor:'admin'}))).status,200);
 assert.equal(call.name,'cancel_transfer_app');assert.deepEqual(Object.keys(call.params).sort(),['p_token_hash','p_transfer_id']);
 assert.match(call.params.p_token_hash,/^sha256:[a-f0-9]{64}$/);
 const reject=createTransferAppHandler('cancel',async()=>assert.fail('Unexpected write'));
 assert.equal((await reject(request({transfer_id:id},null))).status,401);
 assert.equal((await reject(request({transfer_id:'invalid'}))).status,400);
});
