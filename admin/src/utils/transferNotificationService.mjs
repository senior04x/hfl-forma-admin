const TRANSFER_STATUS_ENDPOINT = 'https://web-production-eaa31.up.railway.app/api/notifications/transfer-status';

export async function notifyTransferStatus(transfer, status, fetchImpl = globalThis.fetch) {
  if (!['approved', 'rejected'].includes(status)) return { skipped: true };

  const response = await fetchImpl(TRANSFER_STATUS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      playerId: transfer.player_id,
      playerName: transfer.player_name || 'Futbolchi',
      oldTeamId: transfer.old_team_id,
      newTeamId: transfer.new_team_id,
      oldTeamName: transfer.old_team_name,
      newTeamName: transfer.new_team_name,
      status,
    }),
  });

  if (!response.ok) throw new Error('Transfer notification delivery failed');
  return response.json();
}
