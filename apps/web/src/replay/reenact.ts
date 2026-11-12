/**
 * The Debrief re-enactment (T8) as ONE pure function. `stateAt(model, t)` returns everything the
 * player draws or prints at sim time `t`: the trails so far, the machine's position and heading,
 * speed, pitch, seatbelt, wind and which markers have passed. The map, the readouts and the
 * scrubber all read it, so they cannot disagree about what "now" is.
 *
 * Nothing here touches the DOM or a clock. Playback (rAF) lives in use-reenactment.ts and only
 * decides which `t` to ask for.
 */
import type { EvidenceCard, ReplayScenario } from "@cat/shared";

/** Playback speed relative to sim time: a fixed 10x (T8, no speed menu). */
export const PLAYBACK_SPEED = 10;
/** One arrow-key step on the scrubber: 1 s of sim time (interaction-map T8). */
export const KEY_STEP_MS = 1000;

export type Fix = { t_ms: number; lat: number; lon: number };
export type TrackFix = Fix & { speed_kmh: number; pitch_deg: number };
export type WindFix = { t_ms: number; from_deg: number; kmh: number };
export type BeltFix = { t_ms: number; on: boolean };
/** "unknown" = the recording carries no seatbelt reading: shown as "No reading", never guessed. */
export type SeatbeltState = "on" | "off" | "unknown";

export type ReenactModel = {
  durationMs: number;
  trail: Fix[];
  track: TrackFix[];
  wind: WindFix[];
  /** Seatbelt samples (step function). Empty means the recording has none: see `beltDefault`. */
  belt: BeltFix[];
  beltDefault: SeatbeltState;
  /**
   * The flag moment: `reenactment.event_ms` (contracts 2.1.0) when the server sends it, clamped to
   * the timeline. FALLBACK (field absent): the last recorded fix, an assumption, see `eventExact`.
   */
  eventMs: number;
  /** True when `eventMs` came from `reenactment.event_ms`; false = the last-fix fallback (caption says so). */
  eventExact: boolean;
  /** The stopwatch moment: when the operator responded, `eventMs + real_response_ms`; null if unknown. */
  responseMs: number | null;
  /** True when `eventMs + real_response_ms` fell past the end and the marker was pulled back to it. */
  responseClamped: boolean;
};

