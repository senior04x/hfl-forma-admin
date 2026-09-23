import test from 'node:test';
import assert from 'node:assert/strict';
import { savePrematchMode } from './obsPrematchMode.js';

function database(result) {
  const calls = [];
  const query = {
    update(value) { calls.push(['update', value]); return query; },
    eq(key, value) { calls.push(['eq', key, value]); return query; },
    select(value) { calls.push(['select', value]); return query; },
    async maybeSingle() { return result; },
  };
  return { calls, from(table) { calls.push(['from', table]); return query; } };
}

for (const compact of [true, false]) {
  test(`saves ${compact ? 'compact' : 'full'} mode only for the scheduled match`, async () => {
    const row = { id: 'match-a', obs_prematch_compact: compact };
    const db = database({ data: row });
    assert.deepEqual(await savePrematchMode(db, 'match-a', compact), row);
    assert.deepEqual(db.calls, [
      ['from', 'matches'], ['update', { obs_prematch_compact: compact }],
      ['eq', 'id', 'match-a'], ['eq', 'status', 'scheduled'],
      ['select', 'id, obs_prematch_compact'],
    ]);
  });
}

test('missing migration or denied write is not reported as success', async () => {
  const error = { code: '42703' };
  await assert.rejects(savePrematchMode(database({ error }), 'match-a', true), e => e === error);
  await assert.rejects(savePrematchMode(database({ data: null }), 'match-a', true), /O‘yin boshlangan/);
});
