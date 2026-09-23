export async function loadLeagueDuration(supabase, league) {
  if (!league) return null;
  let half = league.half_duration || league.half_minutes;
  let full = league.match_duration;
  if (!half && full) half = Math.round(full / 2);
  else if (half && !full) full = half * 2;
  if (!full && league.id) {
    const { data } = await supabase.from('sponsors').select('logo_url')
      .eq('name', `LEAGUE_DURATION_${league.id}`).maybeSingle();
    if (data?.logo_url) {
      full = Number(data.logo_url);
      half = Math.round(full / 2);
    }
  }
  if (!full && league.id) {
    try {
      const saved = localStorage.getItem(`hfl_league_duration_${league.id}`);
      if (saved) {
        full = Number(saved);
        half = Math.round(full / 2);
      }
    } catch { /* Storage may be unavailable in OBS. */ }
  }
  return { ...league, half_duration: half || 30, match_duration: full || ((half || 30) * 2) };
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