export type ReenactState = {
  t: number;
  /** 0..1 along the timeline. */
  fraction: number;
  /** The operator's trail drawn so far, ending at the interpolated head. */
  trail: { lat: number; lon: number }[];
  /** The operator dot (the trail's head), null without a trail. */
  operator: { lat: number; lon: number } | null;
  /** The machine's path so far, ending at the interpolated position. */
  machineTrail: { lat: number; lon: number }[];
  /** The machine marker; heading is degrees clockwise from north. Null without a track. */
  machine: { lat: number; lon: number; heading_deg: number } | null;
  speed_kmh: number | null;
  pitch_deg: number | null;
  seatbelt: SeatbeltState;
  wind: { from_deg: number; kmh: number } | null;
  flagPassed: boolean;
  responsePassed: boolean;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Index of the last sample with t_ms <= t, or -1 when `t` is before the first. Samples are sorted. */
function lastAtOrBefore(samples: readonly { t_ms: number }[], t: number): number {
  let lo = 0;
  let hi = samples.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t_ms <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** Progress 0..1 of `t` between sample `i` and `i + 1` (0 when there is no next sample). */
function segmentK(samples: readonly { t_ms: number }[], i: number, t: number): number {
  const a = samples[i];
  const b = samples[i + 1];
  if (!a || !b || b.t_ms === a.t_ms) return 0;
  return clamp((t - a.t_ms) / (b.t_ms - a.t_ms), 0, 1);
}

/** Compass bearing in degrees from `a` to `b` (small-area plane approximation), 0 = north. */
export function bearingDeg(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number | null {
  const dy = b.lat - a.lat;
  const dx = (b.lon - a.lon) * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  if (dx === 0 && dy === 0) return null;
  return ((((Math.atan2(dx, dy) * 180) / Math.PI) % 360) + 360) % 360;
}

/** The shorter way round between two bearings, so 350 -> 10 passes through 0, not 180. */
function lerpAngle(a: number, b: number, k: number): number {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return (((a + d * k) % 360) + 360) % 360;
}

/** The path drawn up to `t`: every sample already passed plus the interpolated head. */
function pathUpTo(samples: readonly Fix[], t: number): { lat: number; lon: number }[] {
  if (samples.length === 0) return [];
  const i = lastAtOrBefore(samples, t);
  if (i < 0) return [{ lat: samples[0].lat, lon: samples[0].lon }];
  const out = samples.slice(0, i + 1).map((p) => ({ lat: p.lat, lon: p.lon }));
  const next = samples[i + 1];
  if (next && t > samples[i].t_ms) {
    const k = segmentK(samples, i, t);
    out.push({ lat: lerp(samples[i].lat, next.lat, k), lon: lerp(samples[i].lon, next.lon, k) });
  }
  return out;
}

/**
 * Heading at `t`: the bearing of the segment being travelled; on a stationary stretch the last
 * heading held; before any movement the first one; with fewer than two fixes, north (0).
 */
function headingAt(track: readonly Fix[], t: number): number {
  if (track.length < 2) return 0;
  const i = clamp(lastAtOrBefore(track, t), 0, track.length - 2);
  for (let j = i; j >= 0; j--) {
    const b = bearingDeg(track[j], track[j + 1]);
    if (b !== null) return b;
  }
  for (let j = i + 1; j < track.length - 1; j++) {
    const b = bearingDeg(track[j], track[j + 1]);
    if (b !== null) return b;
  }
  return 0;
}

const byTime = <T extends { t_ms: number }>(xs: readonly T[]) => [...xs].sort((a, b) => a.t_ms - b.t_ms);

/** Seatbelt samples from a telemetry_trend card, when the recording carries them (1 = fastened). */
function beltFromCards(cards: readonly EvidenceCard[]): BeltFix[] {
  for (const c of cards) {
    if (c.type !== "telemetry_trend") continue;
    const s = c.series.find((x) => x.metric === "seatbelt");
    if (s && s.points.length > 0) return byTime(s.points.map((p) => ({ t_ms: p.t_ms, on: p.v >= 0.5 })));
  }
  return [];
}

/**
 * Belt samples from `machine_track[].seatbelt_fastened` (contracts 2.1.0). null/absent entries are
 * "no reading" and are skipped, so the step function holds the last real reading. Empty when the
 * track carries none.
 */
function beltFromTrack(track: readonly { t_ms: number; seatbelt_fastened?: boolean | null }[]): BeltFix[] {
  const out: BeltFix[] = [];
  for (const p of track) if (typeof p.seatbelt_fastened === "boolean") out.push({ t_ms: p.t_ms, on: p.seatbelt_fastened });
  return out;
}

/**
 * Builds the model from a scenario. The flag sits at `event_ms` when sent, else at the last
 * recorded fix; the stopwatch is `real_response_ms` after it (clamped to the end), so both always
 * fall on the timeline. The belt comes from the track, else a telemetry card series; with neither
 * it is "unknown": a reading nobody recorded is never shown.
 */
export function buildReenactModel(scenario: ReplayScenario): ReenactModel {
  const r = scenario.reenactment;
  const trail = byTime(r.trail);
  const track = byTime(r.machine_track);
  const wind = byTime(r.wind);
  const lastFix = Math.max(0, trail.at(-1)?.t_ms ?? 0, track.at(-1)?.t_ms ?? 0);
  const durationMs = Math.max(1, r.duration_ms, lastFix);
  const eventExact = typeof r.event_ms === "number";
  const eventMs = clamp(typeof r.event_ms === "number" ? r.event_ms : lastFix, 0, durationMs);
  const trackBelt = beltFromTrack(track);
  const rawResponse = r.real_response_ms === null ? null : eventMs + Math.max(0, r.real_response_ms);
  const responseMs = rawResponse === null ? null : clamp(rawResponse, 0, durationMs);
  return {
    durationMs,
    trail,
    track,
    wind,
    belt: trackBelt.length > 0 ? trackBelt : beltFromCards(scenario.investigate.cards),
    beltDefault: "unknown",
    eventMs,
    eventExact,
    responseMs,
    responseClamped: rawResponse !== null && rawResponse > durationMs,
  };
}

/** Everything the Debrief shows at sim time `tMs` (clamped to the timeline). */
export function stateAt(m: ReenactModel, tMs: number): ReenactState {
  const t = clamp(Number.isFinite(tMs) ? tMs : 0, 0, m.durationMs);

  const machineTrail = pathUpTo(m.track, t);
  const trail = pathUpTo(m.trail, t);

  // Position and readouts: linear between the two fixes around `t`; before the first and after the
  // last they hold.
  let machine: ReenactState["machine"] = null;
  let speed: number | null = null;
  let pitch: number | null = null;
  if (m.track.length > 0) {
    const i = Math.max(0, lastAtOrBefore(m.track, t));
    const a = m.track[i];
    const b = m.track[i + 1];
    const k = lastAtOrBefore(m.track, t) < 0 ? 0 : segmentK(m.track, i, t);
    machine = {
      lat: b ? lerp(a.lat, b.lat, k) : a.lat,
      lon: b ? lerp(a.lon, b.lon, k) : a.lon,
      heading_deg: headingAt(m.track, t),
    };
    speed = b ? lerp(a.speed_kmh, b.speed_kmh, k) : a.speed_kmh;
    pitch = b ? lerp(a.pitch_deg, b.pitch_deg, k) : a.pitch_deg;
  }

  const beltIdx = lastAtOrBefore(m.belt, t);
  const seatbelt: SeatbeltState = m.belt.length === 0 ? m.beltDefault : m.belt[Math.max(0, beltIdx)].on ? "on" : "off";

  let wind: ReenactState["wind"] = null;
  if (m.wind.length > 0) {
    const raw = lastAtOrBefore(m.wind, t);
    const i = Math.max(0, raw);
    const a = m.wind[i];
    const b = m.wind[i + 1];
    const k = raw < 0 || !b ? 0 : segmentK(m.wind, i, t);
    wind = b ? { from_deg: lerpAngle(a.from_deg, b.from_deg, k), kmh: lerp(a.kmh, b.kmh, k) } : { from_deg: a.from_deg, kmh: a.kmh };
  }

  return {
    t,
    fraction: t / m.durationMs,
    trail,
    operator: trail.at(-1) ?? null,
    machineTrail,
    machine,
    speed_kmh: speed,
    pitch_deg: pitch,
    seatbelt,
    wind,
    flagPassed: t >= m.eventMs,
    responsePassed: m.responseMs !== null && t >= m.responseMs,
  };
}

/** Real playback length in ms for a timeline: duration / 10 (T8). */
export function playbackLengthMs(durationMs: number): number {
  return durationMs / PLAYBACK_SPEED;
}

/** One rAF step: advances sim time by `dtMs` of real time at 10x, stopping on the final frame. */
export function advance(tMs: number, dtMs: number, durationMs: number): { t: number; ended: boolean } {
  const next = Math.min(durationMs, tMs + Math.max(0, dtMs) * PLAYBACK_SPEED);
  return { t: next, ended: next >= durationMs };
}

/** A key on the scrubber -> the new sim time, or null if the key is not ours. */
export function scrubKey(key: string, tMs: number, durationMs: number): number | null {
  switch (key) {
    case "ArrowLeft":
    case "ArrowDown":
      return clamp(tMs - KEY_STEP_MS, 0, durationMs);
    case "ArrowRight":
    case "ArrowUp":
      return clamp(tMs + KEY_STEP_MS, 0, durationMs);
    case "PageDown":
      return clamp(tMs - 10 * KEY_STEP_MS, 0, durationMs);
    case "PageUp":
      return clamp(tMs + 10 * KEY_STEP_MS, 0, durationMs);
    case "Home":
      return 0;
    case "End":
      return durationMs;
    default:
      return null;
  }
}

/** A pointer x inside the scrubber rail -> sim time. */
export function timeFromPointer(clientX: number, left: number, width: number, durationMs: number): number {
  if (width <= 0) return 0;
  return clamp(((clientX - left) / width) * durationMs, 0, durationMs);
}

/** "1:05" for 65 000 ms. */
export function clockLabel(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The score count-up value at `elapsedMs` of `durationMs` (ease-out), exact at the end. */
export function countValue(target: number, elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0 || elapsedMs >= durationMs) return target;
  const p = clamp(elapsedMs / durationMs, 0, 1);
  return target * (1 - Math.pow(1 - p, 3));
}
