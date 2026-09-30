import { tokenHash } from './team-transfer-http.mjs';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info',
    'Access-Control-Allow-Methods': 'POST,OPTIONS' };
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });

export function createTransferAppHandler(kind, rpc) {
    if (!['verify_player', 'consent', 'page', 'request'].includes(kind)) throw new Error('Unknown transfer handler');
    return async request => {
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
        if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' });
        try {
            const raw = await request.text();
            if (raw.length > 4096) return reply(413, { error: 'Request too large' });
            let body;
            try { body = JSON.parse(raw); } catch { return reply(400, { error: 'Invalid request' }); }
            if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(400, { error: 'Invalid request' });
            let token, name, params;
            if (kind === 'verify_player') {
                const phone = typeof body.phone === 'string' && body.phone.length <= 32 ? body.phone.replace(/[\s()+-]/g, '') : '';
                if (!/^(998)?[0-9]{9}$/.test(phone) || typeof body.code !== 'string' || !/^[0-9]{4}$/.test(body.code)
                    || typeof body.player_id !== 'string' || !uuid.test(body.player_id)) return reply(400, { error: 'Invalid request' });
                token = Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
                name = 'verify_transfer_player_otp';
                params = { p_phone: phone.slice(-9), p_code: body.code, p_player_id: body.player_id, p_token_hash: await tokenHash(token) };
            } else {
                const bearer = request.headers.get('Authorization')?.match(/^Bearer ([0-9a-f]{64})$/i);
                if (!bearer) return reply(401, { error: 'Session required' });
                const hash = await tokenHash(bearer[1]);
                if (kind === 'page') {
                    if (!['player', 'captain'].includes(body.actor)
                        || (body.direction != null && !['all', 'incoming', 'outgoing'].includes(body.direction))
                        || (body.after != null && (typeof body.after !== 'string' || !uuid.test(body.after)))
                        || (body.transfer_id != null && (typeof body.transfer_id !== 'string' || !uuid.test(body.transfer_id)))) {
                        return reply(400, { error: 'Invalid request' });
                    }
                    name = 'transfer_app_page';
                    params = { p_token_hash: hash, p_actor: body.actor, p_direction: body.direction ?? 'all',
                        p_after: body.after ?? null, p_transfer_id: body.transfer_id ?? null };
                } else if (kind === 'request') {
                    if (typeof body.player_id !== 'string' || !uuid.test(body.player_id)
                        || typeof body.reason !== 'string' || body.reason.trim().length < 1 || body.reason.trim().length > 1000) {
                        return reply(400, { error: 'Invalid request' });
                    }
                    name = 'request_transfer_app';
                    params = { p_token_hash: hash, p_player_id: body.player_id, p_reason: body.reason.trim(), p_team_id: null };
                } else {
                if (typeof body.transfer_id !== 'string' || !uuid.test(body.transfer_id)
                    || !['player', 'old_team', 'new_team'].includes(body.party)
                    || !['approved', 'rejected'].includes(body.decision)) return reply(400, { error: 'Invalid decision' });
                name = 'record_transfer_app_consent';
                params = { p_token_hash: hash, p_transfer_id: body.transfer_id, p_party: body.party, p_decision: body.decision };
                }
            }
            const { data, error } = await rpc(name, params);
            if (error || !data || ![200,201,400,401,403,404,409,429].includes(data.status)) return reply(500, { error: 'Request failed. Please retry' });
            const { status, ...result } = data;
            if (token && status === 200) result.sessionToken = token;
            return reply(status, result);
        } catch { return reply(500, { error: 'Request failed. Please retry' }); }
    };
}
