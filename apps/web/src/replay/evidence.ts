/**
 * Investigate (S5b phase 2, interaction-map §4.5 T3/T4): the pure part of the evidence grid.
 *
 * Opening a card is scored as process (D10: which cards, and in what order), so the order stamps
 * and the `max_open` limit are rules, not decoration. They live here, tested in node, and the grid
 * component only draws what these functions say. The machine owns `openOrder`; these read it.
 */
import type { EvidenceCard } from "@cat/shared";
import { planProject, type LatLon } from "@/map/site-map";

export type EvidenceType = EvidenceCard["type"];
export type MapSnapshotCard = Extract<EvidenceCard, { type: "map_snapshot" }>;

/**
 * The plate's state in the grid:
 * - `opened`: it carries its order stamp and can be re-opened for free (T3, never re-recorded);
 * - `available`: not opened yet, and the limit still allows one more;
 * - `locked`: `max_open` is reached, so this plate is disabled with the reason "Limit reached".
 */
export type PlateState = "opened" | "available" | "locked";

/** 1-based position in `open_order`, or null when the card has not been opened. */
export function orderStamp(openOrder: readonly string[], cardId: string): number | null {
  const i = openOrder.indexOf(cardId);
  return i === -1 ? null : i + 1;
}

/** `max_open` is a hard limit (UI-20): null means no limit at all. */
export function limitReached(openOrder: readonly string[], maxOpen: number | null): boolean {
  return maxOpen !== null && openOrder.length >= maxOpen;
}

export function plateState(openOrder: readonly string[], maxOpen: number | null, cardId: string): PlateState {
  if (openOrder.includes(cardId)) return "opened";
  return limitReached(openOrder, maxOpen) ? "locked" : "available";
}

/** [Decide now] is disabled until one card is opened (T4); the reason is shown under the label. */
export function canDecideNow(openOrder: readonly string[]): boolean {
  return openOrder.length > 0;
}

/**
 * The arrow's rotation for the wind card. `from_deg` is where the wind comes FROM (the met
 * convention), and the arrow is drawn pointing the way the air travels, so it is the opposite
 * bearing. The label always names the *from* direction, so the two can never be read backwards.
 */
export function windArrowDeg(fromDeg: number): number {
  return (((fromDeg + 180) % 360) + 360) % 360;
}

/** The five state words we have ink for; any other severity string is shown as the server sent it. */
const SEVERITY_WORDS = ["clear", "caution", "warning", "critical", "nosignal"] as const;
export type SeverityWord = (typeof SEVERITY_WORDS)[number];

/** Maps a fault code's free-text severity onto an `enums.safety.*` key, or null when it is unknown. */
export function severityWord(raw: string): SeverityWord | null {
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const direct = SEVERITY_WORDS.find((w) => w === key);
  if (direct) return direct;
  if (key === "no_signal") return "nosignal";
  if (key === "info" || key === "information") return "clear";
  return null;
}

/** The mean of a polygon's corners, in projected metres: where a zone's name is written. */
export function planCentroid(points: readonly LatLon[], center: LatLon): { x: number; y: number } | null {
  if (points.length === 0) return null;
  const xs = points.map((p) => planProject(p, center));
  return {
    x: xs.reduce((a, p) => a + p.x, 0) / xs.length,
    y: xs.reduce((a, p) => a + p.y, 0) / xs.length,
  };
}

/**
 * Where the ⚑ goes on the map snapshot: the machine's last recorded position, because the window
 * the server builds ends at the event (the same assumption the trend chart's flag makes). The
 * trail's last point is the fallback, and the card's own centre the last resort, so a snapshot
 * with no track still draws.
 */
export function flagPoint(card: MapSnapshotCard): LatLon {
  const track = card.machine_track.at(-1);
  if (track) return { lat: track.lat, lon: track.lon };
  const trail = card.trail.at(-1);
  if (trail) return { lat: trail.lat, lon: trail.lon };
  return card.center;
}

/** Every lat/lon the snapshot has to fit inside its viewBox. */
export function snapshotPoints(card: MapSnapshotCard): LatLon[] {
  return [
    ...card.zones.flatMap((z) => z.polygon),
    ...card.trail.map((p) => ({ lat: p.lat, lon: p.lon })),
    ...card.machine_track.map((p) => ({ lat: p.lat, lon: p.lon })),
    card.center,
  ];
}
