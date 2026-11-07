import { useCallback, useEffect, useRef, useState } from 'react';
import { canRunMatchTimer, getRemainingSeconds, getTimerBaseSeconds, parseTimerStartMs } from './matchTimer.js';
import { hasServerClockSync, serverNowMs } from './serverClock.js';

export function useMatchTimer(match, halfSeconds) {
  const { id, status, timer_seconds: seconds, timer_started_at: startedAt, is_timer_running: running } = match ?? {};
  const baseSeconds = getTimerBaseSeconds(seconds, status, halfSeconds);
  const shouldRun = (running === true || running === 'true') && canRunMatchTimer(status);
  const startedMs = parseTimerStartMs(startedAt);
  const legacyAnchor = useRef(null);
  const [sample, setSample] = useState(null);

  const readRemaining = useCallback(() => {
    if (!shouldRun) return baseSeconds;
    if (Number.isFinite(startedMs)) {
      if (!hasServerClockSync() && !import.meta.env.DEV) return baseSeconds;
      return getRemainingSeconds(baseSeconds, serverNowMs() - startedMs);
    }
    // Old rows can be running without a start timestamp. Keep one local anchor per command.
    const elapsed = legacyAnchor.current == null ? 0 : performance.now() - legacyAnchor.current;
    return getRemainingSeconds(baseSeconds, elapsed);
  }, [baseSeconds, shouldRun, startedMs]);

  useEffect(() => {
    legacyAnchor.current = performance.now();
    const sampleTimer = () => {
      const remaining = readRemaining();
      setSample(previous => previous?.id === id && previous?.status === status &&
        previous.readRemaining === readRemaining && previous.remaining === remaining
        ? previous
        : { id, status, readRemaining, remaining });
    };

    if (!shouldRun) return;
    sampleTimer();
    const interval = setInterval(sampleTimer, 250);
    return () => clearInterval(interval);
  }, [id, status, readRemaining, shouldRun]);

  const hasCurrentSample = sample?.id === id && sample?.status === status && sample?.readRemaining === readRemaining;
  const timerSeconds = shouldRun && hasCurrentSample ? sample.remaining : baseSeconds;
  return { timerSeconds, isTimerRunning: shouldRun && timerSeconds > 0, readRemaining };
}
