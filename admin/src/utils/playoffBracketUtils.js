const resolveWinner = (m) => {
  if (!m) return { winnerId: null, loserId: null, isFinished: false };
  const isFinished = m.status === 'finished' || (m.home_score !== null && m.away_score !== null && m.home_score !== undefined && m.away_score !== undefined);
  if (!isFinished) return { winnerId: null, loserId: null, isFinished: false };

  const hScore = Number(m.home_score || 0);
  const aScore = Number(m.away_score || 0);

  if (hScore > aScore) {
    return { winnerId: m.home_team_id, loserId: m.away_team_id, isFinished: true };
  } else if (aScore > hScore) {
    return { winnerId: m.away_team_id, loserId: m.home_team_id, isFinished: true };
  } else {
    const hPen = Number(m.home_penalty_score || 0);
    const aPen = Number(m.away_penalty_score || 0);
    if (hPen > aPen) {
      return { winnerId: m.home_team_id, loserId: m.away_team_id, isFinished: true };
    } else if (aPen > hPen) {
      return { winnerId: m.away_team_id, loserId: m.home_team_id, isFinished: true };
    }
    return { winnerId: null, loserId: null, isFinished: true };
  }
};

const makeSlotTeam = (teamObj, score, penScore, isWinner, isLoser) => {
  if (!teamObj) return null;
  return {
    id: teamObj.id,
    name: teamObj.name || 'Jamoa',
    logo_url: teamObj.logo_url || null,
    score: score !== undefined ? score : null,
    penalty_score: penScore !== undefined ? penScore : null,
    isWinner: !!isWinner,
    isLoser: !!isLoser,
  };
};

/**
 * Builds standard 8-team Playoff Bracket (1/4 -> 1/2 -> Final)
 */
export const buildPlayoffBracket = (matches = [], teams = []) => {
  const teamMap = new Map();
  teams.forEach((t) => teamMap.set(String(t.id), t));

  const qfMatches = matches.filter((m) => m.stage === 'quarterfinal');
  const sfMatches = matches.filter((m) => m.stage === 'semifinal');
  const finalMatches = matches.filter((m) => m.stage === 'final');

  const hasPlayoffMatches = qfMatches.length > 0 || sfMatches.length > 0 || finalMatches.length > 0;

  const parseMatch = (raw, expectedStage = 'quarterfinal') => {
    if (!raw) {
      return {
        stage: expectedStage,
        status: 'pending',
        team1: null,
        team2: null,
      };
    }

    const { winnerId, loserId, isFinished } = resolveWinner(raw);
    const homeTeam = teamMap.get(String(raw.home_team_id)) || raw.home_team || raw.home_team_data || { id: raw.home_team_id, name: 'Jamoa 1' };
    const awayTeam = teamMap.get(String(raw.away_team_id)) || raw.away_team || raw.away_team_data || { id: raw.away_team_id, name: 'Jamoa 2' };

    const t1 = raw.home_team_id ? makeSlotTeam(
      homeTeam,
      raw.home_score,
      raw.home_penalty_score,
      isFinished && winnerId && String(winnerId) === String(raw.home_team_id),
      isFinished && loserId && String(loserId) === String(raw.home_team_id)
    ) : null;

    const t2 = raw.away_team_id ? makeSlotTeam(
      awayTeam,
      raw.away_score,
      raw.away_penalty_score,
      isFinished && winnerId && String(winnerId) === String(raw.away_team_id),
      isFinished && loserId && String(loserId) === String(raw.away_team_id)
    ) : null;

    return {
      id: raw.id,
      stage: expectedStage,
      match_date: raw.match_date,
      match_time: raw.match_time,
      location: raw.location,
      status: isFinished ? 'finished' : (raw.status || 'scheduled'),
      team1: t1,
      team2: t2,
      winnerTeamId: winnerId,
    };
  };

  const qf = [
    parseMatch(qfMatches[0], 'quarterfinal'),
    parseMatch(qfMatches[1], 'quarterfinal'),
    parseMatch(qfMatches[2], 'quarterfinal'),
    parseMatch(qfMatches[3], 'quarterfinal'),
  ];

  let sf1 = parseMatch(sfMatches[0], 'semifinal');
  let sf2 = parseMatch(sfMatches[1], 'semifinal');

  if (!sf1.team1 && qf[0].winnerTeamId) {
    const winnerObj = teamMap.get(String(qf[0].winnerTeamId));
    if (winnerObj) sf1.team1 = makeSlotTeam(winnerObj);
  }
  if (!sf1.team2 && qf[1].winnerTeamId) {
    const winnerObj = teamMap.get(String(qf[1].winnerTeamId));
    if (winnerObj) sf1.team2 = makeSlotTeam(winnerObj);
  }
  if (!sf2.team1 && qf[2].winnerTeamId) {
    const winnerObj = teamMap.get(String(qf[2].winnerTeamId));
    if (winnerObj) sf2.team1 = makeSlotTeam(winnerObj);
  }
  if (!sf2.team2 && qf[3].winnerTeamId) {
    const winnerObj = teamMap.get(String(qf[3].winnerTeamId));
    if (winnerObj) sf2.team2 = makeSlotTeam(winnerObj);
  }

  let finalMatch = parseMatch(finalMatches[0], 'final');

  if (!finalMatch.team1 && sf1.winnerTeamId) {
    const winnerObj = teamMap.get(String(sf1.winnerTeamId));
    if (winnerObj) finalMatch.team1 = makeSlotTeam(winnerObj);
  }
  if (!finalMatch.team2 && sf2.winnerTeamId) {
    const winnerObj = teamMap.get(String(sf2.winnerTeamId));
    if (winnerObj) finalMatch.team2 = makeSlotTeam(winnerObj);
  }

  let champion = null;
  if (finalMatch.winnerTeamId) {
    const champObj = teamMap.get(String(finalMatch.winnerTeamId));
    if (champObj) {
      champion = makeSlotTeam(champObj, null, null, true, false);
    }
  }

  return {
    qf,
    sf: [sf1, sf2],
    final: finalMatch,
    champion,
    hasPlayoffMatches,
  };
};

export const getLinkedTournamentTeams = (parentStandings = [], fromRank = 9, toRank = 16) => {
  if (!parentStandings || parentStandings.length === 0) return [];
  return parentStandings.slice(fromRank - 1, toRank);
};
