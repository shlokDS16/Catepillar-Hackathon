/**
 * The map's ONE time cursor as a pure function (same pattern as replay/reenact.ts `stateAt`).
 * `mapStateAt(model, t)` returns everything the map draws or prints at time `t`: every machine's
 * position, heading and trail so far, the Guardian rings, which events have happened, and the
 * provenance and data age of each machine. The markers, trails, rings, scrubber and lists all read
 * it, so they cannot disagree about what "now" is.
 *
 * Nothing here touches the DOM or a clock: `t` and `endMs` are passed in. Playback and the 1 Hz
 * "now" live in use-map-cursor.ts and only decide which `t` to ask for.
 */
import { bearingDeg, distanceM, RING_M, type LatLon, type SiteMapData } from "@/map/site-map";
import type { AlertRecord, AlertTier } from "@/data/types";

/** The scrubber covers the last 10 minutes. */
export const WINDOW_MS = 10 * 60_000;
/** A machine not heard from for this long looks stale: no safety colour, dashed, "Stale". */
export const STALE_MS = 60_000;
/** A cursor within this of the live edge is the live edge (the pin). Smaller than the 1 s keyboard step, so ArrowLeft leaves Live. */
export const LIVE_SNAP_MS = 500;
/** Displacement over this look-back that counts as "moving" for the heading arrow. */
const MOVING_LOOKBACK_MS = 20_000;
const MOVING_MIN_M = 2;
/** A pair of fixes closer than this tells nothing about heading (GPS jitter). */
const HEADING_MIN_M = 1;

export type Fix = { t_ms: number; lat: number; lon: number };
export type Health = "ok" | "caution" | "fault";
export type MapProvenance = "live" | "replayed" | "simulated";
/** Which row a machine sits in: my own machine, a machine that is a hazard, anyone else. */
export type MachineTier = "own" | "hazard" | "other";

export type MapActor = {
  id: string;
  code: string;
  own: boolean;
  health: Health;
  /** Oldest first. A machine with no fix at or before the cursor is not drawn yet. */
  track: Fix[];
};

export type MapEventKind = "guardian_hazard" | "proximity_zone" | "anomaly_machine" | "idle_excess" | "seatbelt_off_moving";

export type MapEvent = {
  id: string;
  t_ms: number;
  kind: MapEventKind;
  tier: AlertTier;
  machineCode: string | null;
  anomalyId: string | null;
};

export type MapPin = { id: string; lat: number; lon: number; /** When it was detected; null = no time known. */ t_ms: number | null };

export type MapModel = {
  startMs: number;
  endMs: number;
  /** True when the position fields are assumed-sensor data (the demo): shown as Simulated, never Live. */
  assumed: boolean;
  /** The operator's own track (the dot the rings follow). */
  me: Fix[];
  actors: MapActor[];
  events: MapEvent[];
  pins: MapPin[];
  /** Machine codes that carry a Guardian hazard right now. */
  hazardCodes: string[];
};

export type MachineAt = {
  id: string;
  code: string;
  tier: MachineTier;
  lat: number;
  lon: number;
  /** Degrees clockwise from north; null when the machine has never visibly moved. */
  heading_deg: number | null;
  moving: boolean;
  health: Health;
  /** The path so far, ending at the interpolated position. */
  trail: LatLon[];
  /** How old this machine's newest fix is at the cursor. */
  ageMs: number;
  stale: boolean;
  provenance: MapProvenance;
  /** The position is assumed-sensor data: shown as Simulated even when the cursor is in the past. */
  assumed: boolean;
  /** Metres from me at the cursor; null for my own machine or when I have no fix. */
  distanceM: number | null;
  /**
   * May the marker use a safety colour? Only a hazard whose data is live and fresh: a replayed,
   * simulated-and-stale or merely nearby machine is drawn in ink (visual-language state rules).
   */
  danger: boolean;
};

