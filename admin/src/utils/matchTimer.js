const WAITING = new Set(['scheduled', 'not_started', 'pending', 'upcoming']);
const BREAK = new Set(['half_time', 'break']);

export function getTimerBaseSeconds(seconds, status, halfSeconds) {
  const value = Number(seconds);
  if (seconds == null || !Number.isFinite(value) || value < 0 || (value === 0 && WAITING.has(status))) {
    return halfSeconds;
  }
  return value;
}

export function canRunMatchTimer(status) {
  return !WAITING.has(status) && !BREAK.has(status) && status !== 'finished';
}

export function parseTimerStartMs(timestamp) {
  if (!timestamp) return NaN;
  // Older rows may omit the UTC offset. Interpret those the same way as the Windows scoreboard.
  const iso = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(timestamp)
    ? `${timestamp}Z` : timestamp;
  return Date.parse(iso);
}

export function getRemainingSeconds(baseSeconds, elapsedMs) {
  return Math.max(0, baseSeconds - Math.max(0, Math.floor(elapsedMs / 1000)));
}

export function getElapsedMatchSeconds(status, remaining, halfSeconds) {
  if (!status || WAITING.has(status)) return 0;
  if (BREAK.has(status)) return halfSeconds;
  if (status === 'finished') return halfSeconds * 2;
  const elapsed = Math.max(0, halfSeconds - remaining);
  return status === 'second_half' || status === 'extra_time' ? halfSeconds + elapsed : elapsed;
}
