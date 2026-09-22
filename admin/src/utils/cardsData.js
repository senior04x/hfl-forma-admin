export const CARD_PAGE_SIZE = 25;
const EVENT_BATCH_SIZE = 200;

export function filterCardMatches(query, scope, prefix = 'match.') {
  const { orgId, competition, mode, round } = scope;
  if (!orgId || !competition) throw new Error('Missing card competition');
  const orgIds = [...new Set([orgId, competition.organization_id,
    competition.org1?.id, competition.org2?.id].filter(Boolean))];
  query = query.in(`${prefix}organization_id`, orgIds);
  query = mode === 'tournament'
    ? query.eq(`${prefix}tournament_id`, competition.id)
    : query.is(`${prefix}tournament_id`, null).eq(`${prefix}league`, competition.name);
  if (round && round !== 'all') query = query.eq(`${prefix}round`, round);
  return query;
}

// Page players first. Only their cards are fetched, so totals never depend on an
// arbitrary event page boundary or the API's default row cap.
export async function loadCardPage(client, scope, page, search = '', signal) {
  const teamSearch = search.trim()
    ? ', teamSearch:match_events!player_id(id, match:matches!match_id!inner(id), team:teams!team_id!inner(id))'
    : '';
  let query = client.from('applications')
    .select(`id, first_name, last_name, player_number, photo_url,
      cards:match_events!player_id!inner(id, match:matches!match_id!inner(id))${teamSearch}`)
    .in('cards.event_type', ['yellow_card', 'red_card']);
  query = filterCardMatches(query, scope, 'cards.match.');
  if (teamSearch) {
    query = filterCardMatches(query, scope, 'teamSearch.match.')
      .in('teamSearch.event_type', ['yellow_card', 'red_card'])
      .ilike('teamSearch.team.name', `%${search.trim().replace(/[%_*]/g, '')}%`)
      .limit(1, { referencedTable: 'teamSearch' });
  }
  // Quoted PostgREST literals keep punctuation from becoming filter syntax.
  for (const term of search.trim().split(/\s+/).filter(Boolean)) {
    const pattern = JSON.stringify(`%${term.replace(/[%_*]/g, '')}%`);
    const filters = [`first_name.ilike.${pattern}`, `last_name.ilike.${pattern}`, 'teamSearch.not.is.null'];
    if (/^\d{1,3}$/.test(term.replace(/^#/, ''))) {
      filters.push(`player_number.eq.${Number(term.replace(/^#/, ''))}`);
    }
    query = query.or(filters.join(','));
  }
  const start = page * CARD_PAGE_SIZE;
  const { data, error } = await query
    .order('last_name').order('first_name').order('id')
    .limit(1, { referencedTable: 'cards' })
    .range(start, start + CARD_PAGE_SIZE).abortSignal(signal);
  if (error) throw error;
  const applications = (data || []).slice(0, CARD_PAGE_SIZE);
  if (!applications.length) return { players: [], events: [], hasNext: false };

  const events = [];
  for (let offset = 0; ; offset += EVENT_BATCH_SIZE) {
    let eventQuery = client.from('match_events')
      .select(`id, event_type, player_id, team_id, match_id, minute,
        team:team_id(id, name, logo_url),
        match:matches!match_id!inner(id, round, league, tournament_id, match_date, match_time,
          home_score, away_score, home_team:home_team_id(name, logo_url),
          away_team:away_team_id(name, logo_url))`)
      .in('player_id', applications.map(player => player.id))
      .in('event_type', ['yellow_card', 'red_card']);
    eventQuery = filterCardMatches(eventQuery, scope);
    const result = await eventQuery.order('id')
      .range(offset, offset + EVENT_BATCH_SIZE - 1).abortSignal(signal);
    if (result.error) throw result.error;
    events.push(...(result.data || []));
    if ((result.data || []).length < EVENT_BATCH_SIZE) break;
  }
  const players = applications.map(player => {
    const cards = events.filter(event => event.player_id === player.id);
    const teams = [...new Map(cards.filter(event => event.team)
      .map(event => [event.team.id, event.team])).values()];
    const yellowCards = cards.filter(event => event.event_type === 'yellow_card').length;
    const redCards = cards.filter(event => event.event_type === 'red_card').length;
    return {
      id: player.id,
      name: `${player.first_name || ''} ${player.last_name || ''}`.trim() || "Noma'lum o'yinchi",
      photoUrl: player.photo_url,
      playerNumber: player.player_number == null ? '' : `#${player.player_number}`,
      teamName: teams.map(team => team.name).join(', ') || "Noma'lum jamoa",
      teamLogo: teams.length === 1 ? teams[0].logo_url : '',
      yellowCards, redCards, totalCards: yellowCards + redCards,
    };
  });
  return { players, events, hasNext: (data || []).length > CARD_PAGE_SIZE };
}
