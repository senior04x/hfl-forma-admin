import { supabase } from '../supabaseClient';

export const STAGES = [
  { value: 'group', label: 'Guruh bosqichi' },
  { value: 'round_of_32', label: '1/16 Final' },
  { value: 'round_of_16', label: '1/8 Final' },
  { value: 'quarterfinal', label: 'Chorak Final (1/4)' },
  { value: 'semifinal', label: 'Yarim Final (1/2)' },
  { value: 'final', label: 'Final' },
];

export const STAGE_LABELS = {
  group: 'TUR',
  round_of_32: '1/16 FINAL',
  round_of_16: '1/8 FINAL',
  quarterfinal: 'CHORAK FINAL (1/4)',
  semifinal: 'YARIM FINAL',
  final: 'FINAL',
};

/**
 * Stage va round asosida to'liq bosqich sarlavhasini qaytaradi.
 * Masalan: stage='semifinal' bo'lsa "YARIM FINAL", stage='group', round=3 bo'lsa "3-TUR".
 */
export function getStageDisplayTitle(stage, round) {
  if (!stage || stage === 'group') {
    return round ? `${round}-TUR` : 'GURUH BOSQICHI';
  }
  return STAGE_LABELS[stage] || stage.toUpperCase();
}

/**
 * Tashkilotga tegishli barcha faol turnirlarni yuklaydi:
 * 1. O'zi yaratgan turnirlar
 * 2. Qabul qilingan hamkorlik (cohost) turnirlari
 */
export async function getActiveOrgTournaments(orgId) {
  if (!orgId) return [];
  try {
    // 1. O'z turnirlari
    const { data: ownTournaments, error: ownErr } = await supabase
      .from('tournaments')
      .select('*, organization:organization_id (id, name, logo_url)')
      .eq('organization_id', orgId)
      .order('id', { ascending: true });

    if (ownErr) {
      console.warn('Error fetching own tournaments:', ownErr.message);
    }

    // 2. Hamkorlik turnirlari
    const [asReceiver, asSender] = await Promise.all([
      supabase
        .from('tournament_cohosts')
        .select('*, tournament:tournament_id (*), sender_org:sender_org_id (id, name, logo_url), receiver_org:receiver_org_id (id, name, logo_url)')
        .eq('receiver_org_id', orgId)
        .eq('status', 'accepted'),
      supabase
        .from('tournament_cohosts')
        .select('*, tournament:tournament_id (*), sender_org:sender_org_id (id, name, logo_url), receiver_org:receiver_org_id (id, name, logo_url)')
        .eq('sender_org_id', orgId)
        .eq('status', 'accepted')
    ]);

    const collabTournaments = [];
    const processCollab = (c) => {
      if (!c.tournament) return;
      collabTournaments.push({
        ...c.tournament,
        isCollab: true,
        org1: c.sender_org,
        org2: c.receiver_org,
      });
    };

    (asReceiver.data || []).forEach(processCollab);
    (asSender.data || []).forEach(processCollab);

    const map = new Map();
    (ownTournaments || []).forEach(t => map.set(t.id, { ...t, isOwn: true }));
    collabTournaments.forEach(t => {
      if (!map.has(t.id)) {
        map.set(t.id, { ...t, isOwn: false });
      }
    });

    return Array.from(map.values());
  } catch (err) {
    console.error('Error fetching org tournaments:', err);
    return [];
  }
}

/**
 * Turnirga biriktirilgan ligalarni yuklaydi
 */
export async function getTournamentLeagues(tournamentId) {
  if (!tournamentId) return [];
  try {
    const { data, error } = await supabase
      .from('tournament_leagues')
      .select('*, league:league_id (*)')
      .eq('tournament_id', tournamentId);

    if (error) {
      console.warn('Error fetching tournament leagues:', error.message);
      return [];
    }

    return (data || []).map(item => item.league).filter(Boolean);
  } catch (err) {
    console.error('Error fetching tournament leagues:', err);
    return [];
  }
}

/**
 * Turnirga biriktirilgan ligalardan jamoalarni teams.league matn maydoni orqali aniqlaydi.
 * teams.league = "LigaA, LigaB" kabi vergul bilan ajratilgan matn.
 * Har qanday jamoa takrorlanmasligi ta'minlanadi.
 */
export function getTournamentTeams(tournamentLeagues, allTeams = []) {
  if (!tournamentLeagues || tournamentLeagues.length === 0 || !allTeams || allTeams.length === 0) {
    return [];
  }

  const leagueNames = tournamentLeagues
    .map(l => (typeof l === 'string' ? l : l.name))
    .filter(Boolean)
    .map(name => name.trim().toLowerCase());

  const matchingTeamsMap = new Map();

  allTeams.forEach(team => {
    if (!team.league) return;
    const teamLeagues = team.league
      .split(',')
      .map(item => item.trim().toLowerCase());

    const isMatch = teamLeagues.some(tl => leagueNames.includes(tl));
    if (isMatch && !matchingTeamsMap.has(team.id)) {
      matchingTeamsMap.set(team.id, team);
    }
  });

  return Array.from(matchingTeamsMap.values());
}

export const DEFAULT_TOURNAMENT_COLORS = [
  { label: 'Moviy (Sky Blue)', hex: '#38bdf8' },
  { label: 'Oltin (Gold)', hex: '#f59e0b' },
  { label: 'Pushti (Pink)', hex: '#ec4899' },
  { label: 'Binafsha (Purple)', hex: '#8b5cf6' },
  { label: 'Zumrad (Emerald)', hex: '#10b981' },
  { label: 'Qizil (Crimson)', hex: '#ef4444' },
  { label: 'Turkuaz (Cyan)', hex: '#06b6d4' },
  { label: 'To\'q sariq (Orange)', hex: '#f97316' },
  { label: 'Kumush (Silver)', hex: '#94a3b8' },
];

export function parseTournamentTier(t) {
  let tier = t?.tier ? Number(t.tier) : 1;
  let parentId = t?.parent_tournament_id ? Number(t.parent_tournament_id) : null;
  let color = t?.color || null;
  let cleanDesc = t?.description || '';

  if (cleanDesc && cleanDesc.includes('[TIER:')) {
    const tierMatch = cleanDesc.match(/TIER:(\d+)/);
    if (tierMatch && !t?.tier) tier = Number(tierMatch[1]) || 1;

    const parentMatch = cleanDesc.match(/PARENT:([^|\]]*)/);
    if (parentMatch && parentMatch[1] && parentMatch[1] !== 'null' && parentMatch[1].trim() !== '' && !t?.parent_tournament_id) {
      parentId = Number(parentMatch[1]);
    }

    const colorMatch = cleanDesc.match(/COLOR:([^|\]]*)/);
    if (colorMatch && colorMatch[1] && colorMatch[1] !== 'null' && colorMatch[1].trim() !== '') {
      color = colorMatch[1].trim();
    }

    cleanDesc = cleanDesc.replace(/\[TIER:[^\]]*\]\s*/g, '').trim();
  }

  if (!color || color === 'null') {
    color = tier === 2 ? '#38bdf8' : '#22c55e';
  }

  return { tier, parentId, color, cleanDescription: cleanDesc };
}

export function formatTournamentDescription(tier, parentId, userDesc, color) {
  const meta = `[TIER:${tier}|PARENT:${parentId || ''}|COLOR:${color || '#38bdf8'}]`;
  const trimmed = (userDesc || '').trim();
  return trimmed ? `${meta}\n${trimmed}` : meta;
}
