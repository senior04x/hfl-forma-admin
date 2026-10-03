import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateScorers, matchesScorerFilter, scorerFilterLabel } from './scorers.js';
import { prepareExportImages } from './exportImages.js';

const matches = [
  { id: 1, status: 'finished', stage: 'group', round: 1 },
  { id: 2, status: 'finished', stage: 'group', round: 2 },
  { id: 3, status: 'finished', stage: 'semifinal', round: 1 },
  { id: 4, status: 'finished', stage: 'final', round: 1 },
  { id: 5, status: 'live', stage: 'final', round: 1 },
];
const goal = (id, match, player = 10, type = 'goal') => ({
  id, match_id: match, player_id: player, event_type: type,
  player: { first_name: `Player ${player}` }, team: { name: 'Team' },
});
const events = [goal(1, 1), goal(2, 2), goal(3, 3), goal(4, 4, 20, 'penalty_goal')];

test('one player has separate totals for league and each tournament, including all filter', () => {
  const mixedMatches = [
    { id: 1, status: 'finished', tournament_id: null, league: 'Super liga' },
    { id: 2, status: 'finished', tournament_id: 7 },
    { id: 3, status: 'finished', tournament_id: 8 },
    { id: 4, status: 'finished', tournament_id: null, league: 'Pro liga' },
  ];
  const mixedEvents = [goal(1, 1), goal(2, 1), goal(3, 2), goal(4, 3), goal(5, 3), goal(6, 3), goal(7, 4)];
  const count = scope => calculateScorers(mixedEvents, mixedMatches, 'all', 'all', scope)[0]?.goals;
  assert.equal(count({ tournament: false, name: 'Super liga' }), 2);
  assert.equal(count({ tournament: true, id: '7' }), 1);
  assert.equal(count({ tournament: true, id: 8 }), 3);
  assert.equal(count({ tournament: true }), undefined);
});

test('defaults to all rounds and stages; filters playoff and individual stages', () => {
  assert.deepEqual(calculateScorers(events, matches).map(p => p.goals), [3, 1]);
  assert.deepEqual(calculateScorers(events, matches, 'group', '1').map(p => p.goals), [1]);
  assert.deepEqual(calculateScorers(events, matches, 'playoff').map(p => p.goals), [1, 1]);
  assert.equal(calculateScorers(events, matches, 'final')[0].id, '20');
  assert.equal(calculateScorers(events, matches, 'semifinal', '2').length, 0);
  assert.equal(scorerFilterLabel('all', 'all'), 'BARCHASI');
  assert.equal(matchesScorerFilter({ round: 2 }, 'group', '2'), true);
});

test('counts each event once, normalizes IDs, excludes own goals and shootouts', () => {
  const mixed = [goal(1, '1'), goal('1', 1), goal(2, 2, '10'), goal(3, 3, 10, 'own_goal'),
    goal(4, 4, 10, 'penalty_shootout'), goal(5, 5), goal(6, 999), goal(7, 1, null),
    goal(8, 1, 10, 'assist'), goal(9, 1, 10, 'yellow_card')];
  assert.deepEqual(calculateScorers(mixed, matches).map(p => [p.id, p.goals]), [['10', 2]]);
});

test('keeps distinct goals in the same match and returns only ten players', () => {
  const many = Array.from({ length: 12 }, (_, i) => goal(i, 1, i));
  many.push(goal(100, 1, 11), goal(101, 1, 11));
  const ranked = calculateScorers(many, matches);
  assert.equal(ranked.length, 10);
  assert.equal(ranked[0].id, '11');
  assert.equal(ranked[0].goals, 3);
  assert.deepEqual(calculateScorers([], matches), []);
});

test('fits wide and tall logo pixels without distortion, preserves cover photos', async () => {
  const makeImage = (w, h, fit = 'contain') => ({ naturalWidth: w, naturalHeight: h, fit,
    decode: async () => {}, getBoundingClientRect: () => ({ width: 400, height: 120 }), style: {} });
  const images = [makeImage(1000, 100), makeImage(100, 400), makeImage(100, 100, 'cover')];
  const oldDocument = globalThis.document;
  const oldStyle = globalThis.getComputedStyle;
  globalThis.document = { fonts: { ready: Promise.resolve() } };
  globalThis.getComputedStyle = image => ({ objectFit: image.fit });
  try {
    await prepareExportImages({ querySelectorAll: () => images });
    assert.deepEqual([images[0].style.width, images[0].style.height], ['400px', '40px']);
    assert.deepEqual([images[1].style.width, images[1].style.height], ['30px', '120px']);
    assert.deepEqual(images[2].style, {});
  } finally {
    globalThis.document = oldDocument;
    globalThis.getComputedStyle = oldStyle;
  }
});
