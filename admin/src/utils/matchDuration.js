export async function loadLeagueDuration(supabase, league) {
  if (!league) return null;
  let half = league.half_duration || league.half_minutes;
  let full = league.match_duration;
  if (!half && full) half = Math.round(full / 2);
  else if (half && !full) full = half * 2;
  if (!full && league.id) {
    const { data } = await supabase.from('sponsors').select('logo_url')
      .eq('name', `LEAGUE_DURATION_${league.id}`).maybeSingle();
    const savedDuration = Number(data?.logo_url);
    if (Number.isFinite(savedDuration) && savedDuration > 0) {
      full = savedDuration;
      half = Math.round(full / 2);
    }
  }
  return { ...league, half_duration: half || 30, match_duration: full || ((half || 30) * 2) };
}

export async function loadMatchLeague(supabase, match) {
  const leagueName = match?.league?.trim();
  if (!leagueName) return null;
  const namePattern = leagueName.replace(/[\\%_]/g, '\\$&');
  const orgId = match.organization_id;
  let query = supabase.from('leagues').select('*').ilike('name', namePattern);
  if (orgId != null) query = query.eq('organization_id', orgId);
  const { data: league, error } = await query.maybeSingle();
  if (error || league || orgId == null) return loadLeagueDuration(supabase, league);

  const { data: collaborations } = await supabase.from('league_collabs')
    .select('league:league_id!inner(*)')
    .eq('status', 'accepted')
    .or(`sender_org_id.eq.${orgId},receiver_org_id.eq.${orgId}`)
    .ilike('league.name', namePattern);
  const sharedLeagues = new Map((collaborations ?? []).filter(row => row.league).map(({ league }) => [league.id, league]));
  if (sharedLeagues.size !== 1) return null;
  return loadLeagueDuration(supabase, sharedLeagues.values().next().value);
}

export async function loadTournamentDuration(supabase, match) {
  if (!match?.tournament_id) return match;
  const { data, error } = await supabase.from('tournaments').select('match_duration')
    .eq('id', match.tournament_id).maybeSingle();
  if (error) throw error;
  const duration = Number(data?.match_duration);
  if (!Number.isFinite(duration) || duration <= 0) return match;
  return { ...match, tournamentDuration: duration };
}

export function getHalfDurationSecs(match, league) {
  return Number((match?.tournamentDuration ? Math.round(match.tournamentDuration / 2) : null) || match?.half_duration ||
    (match?.match_duration ? Math.round(Number(match.match_duration) / 2) : null) ||
    league?.half_duration ||
    (league?.match_duration ? Math.round(Number(league.match_duration) / 2) : 30)) * 60;
}
