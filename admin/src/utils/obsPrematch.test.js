import test from 'node:test';
import assert from 'node:assert/strict';
import { selectStreamMatch, calculateTable, readPages } from './obsPrematch.js';

const now = Date.parse('2026-09-21T12:00:00+05:00');
const fixture = (id, time, extra = {}) => ({ id, match_date: '2026-09-21', match_time: time, status: 'scheduled', ...extra });
test('stream prioritizes live, then nearest future kickoff, not latest edit', () => {
  const matches = [fixture('later', '18:00:00', { updated_at: '2026-09-21' }), fixture('next', '13:00:00'), fixture('old', '11:00:00')];
  assert.equal(selectStreamMatch(matches, now).id, 'next');
  assert.equal(selectStreamMatch([...matches, fixture('live', '10:00:00', { status: 'half_time' })], now).id, 'live');
  assert.equal(selectStreamMatch([fixture('old', '11:00:00'), fixture('finished', '14:00:00', { status: 'finished' })], now), null);
  assert.equal(selectStreamMatch([fixture('bad', null)], now), null);
});
test('table honors competition overrides and excludes unfinished scores', () => {
  const teams = [{ id: 'a', penalty_points: -2 }, { id: 'b' }, { id: 'c', is_archived: true }];
  const games = [{ home_team_id: 'a', away_team_id: 'b', home_score: 2, away_score: 0, status: 'finished' },
    { home_team_id: 'b', away_team_id: 'a', home_score: 99, away_score: 0, status: 'scheduled' }];
  const league = calculateTable(teams, games, {}, null);
  assert.equal(league.length, 2);
  assert.equal(league[0].points, 1);
  assert.equal(league[0].played, 1);
  assert.deepEqual(league[0].form, ['G']);
  const cup = calculateTable(teams, games, { TOURN_7_b: { pts_offset: 4 } }, 7);
  assert.equal(cup[0].id, 'b');
  assert.equal(cup[1].points, 3);
});
test('table applies goal difference, goals and wins tie breakers', () => {
  const table = calculateTable([{ id: 'a' }, { id: 'b' }], [], {
    a: { pts_offset: 4, gf_offset: 3, ga_offset: 1 },
    b: { pts_offset: 4, gf_offset: 4, ga_offset: 2 },
  });
  assert.equal(table[0].id, 'b');
});
test('pagination reads beyond the API cap and rejects partial results', async () => {
  const all = Array.from({ length: 1001 }, (_, id) => ({ id }));
  const result = await readPages(() => ({ range: async (start, end) => ({ data: all.slice(start, end + 1) }) }));
  assert.equal(result.length, 1001);
  await assert.rejects(readPages(() => ({ range: async () => ({ error: new Error('offline') }) })), /offline/);
});
