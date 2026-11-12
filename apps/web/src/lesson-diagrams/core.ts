/**
 * Lesson diagram system: a diagram is a pure function of time (`at(t)`) plus caption cues and
 * three still times for reduced motion. Rendering (SVG) and the clock (requestAnimationFrame) live
 * elsewhere, so every frame is unit-testable. Motion budget: visual-language §5.1 (lessons).
 */
export type Cue = { at: number; key: string };

export type Diagram<F> = {
  id: string;
  /** seconds; the diagram plays once, never loops. */
  duration: number;
  /** caption cues by start time (seconds), in order; `key` is a message id under lesson.anim. */
  cues: Cue[];
  /** three times (seconds) whose frames stand in for the animation under reduced motion. */
  stills: [number, number, number];
  at: (t: number) => F;
};

export const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** 0..1 progress of t inside [from, to]. */
export const seg = (t: number, from: number, to: number) => clamp((t - from) / (to - from));
export const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
export const easeIn = (k: number) => k * k;
export const easeOut = (k: number) => 1 - (1 - k) * (1 - k);

/** The caption cue active at time t (the first cue is active from 0). */
export function cueAt(cues: Cue[], t: number): Cue {
  let cur = cues[0]!;
  for (const c of cues) {
    if (c.at <= t) cur = c;
    else break;
  }
  return cur;
}

/** Smallest t in [lo, hi] where f(t) >= target, for a non-decreasing f. */
export function solveTime(f: (t: number) => number, target: number, lo: number, hi: number): number {
  let a = lo;
  let b = hi;
  for (let i = 0; i < 40; i++) {
    const m = (a + b) / 2;
    if (f(m) >= target) b = m;
    else a = m;
  }
  return b;
}

/** The player clock as a reducer: play once, pause, scrub, replay. Never loops. */
export type Clock = { t: number; playing: boolean; ended: boolean };
export type ClockAction =
  | { type: "tick"; dt: number }
  | { type: "play" }
  | { type: "pause" }
  | { type: "toggle" }
  | { type: "seek"; t: number };

export const MAX_TICK = 0.1; // seconds: a backgrounded tab must not skip the animation

export function startClock(autoplay: boolean): Clock {
  return { t: 0, playing: autoplay, ended: false };
}

export function clockReduce(c: Clock, a: ClockAction, duration: number): Clock {
  switch (a.type) {
    case "tick": {
      if (!c.playing) return c;
      const t = c.t + clamp(a.dt, 0, MAX_TICK);
      return t >= duration ? { t: duration, playing: false, ended: true } : { t, playing: true, ended: false };
    }
    case "play":
      return c.ended || c.t >= duration ? { t: 0, playing: true, ended: false } : { ...c, playing: true };
    case "pause":
      return { ...c, playing: false };
    case "toggle":
      return clockReduce(c, { type: c.playing ? "pause" : "play" }, duration);
    case "seek": {
      const t = clamp(a.t, 0, duration);
      return { t, playing: false, ended: t >= duration };
    }
  }
}
