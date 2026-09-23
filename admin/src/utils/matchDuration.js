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

export function getHalfDurationSecs(match, league) {
  return Number(match?.half_duration || league?.half_duration ||
    (match?.match_duration ? Math.round(Number(match.match_duration) / 2) :
      league?.match_duration ? Math.round(Number(league.match_duration) / 2) : 30)) * 60;
}
