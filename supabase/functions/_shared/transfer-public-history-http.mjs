const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type,authorization,apikey,x-client-info',
    'Access-Control-Allow-Methods': 'POST,OPTIONS' };
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });

// Public, bounded career data only. Pending requests use verified-session APIs.
export function createTransferPublicHistoryHandler(rpc) {
    return async request => {
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
        if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' });
        try {
            const raw = await request.text();
            if (raw.length > 1024) return reply(413, { error: 'Request too large' });
            let body;
            try { body = JSON.parse(raw); } catch { return reply(400, { error: 'Invalid request' }); }
            if (!body || Array.isArray(body) || typeof body.player_id !== 'string' || !uuid.test(body.player_id)
                || (body.after != null && (typeof body.after !== 'string' || !uuid.test(body.after)))) {
                return reply(400, { error: 'Invalid request' });
            }
            const { data, error } = await rpc('public_player_transfer_history', { p_player_id: body.player_id, p_after: body.after ?? null });
            if (error || !data || ![200,400].includes(data.status)) return reply(500, { error: 'History unavailable' });
            if (data.status === 400) return reply(400, { error: 'Invalid cursor' });
            return reply(200, { items: data.items, next_cursor: data.next_cursor });
        } catch { return reply(500, { error: 'History unavailable' }); }
    };
}
