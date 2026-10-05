import test from 'node:test';
import assert from 'node:assert/strict';
import { notifyTransferStatus } from './transferNotificationService.mjs';

const transfer = {
  player_id: 'player-1', player_name: 'Ali', old_team_id: 'old-1', old_team_name: 'Old',
  new_team_id: 'new-1', new_team_name: 'New',
};

test('terminal transfer status is delivered with player and both teams', async () => {
  let request;
  const result = await notifyTransferStatus(transfer, 'approved', async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ success: true }) };
  });

  assert.match(request.url, /\/api\/notifications\/transfer-status$/);
  assert.equal(request.options.method, 'POST');
  assert.deepEqual(JSON.parse(request.options.body), {
    playerId: 'player-1', playerName: 'Ali', oldTeamId: 'old-1', oldTeamName: 'Old',
    newTeamId: 'new-1', newTeamName: 'New', status: 'approved',
  });
  assert.deepEqual(result, { success: true });
});

test('non-final status is ignored and failed delivery is reported', async () => {
  assert.deepEqual(await notifyTransferStatus(transfer, 'pending', () => assert.fail('must not send')), { skipped: true });
  await assert.rejects(notifyTransferStatus(transfer, 'rejected', async () => ({ ok: false })), /delivery failed/);
});
