import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLeagueDuration, loadTournamentDuration, getHalfDurationSecs } from './matchDuration.js';

test('50-minute sponsor setting resolves to a 25-minute half on both displays', async () => {
  const db = { from(table) {
    assert.equal(table, 'sponsors');
    return { select(column) {
      assert.equal(column, 'logo_url');
      return { eq(column, value) {
        assert.equal(column, 'name');
        assert.equal(value, 'LEAGUE_DURATION_7');
        return { maybeSingle: async () => ({ data: { logo_url: '50' } }) };
      } };
    } };
  } };
  const league = await loadLeagueDuration(db, { id: 7 });
  const half = getHalfDurationSecs({}, league);
  assert.equal(half, 1500);
  assert.equal(half - 1200, 300); // 05:00, not 10:00, in the first half.
  assert.equal(half + (half - 1200), 1800); // 30:00 in the second half.
});

test('half_minutes is honored without an extra database query', async () => {
  const league = await loadLeagueDuration(null, { half_minutes: 25 });
  assert.equal(getHalfDurationSecs({}, league), 1500);
  assert.equal(league.match_duration, 50);
});

test('match duration overrides and default remain consistent', () => {
  assert.equal(getHalfDurationSecs({ half_duration: 20 }, { half_duration: 25 }), 1200);
  assert.equal(getHalfDurationSecs({ match_duration: 50 }, null), 1500);
  assert.equal(getHalfDurationSecs(null, null), 1800);
});

test('tournament duration overrides league and survives match realtime updates', async () => {
  const db = { from(table) {
    assert.equal(table, 'tournaments');
    return { select(column) {
      assert.equal(column, 'match_duration');
      return { eq(column, id) {
        assert.equal(column, 'id');
        assert.equal(id, 'cup');
        return { maybeSingle: async () => ({ data: { match_duration: 40 } }) };
      } };
    } };
  } };
  const match = await loadTournamentDuration(db, { tournament_id: 'cup', half_duration: 30 });
  assert.equal(getHalfDurationSecs(match, { half_duration: 25 }), 1200);
  assert.equal(getHalfDurationSecs({ ...match, half_duration: null, status: 'second_half' }, { half_duration: 25 }), 1200);
});

test('league fixtures need no tournament query and absent duration keeps fallback', async () => {
  const match = { id: 'league-match' };
  assert.equal(await loadTournamentDuration(null, match), match);
  const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) };
  const cup = { tournament_id: 'cup' };
  assert.equal(await loadTournamentDuration(db, cup), cup);
});
