import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createTransferHandler } from '../_shared/team-transfer-http.mjs';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const normalizePhone = (value: string) => value.replace(/\D/g, '').slice(-9);

async function callAuth(name: string, params: Record<string, unknown>) {
  if (name !== 'create_test_team_session') return admin.rpc(name, params);
  const phone = String(params.p_phone || '');
  const requestedTeam = params.p_team_id ? String(params.p_team_id) : null;
  let query = admin.from('teams').select('id,name,organization_id,captain_phone').ilike('captain_phone', `%${phone}%`).limit(50);
  if (requestedTeam) query = query.eq('id', requestedTeam);
  const { data: rows, error } = await query;
  if (error) return { data: null, error };
  const teams = (rows || []).filter((team) => normalizePhone(team.captain_phone || '') === phone);
  if (!teams.length) return { data: { status: 403, error: 'Captain account required' }, error: null };
  if (!requestedTeam && teams.length > 1) {
    return { data: { status: 409, error: 'Select your captain team', teams: teams.map(({ id, name }) => ({ id, name })) }, error: null };
  }
  const team = teams[0];
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const insert = await admin.from('team_sessions').insert({
    token: params.p_token_hash, phone, team_id: team.id, expires_at: expiresAt,
  });
  if (insert.error) return { data: null, error: insert.error };
  return { data: { status: 200, success: true, role: 'captain', expiresAt,
    canRequestTransfers: true, team: { id: team.id, name: team.name, organization_id: team.organization_id } }, error: null };
}

Deno.serve(createTransferHandler('verify', callAuth, {
  testPhone: normalizePhone(Deno.env.get('TEST_LOGIN_PHONE') || ''),
  testCode: Deno.env.get('TEST_LOGIN_CODE') || '',
}));
