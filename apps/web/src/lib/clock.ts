/**
 * Server clock offset (UI-4). Countdowns (escalate_at, SOS cancel window) subtract server time, not
 * the phone's clock. The adapter sets the offset from `server_now` (snapshot, ClockTick, SosRaiseOut).
 */
let serverOffsetMs = 0;

export function setServerNow(serverNowIso: string, receivedAtMs: number = Date.now()) {
  serverOffsetMs = Date.parse(serverNowIso) - receivedAtMs;
}

export function serverNowMs(): number {
  return Date.now() + serverOffsetMs;
}

/** Whole seconds until an ISO instant on the server clock, never negative. */
export function secondsUntil(iso: string, nowMs: number = serverNowMs()): number {
  return Math.max(0, Math.ceil((Date.parse(iso) - nowMs) / 1000));
}
