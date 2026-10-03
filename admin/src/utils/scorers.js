export const SCORER_STAGES = [
  ['group', 'Guruh bosqichi'], ['round_of_32', '1/16 final'],
  ['round_of_16', '1/8 final'], ['quarterfinal', 'Chorak final'],
  ['semifinal', 'Yarim final'], ['final', 'Final'],
];
export const isPlayerGoal = event => ['goal', 'penalty_goal'].includes(event.event_type);

export function matchesScorerFilter(match, stage = 'all', round = 'all') {
  const matchStage = match.stage || 'group';
  if (stage === 'playoff' && !SCORER_STAGES.slice(1).some(([value]) => value === matchStage)) return false;
  if (stage !== 'all' && stage !== 'playoff' && matchStage !== stage) return false;
  return round === 'all' || String(match.round) === String(round);
}

export function scorerFilterLabel(stage, round) {
  const label = stage === 'playoff' ? 'PLEY-OFF' : SCORER_STAGES.find(([value]) => value === stage)?.[1].toUpperCase();
  return [label, round !== 'all' ? `${round}-TUR` : null].filter(Boolean).join(' · ') || 'BARCHASI';
}

// Recheck competition membership even when the loader supplies scoped matches.
export function calculateScorers(events, matches, stage = 'all', round = 'all', scope) {
  const matchIds = new Set(matches.filter(m => {
    if (scope?.tournament) {
      if (scope.id == null || m.tournament_id == null || String(m.tournament_id) !== String(scope.id)) return false;
    } else if (scope) {
      if (m.tournament_id != null) return false;
      if (m.league && m.league.trim().toLowerCase() !== scope.name?.trim().toLowerCase()) return false;
    }
    return m.status === 'finished' && matchesScorerFilter(m, stage, round);
  }).map(m => String(m.id)));
  const players = new Map();
  const seenEvents = new Set();
  for (const event of events) {
    if (!isPlayerGoal(event) || event.player_id == null || !matchIds.has(String(event.match_id))) continue;
    if (event.id != null) {
      if (seenEvents.has(String(event.id))) continue;
      seenEvents.add(String(event.id));
    }
    const id = String(event.player_id);
    if (!players.has(id)) players.set(id, {
      id, name: [event.player?.first_name, event.player?.last_name].filter(Boolean).join(' ') || "O'yinchi",
      team: event.team?.name || 'Jamoa', avatar: event.player?.photo_url || event.team?.logo_url, goals: 0,
    });
    players.get(id).goals += 1;
  }
  return [...players.values()].sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)).slice(0, 10);
}
