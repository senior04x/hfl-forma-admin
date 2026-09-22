const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
const hex = bytes => Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
export async function tokenHash(token) {
  return 'sha256:' + hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))));
}

// Dependency injection keeps tests offline: no Telegram, no production DB.
export function createTransferHandler(kind, rpc) {
  return async req => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return reply(405, { error: 'Method not allowed' });
    try {
      const text = await req.text();
      if (text.length > 4096) return reply(413, { error: 'Request too large' });
      let body;
      try { body = JSON.parse(text); } catch { return reply(400, { error: 'Invalid JSON' }); }
      if (!body || Array.isArray(body) || typeof body !== 'object') return reply(400, { error: 'Invalid request' });
      let name, params, token;
      if (kind === 'verify') {
        const phone = typeof body.phone === 'string' && body.phone.length <= 32
          ? body.phone.replace(/[\s()+-]/g, '') : '';
        if (!/^(998)?[0-9]{9}$/.test(phone) || typeof body.code !== 'string' || !/^[0-9]{4}$/.test(body.code)
            || (body.team_id != null && (typeof body.team_id !== 'string' || !uuid.test(body.team_id)))) return reply(400, { error: 'Invalid request' });
        // This endpoint now authenticates the captain flow only. Player login
        // remains on the existing backend; invitations are handled separately.
        token = hex(crypto.getRandomValues(new Uint8Array(32)));
        name = 'verify_team_transfer_otp';
        params = { p_phone: phone.slice(-9), p_code: body.code,
          p_token_hash: await tokenHash(token), p_team_id: body.team_id ?? null };
      } else {
        const bearer = req.headers.get('Authorization')?.match(/^Bearer ([0-9a-f]{64})$/i);
        if (!bearer) return reply(401, { error: 'Invalid session' });
        if (kind === 'page') {
          if (!['context', 'players', 'history', 'logout'].includes(body.action)
              || (body.query != null && (typeof body.query !== 'string' || body.query.length > 80))
              || (body.after != null && (typeof body.after !== 'string' || !uuid.test(body.after)))) {
            return reply(400, { error: 'Invalid request' });
          }
          name = 'team_transfer_page';
          params = { p_token_hash: await tokenHash(bearer[1]), p_action: body.action,
            p_query: body.query ?? '', p_after: body.after ?? null };
        } else {
          if (typeof body.player_id !== 'string' || !uuid.test(body.player_id)
              || typeof body.reason !== 'string' || !body.reason.trim() || body.reason.trim().length > 1000
              || (body.new_team_id != null && (typeof body.new_team_id !== 'string' || !uuid.test(body.new_team_id)))) {
            return reply(400, { error: 'Invalid request' });
          }
          name = 'request_team_transfer';
          params = { p_token_hash: await tokenHash(bearer[1]), p_player_id: body.player_id,
            p_reason: body.reason.trim(), p_team_id: body.new_team_id ?? null };
        }
      }
      const { data, error } = await rpc(name, params);
      if (error || !data || ![200, 201, 400, 401, 403, 409, 429].includes(data.status)) {
        return reply(500, { error: 'Request failed. Please retry' });
      }
      const { status, ...result } = data;
      if (token && status === 200) result.sessionToken = token;
      return reply(status, result);
    } catch {
      return reply(500, { error: 'Request failed. Please retry' });
    }
  };
}