export type MapState = {
  t: number;
  /** 0..1 along the window. */
  fraction: number;
  atLive: boolean;
  me: { lat: number; lon: number; heading_deg: number | null; trail: LatLon[]; ageMs: number; stale: boolean; provenance: MapProvenance; assumed: boolean } | null;
  /** Own machine first, then hazards by distance, then everyone else by distance. */
  machines: MachineAt[];
  /** Guardian rings around me; `live` says whether they may use safety colours. */
  rings: { center: LatLon; danger_m: number; warning_m: number; live: boolean } | null;
  pins: Array<{ id: string; lat: number; lon: number; live: boolean }>;
  /** Events up to the cursor, newest last. */
  past: MapEvent[];
  /** The newest event at or before the cursor, or null. */
  latest: MapEvent | null;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Index of the last fix with t_ms <= t, or -1 when `t` is before the first. Fixes are sorted. */
function lastAtOrBefore(fixes: readonly Fix[], t: number): number {
  let lo = 0;
  let hi = fixes.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (fixes[mid].t_ms <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** The interpolated position at `t`, or null before the first fix. After the last it holds the last. */
export function positionAt(fixes: readonly Fix[], t: number): (LatLon & { index: number }) | null {
  const i = lastAtOrBefore(fixes, t);
  if (i < 0) return null;
  const a = fixes[i];
  const b = fixes[i + 1];
  if (!b || b.t_ms === a.t_ms) return { lat: a.lat, lon: a.lon, index: i };
  const k = clamp((t - a.t_ms) / (b.t_ms - a.t_ms), 0, 1);
  return { lat: lerp(a.lat, b.lat, k), lon: lerp(a.lon, b.lon, k), index: i };
}

/** The path drawn up to `t`: every fix already passed plus the interpolated head. */
export function pathUpTo(fixes: readonly Fix[], t: number): LatLon[] {
  const pos = positionAt(fixes, t);
  if (!pos) return [];
  const out: LatLon[] = fixes.slice(0, pos.index + 1).map((f) => ({ lat: f.lat, lon: f.lon }));
  const last = out[out.length - 1];
  if (last && (last.lat !== pos.lat || last.lon !== pos.lon)) out.push({ lat: pos.lat, lon: pos.lon });
  return out;
}

/** Heading from the most recent pair of path points that are visibly apart; null if none. */
export function headingOf(path: readonly LatLon[]): number | null {
  for (let i = path.length - 1; i > 0; i--) {
    if (distanceM(path[i - 1], path[i]) >= HEADING_MIN_M) return bearingDeg(path[i - 1], path[i]);
  }
  return null;
}

/** Visibly moving at `t`: displaced at least a couple of metres over the last 20 s. */
function movingAt(fixes: readonly Fix[], t: number, now: LatLon): boolean {
  const first = fixes[0];
  if (!first) return false;
  const before = positionAt(fixes, Math.max(first.t_ms, t - MOVING_LOOKBACK_MS));
  return before ? distanceM(before, now) >= MOVING_MIN_M : false;
}

/** Provenance of what the map shows: replayed when the cursor is in the past, else by field provenance. */
export function provenanceAt(atLive: boolean, assumed: boolean): MapProvenance {
  if (!atLive) return "replayed";
  return assumed ? "simulated" : "live";
}

/** The cursor to use when the user has not scrubbed: the live edge (null). A stored cursor is only clamped into the window. */
export function resolveCursor(cursor: number | null, model: Pick<MapModel, "startMs" | "endMs">): number {
  if (cursor === null) return model.endMs;
  return clamp(cursor, model.startMs, model.endMs);
}

/** A scrubbed time as the stored cursor: `null` (pinned live) when it is at the live edge. */
export function toCursor(t: number, endMs: number): number | null {
  return t >= endMs - LIVE_SNAP_MS ? null : t;
}

/** The previous or next event time relative to `t`, or null. Strictly before/after, so repeat presses advance. */
export function stepEvent(events: readonly MapEvent[], t: number, dir: -1 | 1): MapEvent | null {
  const sorted = [...events].sort((a, b) => a.t_ms - b.t_ms);
  if (dir === 1) return sorted.find((e) => e.t_ms > t + 500) ?? null;
  for (let i = sorted.length - 1; i >= 0; i--) if (sorted[i].t_ms < t - 500) return sorted[i];
  return null;
}

/** "just now" / "12 s ago" / "3 min ago" as parts, so the UI translates them. */
export function ageParts(ms: number): { kind: "now" } | { kind: "s"; n: number } | { kind: "min"; n: number } {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 3) return { kind: "now" };
  if (s < 60) return { kind: "s", n: s };
  return { kind: "min", n: Math.floor(s / 60) };
}

export function mapStateAt(model: MapModel, t: number): MapState {
  const tc = clamp(t, model.startMs, model.endMs);
  const atLive = tc >= model.endMs - LIVE_SNAP_MS;
  const provenance = provenanceAt(atLive, model.assumed);
  const span = Math.max(1, model.endMs - model.startMs);

  const mePos = positionAt(model.me, tc);
  const meTrail = pathUpTo(model.me, tc);
  const meAge = mePos ? tc - model.me[mePos.index].t_ms : 0;
  const me: MapState["me"] = mePos
    ? {
        lat: mePos.lat,
        lon: mePos.lon,
        heading_deg: headingOf(meTrail),
        trail: meTrail,
        ageMs: meAge,
        stale: meAge > STALE_MS,
        provenance,
        assumed: model.assumed,
      }
    : null;

  const hazardCodes = new Set(model.hazardCodes);
  const machines: MachineAt[] = [];
  for (const actor of model.actors) {
    const pos = positionAt(actor.track, tc);
    if (!pos) continue;
    const trail = pathUpTo(actor.track, tc);
    const ageMs = tc - actor.track[pos.index].t_ms;
    const stale = ageMs > STALE_MS;
    const dist = actor.own || !me ? null : distanceM(me, pos);
    const tier: MachineTier = actor.own
      ? "own"
      : actor.health !== "ok" || hazardCodes.has(actor.code) || (dist !== null && dist <= RING_M.warning)
        ? "hazard"
        : "other";
    machines.push({
      id: actor.id,
      code: actor.code,
      tier,
      lat: pos.lat,
      lon: pos.lon,
      heading_deg: headingOf(trail),
      moving: movingAt(actor.track, tc, pos),
      health: actor.health,
      trail,
      ageMs,
      stale,
      provenance,
      assumed: model.assumed,
      distanceM: dist,
      danger: tier === "hazard" && atLive && !stale,
    });
  }
  const rank: Record<MachineTier, number> = { own: 0, hazard: 1, other: 2 };
  machines.sort((a, b) => rank[a.tier] - rank[b.tier] || (a.distanceM ?? 0) - (b.distanceM ?? 0) || a.code.localeCompare(b.code));

  const past = model.events.filter((e) => e.t_ms <= tc).sort((a, b) => a.t_ms - b.t_ms);
  const eventTime = new Map(model.events.map((e) => [e.anomalyId, e.t_ms] as const));
  const pins = model.pins
    .filter((p) => {
      const at = p.t_ms ?? eventTime.get(p.id) ?? null;
      return at === null || at <= tc;
    })
    .map((p) => ({ id: p.id, lat: p.lat, lon: p.lon, live: atLive }));

  return {
    t: tc,
    fraction: (tc - model.startMs) / span,
    atLive,
    me,
    machines,
    rings: me ? { center: { lat: me.lat, lon: me.lon }, danger_m: RING_M.danger, warning_m: RING_M.warning, live: atLive && !me.stale } : null,
    pins,
    past,
    latest: past.length > 0 ? past[past.length - 1] : null,
  };
}

/** The alert kinds that belong on a map timeline. SOS, ledger and PPE are not about where machines are. */
const MAP_KINDS: ReadonlySet<string> = new Set<MapEventKind>(["guardian_hazard", "proximity_zone", "anomaly_machine", "idle_excess", "seatbelt_off_moving"]);

/** Timeline events from the store's alerts, inside the window, with the machine a Guardian hazard names. */
export function eventsFromAlerts(
  alerts: readonly AlertRecord[],
  guardian: Record<string, { anomaly_id: string; machine_code: string }>,
  guardianByAlert: Record<string, string>,
  startMs: number,
  endMs: number,
): MapEvent[] {
  const out: MapEvent[] = [];
  for (const a of alerts) {
    if (!MAP_KINDS.has(a.kind)) continue;
    const t = Date.parse(a.first_seen);
    if (!Number.isFinite(t) || t < startMs || t > endMs) continue;
    const anomalyId = guardianByAlert[a.alert_id] ?? null;
    const hazard = anomalyId ? guardian[anomalyId] : undefined;
    out.push({ id: a.alert_id, t_ms: t, kind: a.kind as MapEventKind, tier: a.tier, machineCode: hazard?.machine_code ?? null, anomalyId });
  }
  return out.sort((a, b) => a.t_ms - b.t_ms);
}

type ModelInput = {
  data: SiteMapData;
  /** Where I am (operator, else paired machine); null when this viewer has no position (FM). */
  me: LatLon | null;
  /** The code of my own machine, to label the own marker. */
  ownCode: string | null;
  /** Stamped once when the data was fetched (wall ms). Older fixes hang off it, so a paused cursor never drifts. */
  anchorMs: number;
  /** The newest frame (wall ms): only the NEWEST fix of each machine moves with it, so staleness is live. */
  freshMs: number;
  /** The live edge (wall ms now). */
  endMs: number;
  assumed: boolean;
  events: MapEvent[];
  pins: Array<{ id: string; lat: number; lon: number }>;
  hazardCodes: string[];
};

/** Spread `points` evenly over [anchor - span, anchor]; the last point is the newest fix. */
function spread(points: readonly LatLon[], anchorMs: number, spanMs: number): Fix[] {
  const n = points.length;
  return points.map((p, i) => ({ t_ms: n === 1 ? anchorMs : anchorMs - spanMs + (spanMs * i) / (n - 1), lat: p.lat, lon: p.lon }));
}

/** Re-time the newest fix to the latest frame (minus its own age), never before the fix preceding it. */
function freshen(fixes: Fix[], freshMs: number, lastAgoMs: number): Fix[] {
  if (fixes.length === 0) return fixes;
  const last = fixes[fixes.length - 1];
  const prev = fixes[fixes.length - 2];
  const t = Math.max(prev ? prev.t_ms : -Infinity, freshMs - lastAgoMs);
  return [...fixes.slice(0, -1), { ...last, t_ms: t }];
}

/**
 * The model for a viewer. Trails without per-fix times (the operator's trail) are spread evenly over
 * the window ending at the newest fix: the data has an order but no clock, and the map says so by
 * labelling it Simulated. Other machines carry `track` fixes with their age before the newest data.
 */
export function buildMapModel(input: ModelInput): MapModel {
  const { data, me, ownCode, anchorMs, freshMs, endMs } = input;
  const startMs = endMs - WINDOW_MS;
  const trail = data.trail.length > 0 ? data.trail : me ? [me] : [];
  const trailWithMe = me && trail.length > 0 && (trail[trail.length - 1].lat !== me.lat || trail[trail.length - 1].lon !== me.lon) ? [...trail, me] : trail;
  const meFixes = me && trailWithMe.length > 0 ? freshen(spread(trailWithMe, anchorMs, WINDOW_MS - 30_000), freshMs, 0) : [];

  const actors: MapActor[] = [];
  if (me) {
    actors.push({ id: "own", code: ownCode ?? "", own: true, health: "ok", track: meFixes });
  }
  for (const m of data.machines) {
    const source = m.track && m.track.length > 0 ? m.track : [{ ago_ms: 0, lat: m.lat, lon: m.lon }];
    const sorted = source.map((f) => ({ t_ms: anchorMs - f.ago_ms, lat: f.lat, lon: f.lon })).sort((a, b) => a.t_ms - b.t_ms);
    const track = freshen(sorted, freshMs, source.reduce((min, f) => Math.min(min, f.ago_ms), Infinity));
    actors.push({ id: m.id, code: m.code, own: false, health: m.health, track });
  }
  return {
    startMs,
    endMs,
    assumed: input.assumed,
    me: meFixes,
    actors,
    events: input.events,
    pins: input.pins.map((p) => ({ ...p, t_ms: null })),
    hazardCodes: input.hazardCodes,
  };
}
