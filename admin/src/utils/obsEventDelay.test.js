import test from 'node:test';
import assert from 'node:assert/strict';
import { getObsEventDelayMs } from './obsEventDelay.js';

const match = { organization_id: 7, league: 'Super liga' };
const league = { organization_id: 7, name: 'Super liga', tier: 1 };

test('only a verified first-tier league waits for replay before displaying the scorer', () => {
  assert.equal(getObsEventDelayMs('goal', match, league), 25_000);
  assert.equal(getObsEventDelayMs('goal', match, { ...league, tier: '1' }), 25_000);
  assert.equal(getObsEventDelayMs('goal', match, { ...league, tier: 2 }), 0);
  assert.equal(getObsEventDelayMs('goal', match, { ...league, tier: null }), 0);
  assert.equal(getObsEventDelayMs('goal', match, null), 0);
  assert.equal(getObsEventDelayMs('goal', match, { ...league, organization_id: 8 }), 0);
});

test('tournaments use their own tier, including explicit legacy metadata', () => {
  const tournament = { ...match, tournament_id: 9 };
  assert.equal(getObsEventDelayMs('goal', tournament, league), 0);
  assert.equal(getObsEventDelayMs('goal', {
    ...tournament, tournamentReplayMetadata: { tier: 2, description: '[TIER:1|PARENT:]' },
  }, league), 0);
  assert.equal(getObsEventDelayMs('goal', {
    ...tournament, tournamentReplayMetadata: { description: '[TIER:1|PARENT:]' },
  }, null), 25_000);
});

test('card graphic timing is independent of league tier', () => {
  assert.equal(getObsEventDelayMs('yellow_card', match, null), 25_000);
  assert.equal(getObsEventDelayMs('red_card', match, { ...league, tier: 2 }), 25_000);
});
