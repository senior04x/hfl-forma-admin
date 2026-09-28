const ENDPOINT = 'https://xzzyhfyazwohdqqbjiiy.supabase.co/functions/v1/';
const AUTH_ENDPOINT = 'https://web-production-eaa31.up.railway.app/api/auth/request-otp';
const SESSION_KEY = 'amatora_captain_session';
export class TransferError extends Error {
    constructor(status, data = {}) { super('Transfer request failed'); this.status = status; this.data = data; }
}
export function createTransferApi(fetcher = fetch, clock = Date.now) {
    let session = readSession();
    let generation = 0;
    function readSession() {
        try {
            const value = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
            if (/^[0-9a-f]{64}$/.test(value?.token || '') && Number.isFinite(value?.expires) && value.expires > clock()) return value;
        } catch { /* Invalid browser data is treated as logged out. */ }
        sessionStorage.removeItem(SESSION_KEY);
        return null;
    }
    function saveSession(value) {
        session = value;
        if (value) sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
        else sessionStorage.removeItem(SESSION_KEY);
    }
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
            saveSession(null); throw new TransferError(401);
        }
        return session;
    }
    async function authorized(name, body, signal) {
        const active = current();
        try { return await post(name, body, active.token, signal); }
        catch (error) { if (error.status === 401 && session === active) saveSession(null); throw error; }
    }
    return {
        async requestCode(phone) {
            let response;
            try {
                response = await fetcher(AUTH_ENDPOINT, {method:'POST',headers:{'Content-Type':'application/json'},
                    body:JSON.stringify({phone}),cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(20000)});
            } catch { throw new TransferError(0); }
            let data;
            try { data=await response.json(); } catch { throw new TransferError(502); }
            if (!response.ok) throw new TransferError(response.status,data);
            if (!data.success) throw new TransferError(404,data);
            return data;
        },
        async login(phone, code, teamId) {
            const attempt = ++generation;
            saveSession(null);
            const data = await post('verify-otp', {phone, code, ...(teamId ? {team_id: teamId} : {})});
            if (attempt !== generation) throw new DOMException('Cancelled', 'AbortError');
            const expires = Date.parse(data.expiresAt);
            if (!/^[0-9a-f]{64}$/.test(data.sessionToken || '') || !data.team?.id || !Number.isFinite(expires) || expires <= clock()) throw new TransferError(502);
            saveSession({token: data.sessionToken, expires, teamId: data.team.id});
            return {team: data.team, expires};
        },
        hasSession() { try { current(); return true; } catch { return false; } },
        page(action, {query = '', after = null, teamId = null, signal} = {}) {
            return authorized('team-transfer-page', {action, query, after, team_id: teamId}, signal);
        },
        request(playerId, reason) { return authorized('request-transfer', {player_id: playerId, reason: reason.trim()}); },
        async logout() {
            generation++;
            const active = session; saveSession(null);
            if (active) await post('team-transfer-page', {action: 'logout'}, active.token);
        },
        clear() { generation++; saveSession(null); }
    };
}
