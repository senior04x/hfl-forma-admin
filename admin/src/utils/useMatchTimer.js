import { useCallback, useEffect, useState } from 'react';
import { getRemainingSeconds, getTimerBaseSeconds, isRunningTimerSnapshot, parseTimerStartMs } from './matchTimer.js';
import { hasServerClockSync, serverNowMs } from './serverClock.js';

export function useMatchTimer(match, halfSeconds) {
  const { id, status, timer_seconds: seconds, timer_started_at: startedAt, is_timer_running: running } = match ?? {};
  const baseSeconds = getTimerBaseSeconds(seconds, status, halfSeconds);
  const startedMs = parseTimerStartMs(startedAt);
  const shouldRun = isRunningTimerSnapshot(running, status, startedMs);
  const [sample, setSample] = useState(null);

  const readRemaining = useCallback(() => {
    if (!shouldRun || (!hasServerClockSync() && !import.meta.env.DEV)) return baseSeconds;
    return getRemainingSeconds(baseSeconds, serverNowMs() - startedMs);
  }, [baseSeconds, shouldRun, startedMs]);

  useEffect(() => {
    if (!shouldRun) return;
    const sampleTimer = () => {
      const remaining = readRemaining();
      setSample(previous => previous?.id === id && previous?.status === status &&
        previous.readRemaining === readRemaining && previous.remaining === remaining
        ? previous
        : { id, status, readRemaining, remaining });
    };

    sampleTimer();
    const interval = setInterval(sampleTimer, 250);
    return () => clearInterval(interval);
  }, [id, status, readRemaining, shouldRun]);

  const hasCurrentSample = sample?.id === id && sample?.status === status && sample?.readRemaining === readRemaining;
  const timerSeconds = shouldRun && hasCurrentSample ? sample.remaining : baseSeconds;
  return { timerSeconds, isTimerRunning: shouldRun && timerSeconds > 0, readRemaining };
}
