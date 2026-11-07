const REPLAY_DELAY_MS = 25_000;

export function getObsEventDelayMs(eventType, match, league) {
  if (eventType !== 'goal') return REPLAY_DELAY_MS;

  // Follow OBS Controller's replay eligibility for the fixture's competition.
  if (match?.tournament_id) {
    const { tier, description } = match.tournamentReplayMetadata ?? {};
    const replayTier = tier == null || tier === ''
      ? (description ?? '').match(/\[TIER:([12])(?:\||\])/)?.[1]
      : String(tier);
    return replayTier === '1' ? REPLAY_DELAY_MS : 0;
  }

  const isFirstTier = match?.organization_id != null && league?.organization_id != null
    && String(league.organization_id) === String(match.organization_id)
    && league.name === match.league?.trim() && String(league.tier) === '1';
  return isFirstTier ? REPLAY_DELAY_MS : 0;
}
