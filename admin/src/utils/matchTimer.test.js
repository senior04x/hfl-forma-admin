import test from 'node:test';
import assert from 'node:assert/strict';
import { canRunMatchTimer, getElapsedMatchSeconds, getRemainingSeconds, getTimerBaseSeconds, parseTimerStartMs } from './matchTimer.js';

test('zero seconds stay zero when a running half ends and the page reloads', () => {
  for (const [status, elapsed] of [['first_half', 1500], ['second_half', 3000]]) {
    const paused = getTimerBaseSeconds(0, status, 1500);
    assert.equal(paused, 0);
    assert.equal(getElapsedMatchSeconds(status, paused, 1500), elapsed);
  }
  assert.equal(getTimerBaseSeconds(0, 'scheduled', 1500), 1500);
  assert.equal(getTimerBaseSeconds(null, 'first_half', 1500), 1500);
});

test('25-minute halves show the same elapsed match time on both web screens', () => {
  const remaining = getRemainingSeconds(1500, 301_900);
  assert.equal(remaining, 1199);
  assert.equal(getElapsedMatchSeconds('first_half', remaining, 1500), 301);
  assert.equal(getElapsedMatchSeconds('half_time', remaining, 1500), 1500);
  assert.equal(getElapsedMatchSeconds('second_half', remaining, 1500), 1801);
  assert.equal(getElapsedMatchSeconds('upcoming', remaining, 1500), 0);
});

test('stopped statuses and elapsed time outside the countdown are clamped', () => {
  assert.equal(canRunMatchTimer('second_half'), true);
  for (const status of ['scheduled', 'break', 'half_time', 'finished']) {
    assert.equal(canRunMatchTimer(status), false);
  }
  assert.equal(getRemainingSeconds(1500, -5000), 1500);
  assert.equal(getRemainingSeconds(1500, 1_500_000), 0);
  assert.equal(getRemainingSeconds(1500, 1_550_000), 0);
});

test('old timestamps without an offset are read as UTC', () => {
  const utc = Date.parse('2026-11-07T12:00:00.123Z');
  assert.equal(parseTimerStartMs('2026-11-07T12:00:00.123'), utc);
  assert.equal(parseTimerStartMs('2026-11-07T17:00:00.123+05:00'), utc);
});
