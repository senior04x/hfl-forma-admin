export const LIVE_STATUSES = ['first_half', 'second_half', 'half_time', 'break', 'extra_time', 'live', 'penalties'];

export function selectStreamMatch(matches) {
  const live = matches.filter(m => LIVE_STATUSES.includes(m.status))
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  if (live.length) return live[0];
  // Fixture dates are stored in the organization's Uzbekistan local time.
  // Skip postponed matches (is_postponed === true) when selecting next scheduled match.
  return matches.filter(m => m.status === 'scheduled' && m.match_date && m.match_time && m.is_postponed !== true)
    .map(m => ({ match: m, time: Date.parse(`${m.match_date}T${m.match_time}+05:00`) }))
    // Keep delayed fixtures until their status changes or they are postponed.
    .filter(m => Number.isFinite(m.time))
    .sort((a, b) => a.time - b.time || String(a.match.id).localeCompare(String(b.match.id)))[0]?.match || null;
}

// Stable, bounded pages: never silently calculate a table from Supabase's first 1000 rows.
export async function readPages(makeQuery) {
  const rows = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await makeQuery().range(start, start + 499);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 500) return rows;
  }
}

export function calculateTable(teams, matches, overrides, tournamentId) {
  const table = new Map(teams.filter(t => !t.is_archived).map(t => [String(t.id), {
    ...t, played: 0, won: 0, gf: 0, ga: 0, points: 0, form: [],
  }]));
  [...matches].filter(m => m.status === 'finished')
    .sort((a, b) => `${a.match_date || ''} ${a.match_time || ''}`.localeCompare(`${b.match_date || ''} ${b.match_time || ''}`))
    .forEach(m => {
      for (const [id, scored, conceded] of [[m.home_team_id, m.home_score, m.away_score], [m.away_team_id, m.away_score, m.home_score]]) {
        const row = table.get(String(id));
        if (!row) continue;
        const gf = Number(scored || 0), ga = Number(conceded || 0);
        row.played++; row.gf += gf; row.ga += ga;
        row.won += gf > ga ? 1 : 0;
        row.points += gf > ga ? 3 : gf === ga ? 1 : 0;
        row.form.push(gf > ga ? 'G' : gf === ga ? 'D' : 'M');
      }
    });
  return [...table.values()].map(row => {
    const key = tournamentId ? `TOURN_${tournamentId}_${row.id}` : row.id;
    const o = overrides[key] || {};
    row.points += Number(o.pts_offset || (!tournamentId ? row.penalty_points || 0 : 0));
    for (const field of ['played', 'won', 'gf', 'ga']) row[field] = Math.max(0, row[field] + Number(o[`${field}_offset`] || 0));
    row.gd = row.gf - row.ga;
    row.form = row.form.slice(-5);
    return row;
  }).sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf || b.won - a.won)
    .map((row, index) => ({ ...row, position: index + 1 }));
}
