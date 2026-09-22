import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCardPage } from './cardsData.js';

const scope = {
  orgId: 'owner', mode: 'league', round: 'all',
  competition: { id: 'league', name: 'Super liga', organization_id: 'owner' },
};

function mockClient(results) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, methods: [] };
      calls.push(call);
      const result = results.shift();
      const query = new Proxy({}, {
        get(_, method) {
          if (method === 'then') return (resolve, reject) => Promise.resolve(result).then(resolve, reject);
          return (...args) => { call.methods.push([method, ...args]); return query; };
        },
      });
      return query;
    },
  };
}

test('player pages are bounded and card totals span event batches', async () => {
  const applications = Array.from({ length: 26 }, (_, id) => ({ id, first_name: `Player ${id}` }));
  const card = id => ({ id, player_id: 0, event_type: 'yellow_card', team: { id: 1, name: 'Team' } });
  const client = mockClient([
    { data: applications },
    { data: Array.from({ length: 200 }, (_, id) => card(id)) },
    { data: [{ ...card(200), event_type: 'red_card' }] },
  ]);
  const result = await loadCardPage(client, scope, 1);
  assert.equal(result.players.length, 25);
  assert.equal(result.hasNext, true);
  assert.equal(result.players[0].yellowCards, 200);
  assert.equal(result.players[0].redCards, 1);
  assert(client.calls[0].methods.some(args => JSON.stringify(args) === '["range",25,50]'));
  assert(client.calls[2].methods.some(args => JSON.stringify(args) === '["range",200,399]'));
  const ids = client.calls[1].methods.find(args => args[0] === 'in' && args[1] === 'player_id')[2];
  assert.equal(ids.length, 25);
  assert(!ids.includes(25));
});

test('tournament and round filters apply to player eligibility and card totals', async () => {
  const client = mockClient([{ data: [{ id: 'player' }] }, { data: [] }]);
  await loadCardPage(client, { ...scope, mode: 'tournament', round: '3' }, 0);
  for (const [index, prefix] of ['cards.match.', 'match.'].entries()) {
    const methods = client.calls[index].methods;
    assert(methods.some(args => args[0] === 'eq' && args[1] === prefix + 'tournament_id' && args[2] === 'league'));
    assert(methods.some(args => args[0] === 'eq' && args[1] === prefix + 'round' && args[2] === '3'));
    assert(methods.some(args => args[0] === 'in' && args[1] === prefix + 'organization_id'));
    assert(!methods.some(args => args[1] === prefix + 'league'));
  }
});

test('failed queries never return partial card totals', async () => {
  const failure = new Error('Failed event batch');
  const client = mockClient([{ data: [{ id: 'player' }] }, { error: failure }]);
  await assert.rejects(loadCardPage(client, scope, 0), failure);
});

test('empty pages do not fetch events', async () => {
  const client = mockClient([{ data: [] }]);
  assert.deepEqual(await loadCardPage(client, scope, 0), { players: [], events: [], hasNext: false });
  assert.equal(client.calls.length, 1);
});
