import type { ReactNode } from "react";
import { Pictogram } from "@/components/ui/pictogram";
import { S2, S3, S4 } from "@/components/landing/shift";
import { fill } from "@/components/landing/shift-tape";

/**
 * Live readouts (landing v3 spec §3.5): one instrument plate per stage 2-4. Markup only; the engine
 * writes the figures with `driveReadout`. Values come from the scene's `getReadout()` when it exists
 * and otherwise from `settledValues`, a pure function of the stage progress built on shift.ts, so
 * the page reads correctly without the scene (no WebGL, reduced motion, scene not yet landed).
 * Every figure is simulated and the plate carries the SIM mark.
 */

export type RoPhase = "dig" | "swing" | "dump" | "return" | "travel";
export type RoValues = {
  boom: number;
  stick: number;
  bucket: number;
  phase: RoPhase;
  link: "online" | "held" | "sent";
  cycles: number;
  tonnes: number;
  trailPct: number;
  nearest: number | null;
  ring: 0 | 1 | 2 | 3 | 4;
  written: boolean;
};

/** The scene's `SceneReadout` (spec §8.3), restated so this file does not import scene code. */
export type LiveReadout = {
  boomDeg: number;
  stickDeg: number;
  bucketDeg: number;
  phase: RoPhase;
  cycles: number;
  trail: number;
  nearestM: number | null;
  ring: 0 | 1 | 2 | 3 | 4;
  replay: boolean;
};

