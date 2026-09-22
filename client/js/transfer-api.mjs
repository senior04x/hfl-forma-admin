const ENDPOINT = 'https://xzzyhfyazwohdqqbjiiy.supabase.co/functions/v1/';
export class TransferError extends Error {
    constructor(status, data = {}) { super('Transfer request failed'); this.status = status; this.data = data; }
}
// Tokens live only in this closure: no URLs, logs, DOM or browser storage.
export function createTransferApi(fetcher = fetch, clock = Date.now) {
    let session = null;
    let generation = 0;
    async function post(name, body, token, signal) {
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;
        let response;
        try { response = await fetcher(ENDPOINT + name, { method: 'POST', headers,
            body: JSON.stringify(body), cache: 'no-store', credentials: 'omit',
            signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) }); }
        catch (error) { if (error.name === 'AbortError') throw error; throw new TransferError(0); }
        let data;
        try { data = await response.json(); } catch { throw new TransferError(502); }
        if (!response.ok) throw new TransferError(response.status, data);
        return data;
    }
    function current() {
        if (!session || !Number.isFinite(session.expires) || session.expires <= clock()) {
            session = null; throw new TransferError(401);
        }
        return session;
    }
    async function authorized(name, body, signal) {
        const active = current();
        try { return await post(name, body, active.token, signal); }
        catch (error) { if (error.status === 401 && session === active) session = null; throw error; }
    }
    return {
        async login(phone, code, teamId) {
            const attempt = ++generation;
            session = null;
            const data = await post('verify-otp', {phone, code, ...(teamId ? {team_id: teamId} : {})});
            if (attempt !== generation) throw new DOMException('Cancelled', 'AbortError');
            const expires = Date.parse(data.expiresAt);
            if (!/^[0-9a-f]{64}$/.test(data.sessionToken || '') || !data.team?.id || !Number.isFinite(expires) || expires <= clock()) throw new TransferError(502);
            session = {token: data.sessionToken, expires};
            return {team: data.team, expires};
        },
        page(action, {query = '', after = null, signal} = {}) {
            return authorized('team-transfer-page', {action, query, after}, signal);
        },
        request(playerId, reason) { return authorized('request-transfer', {player_id: playerId, reason: reason.trim()}); },
        async logout() {
            generation++;
            const active = session; session = null;
            if (active) await post('team-transfer-page', {action: 'logout'}, active.token);
        },
        clear() { generation++; session = null; }
    };
}
