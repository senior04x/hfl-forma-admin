import test from 'node:test';
import assert from 'node:assert/strict';
import { getYouTubeScheduledStartTime } from './youtubeSchedule.js';

test('form and database times schedule the same Tashkent kickoff', () => {
  for (const match_time of ['20:45', '20:45:00', '20:45:00.000000']) {
    assert.equal(getYouTubeScheduledStartTime({ match_date: '2026-10-02', match_time }), '2026-10-02T15:45:00.000Z');
  }
});

test('early kickoff converts to the previous UTC day', () => {
  assert.equal(getYouTubeScheduledStartTime({ match_date: '2026-10-02', match_time: '01:30:00' }), '2026-10-01T20:30:00.000Z');
});

test('invalid or missing schedule is rejected instead of using the current time', () => {
  for (const match of [{}, { match_date: '2026-02-30', match_time: '20:45' }, { match_date: '2026-10-02', match_time: '25:00' }]) {
    assert.throws(() => getYouTubeScheduledStartTime(match), /Schedule/);
  }
});