export type RoMsgs = {
  /** Raw strings, {n} left in. */
  metres: string;
  held: string;
  sent: string;
  online: string;
  written: string;
  pending: string;
  none: string;
  truck: string;
  phases: Record<RoPhase, string>;
  states: Record<"clear" | "caution" | "warning" | "critical", string>;
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Where the haul truck is on the settled path: [p, metres to the excavator]. */
const NEAR_PTS: ReadonlyArray<readonly [number, number]> = [
  [S4.truckIn[0], 28],
  [0.3, 17.5],
  [S4.warnAt, 12],
  [S4.truckIn[1], S4.closestM],
  [S4.closest[1], S4.closestM],
  [S4.clear, 22],
  [1, 41],
];

export function nearestAt(p: number): number | null {
  if (p < S4.truckIn[0]) return null;
  for (let i = 1; i < NEAR_PTS.length; i++) {
    const [p0, d0] = NEAR_PTS[i - 1];
    const [p1, d1] = NEAR_PTS[i];
    if (p <= p1) return lerp(d0, d1, (p - p0) / (p1 - p0));
  }
  return NEAR_PTS[NEAR_PTS.length - 1][1];
}

export function ringAt(p: number): 0 | 1 | 2 | 3 | 4 {
  if (p < S4.truckIn[0]) return 0;
  if (p < 0.3) return 1;
  if (p < S4.warnAt) return 2;
  if (p < S4.caution) return 3;
  if (p < S4.clear) return 2;
  return 1;
}

export function linkAt(p: number): RoValues["link"] {
  return p >= S2.linkDown[1] ? "sent" : p >= S2.linkDown[0] ? "held" : "online";
}

/** The readout for a stage at progress p, from shift.ts alone. Pure. */
export function settledValues(stage: 2 | 3 | 4, p: number): RoValues {
  const trail = clamp01(p / S3.draw[1]);
  const p4 = stage === 4 ? p : 1;
  return {
    boom: 34,
    stick: 61,
    bucket: 22,
    phase: "dig",
    link: stage === 2 ? linkAt(p) : "online",
    cycles: stage === 3 ? Math.round(S3.cycles * trail) : S3.cycles,
    tonnes: stage === 3 ? Math.round(S3.tonnes * trail) : S3.tonnes,
    trailPct: stage === 3 ? Math.round(trail * 100) : 100,
    nearest: nearestAt(p4),
    ring: ringAt(p4),
    written: stage === 4 ? p >= S4.warnAt : true,
  };
}

/** Prefer the scene's live figures where it has them; the link and the ledger row stay shift-driven. */
export function liveValues(stage: 2 | 3 | 4, p: number, live: LiveReadout | undefined): RoValues {
  const base = settledValues(stage, p);
  if (!live) return base;
  const trail = clamp01(live.trail);
  return {
    ...base,
    boom: live.boomDeg,
    stick: live.stickDeg,
    bucket: live.bucketDeg,
    phase: live.phase,
    cycles: stage === 3 ? live.cycles : base.cycles,
    tonnes: stage === 3 ? Math.round(S3.tonnes * trail) : base.tonnes,
    trailPct: stage === 3 ? Math.round(trail * 100) : base.trailPct,
    nearest: stage === 4 ? live.nearestM : base.nearest,
    ring: stage === 4 ? live.ring : base.ring,
  };
}

export function toneOf(ring: number): "clear" | "caution" | "warning" | "critical" {
  return ring >= 4 ? "critical" : ring === 3 ? "warning" : ring === 2 ? "caution" : "clear";
}

/** The text each `data-ro` node should read for these values. Pure, so it can be tested. */
export function roText(v: RoValues, m: RoMsgs): Record<string, string> {
  return {
    boom: `${Math.round(v.boom)}°`,
    stick: `${Math.round(v.stick)}°`,
    bucket: `${Math.round(v.bucket)}°`,
    phase: m.phases[v.phase],
    link: v.link === "online" ? m.online : fill(v.link === "held" ? m.held : m.sent, { n: 2 }),
    cycles: String(v.cycles),
    tonnes: `${v.tonnes} t`,
    trail: `${v.trailPct} %`,
    nearest: v.nearest === null ? "–" : v.nearest.toFixed(1),
    unit: v.nearest === null ? "" : fill(m.metres, { n: "" }).trim(),
    who: v.nearest === null ? m.none : m.truck,
    state: m.states[toneOf(v.ring)],
    ledger: v.written ? fill(m.written, { n: 4 }) : m.pending,
  };
}

export type RoLabels = {
  sim: string;
  boom: string;
  stick: string;
  bucket: string;
  phase: string;
  link: string;
  cycles: string;
  tonnes: string;
  trail: string;
  nearest: string;
  shownIn: string;
  shownWhere: string;
  ledger: string;
  /** SIM plate text. */
  simMark: string;
};

function Row({ label, k, text }: { label: string; k: string; text: string }) {
  return (
    <li>
      <span>{label}</span>
      <span data-ro={k}>{text}</span>
    </li>
  );
}

function Head({ title, mark }: { title: string; mark: string }) {
  return (
    <div className="l-ro-head" data-chrome>
      <span>{title}</span>
      <span className="l-sim">{mark}</span>
    </div>
  );
}

/** One plate. `stage` picks the layout; the values are the server-render settled ones. */
export function Readout({ stage, labels, msgs, values, children }: { stage: 2 | 3 | 4; labels: RoLabels; msgs: RoMsgs; values: RoValues; children?: ReactNode }) {
  const tx = roText(values, msgs);
  const tone = toneOf(values.ring);
  return (
    <aside className="l-readout" data-ro-stage={stage} aria-label={labels.sim}>
      {stage === 2 ? (
        <>
          <Head title={labels.sim} mark={labels.simMark} />
          <div className="l-ro-big">
            <span className="l-ro-v" data-ro="boom">
              {tx.boom}
            </span>
            <span className="l-ro-what">{labels.boom}</span>
          </div>
          <ul className="l-ro-rows">
            <Row label={labels.stick} k="stick" text={tx.stick} />
            <Row label={labels.bucket} k="bucket" text={tx.bucket} />
            <Row label={labels.phase} k="phase" text={tx.phase} />
            <Row label={labels.link} k="link" text={tx.link} />
          </ul>
        </>
      ) : null}
      {stage === 3 ? (
        <>
          <Head title={labels.sim} mark={labels.simMark} />
          <div className="l-ro-big">
            <span className="l-ro-v" data-ro="cycles">
              {tx.cycles}
            </span>
            <span className="l-ro-what">{labels.cycles}</span>
          </div>
          <ul className="l-ro-rows">
            <Row label={labels.tonnes} k="tonnes" text={tx.tonnes} />
            <Row label={labels.trail} k="trail" text={tx.trail} />
          </ul>
        </>
      ) : null}
      {stage === 4 ? (
        <>
          <Head title={labels.nearest} mark={labels.simMark} />
          <div className="l-ro-big">
            <span className="l-ro-v" data-ro="nearest">
              {tx.nearest}
            </span>
            <span className="l-ro-u" data-ro="unit">
              {tx.unit}
            </span>
            <span className="l-ro-what" data-ro="who">
              {tx.who}
            </span>
          </div>
          <div className="l-ro-state" data-state={tone} data-ro-state>
            <span className="l-ro-sign" aria-hidden="true">
              <Pictogram name="proximity" shape="circle" />
              <Pictogram name="proximity" shape="triangle" />
              <Pictogram name="proximity" shape="octagon" />
            </span>
            <span data-ro="state">{tx.state}</span>
          </div>
          <ul className="l-ro-rows">
            <li>
              <span>{labels.shownIn}</span>
              <span>{labels.shownWhere}</span>
            </li>
            <Row label={labels.ledger} k="ledger" text={tx.ledger} />
          </ul>
        </>
      ) : null}
      {children}
    </aside>
  );
}

type RoNodes = { stage: 2 | 3 | 4; el: HTMLElement; nodes: Map<string, HTMLElement>; state: HTMLElement | null; last: Map<string, string>; lastTone: string };

export function findReadouts(root: ParentNode): RoNodes[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-ro-stage]")).map((el) => ({
    stage: Number(el.dataset.roStage) as 2 | 3 | 4,
    el,
    nodes: new Map(Array.from(el.querySelectorAll<HTMLElement>("[data-ro]")).map((n) => [n.dataset.ro as string, n])),
    state: el.querySelector<HTMLElement>("[data-ro-state]"),
    last: new Map(),
    lastTone: "",
  }));
}

/** Write one plate. Text goes through textContent on cached nodes, and only when it changed. */
export function driveReadout(r: RoNodes, v: RoValues, m: RoMsgs): void {
  const tx = roText(v, m);
  for (const [k, node] of r.nodes) {
    const t = tx[k];
    if (t === undefined || r.last.get(k) === t) continue;
    node.textContent = t;
    r.last.set(k, t);
  }
  const tone = toneOf(v.ring);
  if (r.state && r.lastTone !== tone) {
    r.state.dataset.state = tone;
    r.lastTone = tone;
  }
}
