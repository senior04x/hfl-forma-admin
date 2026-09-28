import { supabase } from '../supabaseClient';

const TEAM_COLUMNS = 'id, name, logo_url, league, status, penalty_points, organization_id, is_archived';
const MATCH_COLUMNS = 'id, home_team_id, away_team_id, home_score, away_score, status, round, match_date, tournament_id, league, organization_id';

async function pages(query, signal) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    signal.throwIfAborted();
    const { data, error } = await query().order('id', { ascending: true }).range(offset, offset + 499).abortSignal(signal);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 500) return rows;
  }
}

async function batches(ids, query, signal) {
  const rows = [];
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < uniqueIds.length; i += 100) {
    rows.push(...await pages(() => query(uniqueIds.slice(i, i + 100)), signal));
  }
  return rows;
}

export async function loadStandingsData({ orgId, competition, tournament, signal, onCore }) {
  let leagues = [competition];
  let matches = [];
  if (tournament) {
    const linkedLeagues = async id => {
      const { data, error } = await supabase.from('tournament_leagues')
        .select('league:league_id(id, name, organization_id)').eq('tournament_id', id).abortSignal(signal);
      if (error) throw error;
      return (data || []).map(row => row.league).filter(Boolean);
    };
    [leagues, matches] = await Promise.all([
      linkedLeagues(competition.id),
      pages(() => supabase.from('matches').select(MATCH_COLUMNS).eq('status', 'finished').eq('tournament_id', competition.id), signal),
    ]);
    const parentId = competition.description?.match(/PARENT:(\d+)/)?.[1];
    if (!leagues.length && parentId) leagues = await linkedLeagues(parentId);
  }

  const teamMap = new Map();
  // A team's league field is a comma-separated list. Filter candidates on the
  // server, then check exact membership to exclude similarly named leagues.
  for (const league of leagues) {
    const name = league.name || '';
    const escaped = name.replace(/[\\%_]/g, char => `\\${char}`);
    const rows = await pages(() => {
      let query = supabase.from('teams').select(TEAM_COLUMNS)
        .in('status', ['approved', 'partially_approved']).ilike('league', `%${escaped}%`);
      if (!competition.isCollab) query = query.eq('organization_id', orgId);
      return query;
    }, signal);
    rows.filter(t => (t.league || '').split(',').some(value => value.trim().toLowerCase() === name.trim().toLowerCase()))
      .forEach(t => teamMap.set(t.id, t));
  }

  if (tournament) {
    const missingIds = matches.flatMap(m => [m.home_team_id, m.away_team_id]).filter(id => !teamMap.has(id));
    const participants = await batches(missingIds, ids => supabase.from('teams').select(TEAM_COLUMNS)
      .in('status', ['approved', 'partially_approved']).in('id', ids), signal);
    participants.forEach(t => teamMap.set(t.id, t));
  } else {
    matches = await batches([...teamMap.keys()], ids => {
      let query = supabase.from('matches').select(MATCH_COLUMNS).eq('status', 'finished')
        .is('tournament_id', null).in('home_team_id', ids);
      if (!competition.isCollab) query = query.eq('organization_id', orgId);
      return query;
    }, signal);
  }
  matches.sort((a, b) => String(b.match_date || '').localeCompare(String(a.match_date || '')));
  signal.throwIfAborted();
  onCore({ teams: [...teamMap.values()], matches, leagues: tournament ? leagues : [] });
  // Only these finished matches are relevant; never fetch a team's full history.
  return batches(matches.map(m => m.id), ids => supabase.from('match_events')
    .select('id, event_type, player_id, team_id, match_id, player:player_id(first_name, last_name, photo_url), team:team_id(name, logo_url, league)')
    .in('match_id', ids).in('event_type', ['goal', 'assist', 'yellow_card', 'red_card']), signal);
}
