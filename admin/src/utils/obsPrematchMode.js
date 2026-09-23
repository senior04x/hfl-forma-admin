export async function savePrematchMode(db, matchId, compact) {
  const { data, error } = await db.from('matches')
    .update({ obs_prematch_compact: compact === true })
    .eq('id', matchId).eq('status', 'scheduled')
    .select('id, obs_prematch_compact').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('O‘yin boshlangan yoki o‘zgartirishga ruxsat yo‘q. Sahifani yangilang.');
  return data;
}
