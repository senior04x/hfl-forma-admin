let serverTimeAtSyncMs = null;
let monotonicTimeAtSyncMs = null;
let syncPromise = null;

const monotonicNow = () => globalThis.performance?.now?.() ?? Date.now();

export function hasServerClockSync() {
  return Number.isFinite(serverTimeAtSyncMs) && Number.isFinite(monotonicTimeAtSyncMs);
}

export function serverNowMs() {
  if (!hasServerClockSync()) return Date.now();
  return serverTimeAtSyncMs + (monotonicNow() - monotonicTimeAtSyncMs);
}

export function serverNowIso() {
  return new Date(serverNowMs()).toISOString();
}

export function syncServerClock() {
  if (syncPromise) return syncPromise;

  syncPromise = (async () => {
    const requestStartedAt = monotonicNow();
    const localStartedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`/api/server-time?request=${localStartedAt}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Server vaqti olinmadi (${response.status})`);

      const { now } = await response.json();
      const responseReceivedAt = monotonicNow();
      const roundTripMs = Math.max(0, responseReceivedAt - requestStartedAt);
      const serverNow = Number(now);
      if (!Number.isFinite(serverNow)) throw new Error('Server vaqti noto‘g‘ri formatda');

      // Anchor the server clock to performance.now(), so later wall-clock changes
      // or another computer's clock skew cannot change the match timer.
      serverTimeAtSyncMs = serverNow + roundTripMs / 2;
      monotonicTimeAtSyncMs = responseReceivedAt;
      return serverNowMs();
    } finally {
      clearTimeout(timeout);
    }
  })().finally(() => {
    syncPromise = null;
  });

  return syncPromise;
}

export function startServerClockSync(intervalMs = 60_000) {
  let disposed = false;
  const sync = () => {
    syncServerClock().catch((error) => {
      if (!disposed) console.warn('Server soatini sinxronlash imkoni bo‘lmadi:', error);
    });
  };

  sync();
  const interval = setInterval(sync, intervalMs);
  return () => {
    disposed = true;
    clearInterval(interval);
  };
}
