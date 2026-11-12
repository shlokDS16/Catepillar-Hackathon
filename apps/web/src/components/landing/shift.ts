/** Landing v3 shared timeline (docs/design/landing-v3-spec.md §8.3). Frozen: A and B read it, neither edits it. */
export const SHIFT = { start: 360, end: 840 } as const; // minutes after midnight, 06:00-14:00
export type Tier = "info" | "caution" | "warning" | "critical";
export const ENTRIES = [
  { n: 1, at: 392, type: "seatbelt_breach", severity: 3, tier: "caution", stage: 2, p: 0.2 },
  { n: 2, at: 485, type: "idle_excess", severity: 1, tier: "info", stage: 3, p: 0.25 },
  { n: 3, at: 530, type: "overspeed", severity: 2, tier: "caution", stage: 3, p: 0.5 },
  { n: 4, at: 644, type: "proximity_warning", severity: 4, tier: "warning", stage: 4, p: 0.45 },
  { n: 5, at: 725, type: "slope_alert", severity: 2, tier: "caution", stage: 5, p: 0.711 },
  { n: 6, at: 800, type: "seatbelt_breach", severity: 3, tier: "caution", stage: 5, p: 0.9 },
] as const;
/** Tape sentences: [minute, message key under landing.tape.lines, params]. */
export const LINES: ReadonlyArray<readonly [number, string, Record<string, number>?]> = [
  [360, "open"], [372, "move"], [380, "dig"], [392, "belt"], [401, "beltOn"], [416, "noSignal", { n: 2 }],
  [428, "signalBack", { n: 2 }], [440, "load"], [485, "idle", { m: 11 }], [530, "overspeed"], [630, "truck"],
  [644, "proximity"], [655, "backOut"], [725, "slope"], [800, "belt2"], [840, "closed"],
];
export const RANGES: Record<1 | 2 | 3 | 4, readonly [number, number]> = { 1: [360, 380], 2: [380, 440], 3: [440, 620], 4: [630, 660] };
export const S2 = { callouts: [0.1, 0.25, 0.45], seatbeltOff: [0.2, 0.35], linkDown: [0.6, 0.8] } as const;
export const S3 = { draw: [0, 0.85], cycles: 14, tonnes: 620 } as const;
export const S4 = { ringsGrow: [0, 0.3], truckIn: [0.12, 0.62], warnAt: 0.45, closest: [0.62, 0.8], closestM: 7.4, caution: 0.8, clear: 0.9 } as const;
export const S5 = { rewind: [0, 0.55], rewindTo: 644, from: 660, dim: [0.6, 1], dimMax: 0.6 } as const;
export const BANDS_VH = { desk: [70, 200, 200, 220, 160], phone: [30, 140, 140, 160, 110], hold: 100 } as const;

/** Clock minutes and mode for the 5 scene progresses (ps[0..4]). Pure; used by the tape and by tests. */
export function shiftClock(ps: readonly number[]): { minutes: number; replay: boolean } {
  const c = (v: number) => Math.min(1, Math.max(0, v));
  const lerp = (a: number, b: number, t: number) => a + (b - a) * c(t);
  let s = 0;
  for (let i = 0; i < 5; i++) if ((ps[i] ?? 0) > 0) s = i;
  const p = ps[s] ?? 0;
  if (s === 4) return p < S5.rewind[1] ? { minutes: lerp(S5.from, S5.rewindTo, p / S5.rewind[1]), replay: true } : { minutes: lerp(S5.from, SHIFT.end, (p - S5.rewind[1]) / (1 - S5.rewind[1])), replay: false };
  const [a, b] = RANGES[(s + 1) as 1 | 2 | 3 | 4];
  return { minutes: lerp(a, b, p), replay: false };
}
