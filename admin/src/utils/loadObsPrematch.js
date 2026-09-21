import { supabase } from '../supabaseClient';
import { parseTournamentTier, getTournamentTeams } from './tournamentUtils';
import { calculateTable, readPages } from './obsPrematch';

export async function loadObsPrematch(match, onBrand = () => {}) {
  const tournamentId = match.tournament_id;
  let tournament = null;
  let linkedLeagues = [];
  if (tournamentId) {
    const { data, error } = await supabase.from('tournaments')
      .select('id, name, logo_url, description').eq('id', tournamentId).maybeSingle();
    if (error) throw error;
    tournament = data;
    onBrand({ tournament });
    const getLinks = id => readPages(() => supabase.from('tournament_leagues')
      .select('id, league:league_id(name)').eq('tournament_id', id).order('id'));
    let links = await getLinks(tournamentId);
    const parent = parseTournamentTier(tournament).parentId;
    if (!links.length && parent) links = await getLinks(parent);
    linkedLeagues = links.map(l => l.league).filter(Boolean);
  }
  const scopeMatches = query => tournamentId ? query.eq('tournament_id', tournamentId)
    : query.eq('organization_id', match.organization_id).eq('league', match.league).is('tournament_id', null);
  const [fixtures, teams, settings] = await Promise.all([
    readPages(() => scopeMatches(supabase.from('matches').select('id, home_team_id, away_team_id, home_score, away_score, status, match_date, match_time')).order('id')),
    readPages(() => supabase.from('teams').select('id, name, league, penalty_points, is_archived')
      .eq('organization_id', match.organization_id).in('status', ['approved', 'partially_approved']).order('id')),
    readPages(() => supabase.from('sponsors').select('id, name, logo_url')
      .eq('organization_id', match.organization_id).like('name', 'STANDINGS_OVERRIDE_%').order('id')),
  ]);
  const participantIds = new Set(fixtures.flatMap(m => [String(m.home_team_id), String(m.away_team_id)]));
  const linkedIds = new Set(getTournamentTeams(linkedLeagues, teams).map(t => String(t.id)));
  const participants = teams.filter(t => tournamentId
    ? participantIds.has(String(t.id)) || linkedIds.has(String(t.id))
    : (t.league || 'Super liga').split(',').map(s => s.trim()).includes(match.league));
  // Include participating cohost teams without reading another organization's full roster.
  const missingIds = [...participantIds].filter(id => !teams.some(t => String(t.id) === id) && id !== 'null');
  for (let i = 0; i < missingIds.length; i += 100) {
    participants.push(...await readPages(() => supabase.from('teams')
      .select('id, name, league, penalty_points, is_archived').in('id', missingIds.slice(i, i + 100))
      .in('status', ['approved', 'partially_approved']).order('id')));
  }
  const overrides = {};
  for (const setting of settings) {
    try { overrides[setting.name.replace('STANDINGS_OVERRIDE_', '')] = JSON.parse(setting.logo_url); } catch { /* Ignore malformed saved settings. */ }
  }
  const table = calculateTable(participants, fixtures, overrides, tournamentId);
  const finishedIds = fixtures.filter(m => m.status === 'finished').map(m => m.id);
  const scorers = new Map();
  for (let i = 0; i < finishedIds.length; i += 100) {
    const goals = await readPages(() => supabase.from('match_events')
      .select('id, player_id, team_id, player:player_id(first_name, last_name, photo_url)')
      .eq('event_type', 'goal').in('team_id', [match.home_team_id, match.away_team_id].filter(Boolean))
      .in('match_id', finishedIds.slice(i, i + 100)).order('id'));
    for (const goal of goals) {
      if (!goal.player_id || !goal.player) continue;
      const key = `${goal.team_id}:${goal.player_id}`;
      const player = scorers.get(key) || {
        id: goal.player_id, teamId: goal.team_id, goals: 0,
        name: [goal.player.first_name, goal.player.last_name].filter(Boolean).join(' '),
        photo: goal.player.photo_url,
      };
      player.goals++;
      scorers.set(key, player);
    }
  }
  const side = id => ({
    standing: table.find(t => String(t.id) === String(id)),
    scorer: [...scorers.values()].filter(p => String(p.teamId) === String(id))
      .sort((a, b) => b.goals - a.goals || String(a.id).localeCompare(String(b.id)))[0],
  });
  return { tournament, home: side(match.home_team_id), away: side(match.away_team_id) };
}
