import type { CSSProperties } from "react";
import { ENTRIES, LINES, SHIFT, shiftClock } from "@/components/landing/shift";

/**
 * The shift tape (landing v3 spec §3.3): a clock, a 06:00-14:00 timeline with the six ledger entries
 * as ticks, and one sentence for "now". It is markup only (no hooks): the engine finds the nodes by
 * their `data-tape-*` attributes and writes them from the scroll position, never through React state.
 * `driveTape` is that writer; `tapeState` is the pure function behind it (and behind the unit tests).
 */

export type TapeMsgs = {
  /** Raw (unformatted) strings for `landing.tape.lines.*`, with {n} and {m} left in. */
  lines: Record<string, string>;
  /** `landing.tape.entry`, "Ledger entry {n}". */
  entry: string;
  /** `landing.tape.replay`. */
  replay: string;
  /** `landing.tape.clock`. */
  clock: string;
};

export type TapeState = {
  time: string;
  /** "HH:MM" plus the entry, or REPLAY. */
  kicker: string;
  sentence: string;
  mode: string;
  replay: boolean;
  /** Share of the shift elapsed, 0..1. */
  at: number;
  /** Highest stamped entry number, 0 when none. */
  current: number;
  stamped: number[];
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Minutes after midnight to "HH:MM". */
export function fmtClock(minutes: number): string {
  const m = Math.floor(minutes + 1e-6);
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function fill(tpl: string, params?: Record<string, number | string>): string {
  return params ? tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`)) : tpl;
}

/** Index in LINES of the sentence in force at `minutes`. */
export function lineIndexAt(minutes: number): number {
  let k = 0;
  for (let i = 0; i < LINES.length; i++) if (LINES[i][0] <= minutes + 1e-6) k = i;
  return k;
}

/** Everything the tape shows for a clock reading. Pure. */
export function tapeState(minutes: number, replay: boolean, msgs: TapeMsgs): TapeState {
  const time = fmtClock(minutes);
  const stamped = ENTRIES.filter((e) => minutes + 1e-6 >= e.at).map((e) => e.n as number);
  const current = stamped.length ? Math.max(...stamped) : 0;
  const at = Math.min(1, Math.max(0, (minutes - SHIFT.start) / (SHIFT.end - SHIFT.start)));
  if (replay) {
    return {
      time,
      kicker: `${time} · ${msgs.replay.toUpperCase()} · ${fill(msgs.entry, { n: 4 }).toUpperCase()}`,
      sentence: fill(msgs.lines.replay),
      mode: msgs.replay,
      replay: true,
      at,
      current,
      stamped,
    };
  }
  const [lineAt, key, params] = LINES[lineIndexAt(minutes)];
  const entry = ENTRIES.find((e) => e.at === lineAt);
  return {
    time,
    kicker: entry ? `${fmtClock(lineAt)} · ${fill(msgs.entry, { n: entry.n }).toUpperCase()}` : fmtClock(lineAt),
    sentence: fill(msgs.lines[key] ?? key, params),
    mode: msgs.clock,
    replay: false,
    at,
    current,
    stamped,
  };
}

/** Tape state for the five scene progresses. */
export function tapeFromScroll(ps: readonly number[], msgs: TapeMsgs): TapeState {
  const { minutes, replay } = shiftClock(ps);
  return tapeState(minutes, replay, msgs);
}

/** The minute each stage rests on when its still is shown (reduced motion, no script). */
export const SETTLED_MINUTES: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 372, 2: 428, 3: 530, 4: 644, 5: 840 };

type Style = CSSProperties & Record<`--${string}`, string | number>;

const pct = (minutes: number) => ((minutes - SHIFT.start) / (SHIFT.end - SHIFT.start)) * 100;

/** Triangle (caution, warning) or square (info), the product's sign shapes at tick size. */
function TickShape({ tier }: { tier: string }) {
  return (
    <svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true" focusable="false">
      {tier === "info" ? <rect x="2.5" y="2.5" width="11" height="11" /> : <path d="M8 1.5 15 14.5H1Z" />}
    </svg>
  );
}

export type TapeLabels = {
  label: string;
  clock: string;
  sim: string;
  /** Accessible name of each tick, already formatted, in ENTRIES order. */
  goEntry: string[];
  /** Initial tape state for the server render. */
  initial: TapeState;
};

export function ShiftTape({ labels }: { labels: TapeLabels }) {
  const init = labels.initial;
  return (
    <div className="l-tape" role="group" aria-label={labels.label} data-tape data-replay={init.replay ? "1" : undefined}>
      <div className="l-tape-clock" data-chrome>
        <span className="l-tape-t" aria-hidden="true" data-tape-clock>
          {init.time}
        </span>
        <span className="l-tape-l">
          <span className="l-sim">{labels.sim}</span>
          <span data-tape-mode>{init.mode}</span>
        </span>
      </div>
      <div className="l-tape-line" data-chrome>
        <div className="l-tape-rail" aria-hidden="true">
          <i className="l-tape-done" data-tape-done style={{ width: `${init.at * 100}%` }} />
          <i className="l-tape-ghost" data-tape-ghost />
        </div>
        {[360, 480, 600, 720, 840].map((m) => (
          <span key={m} className="l-hour" aria-hidden="true" style={{ left: `${pct(m)}%` }}>
            {fmtClock(m)}
          </span>
        ))}
        {ENTRIES.map((e, i) => (
          <a
            key={e.n}
            className="l-tick"
            href={`#stage-${e.stage}`}
            data-tick={e.n}
            data-tier={e.tier}
            data-on={init.stamped.includes(e.n) ? "1" : undefined}
            style={{ left: `${pct(e.at)}%` } as Style}
            aria-label={labels.goEntry[i]}
          >
            <span className="l-tick-n" aria-hidden="true">
              {e.n}
            </span>
            <TickShape tier={e.tier} />
          </a>
        ))}
        <span className="l-head" aria-hidden="true" data-tape-head style={{ left: `${init.at * 100}%` }} />
      </div>
      <p className="l-tape-now" aria-live="off">
        <span className="l-tape-k" data-tape-k>
          {init.kicker}
        </span>
        <span className="l-tape-s" data-tape-s>
          {init.sentence}
        </span>
      </p>
    </div>
  );
}

/** A static strip for one stage's still (reduced motion and no script): its clock and its sentence. */
export function TapeStrip({ state, sim }: { state: TapeState; sim: string }) {
  return (
    <div className="l-tape-static">
      <span className="l-tape-static-t" data-chrome>
        {state.time}
        <span className="l-sim">{sim}</span>
      </span>
      <span className="l-tape-static-s">
        <span className="l-tape-k">{state.kicker}</span>
        <span className="l-tape-s">{state.sentence}</span>
      </span>
    </div>
  );
}

type TapeNodes = {
  el: HTMLElement;
  clock: HTMLElement | null;
  mode: HTMLElement | null;
  k: HTMLElement | null;
  s: HTMLElement | null;
  head: HTMLElement | null;
  done: HTMLElement | null;
  ghost: HTMLElement | null;
  ticks: HTMLElement[];
  last: { time?: string; kicker?: string; sentence?: string; mode?: string; replay?: boolean; at?: number; current?: number; stamped?: string };
};

export function findTape(root: ParentNode): TapeNodes | null {
  const el = root.querySelector<HTMLElement>("[data-tape]");
  if (!el) return null;
  const q = (s: string) => el.querySelector<HTMLElement>(s);
  return {
    el,
    clock: q("[data-tape-clock]"),
    mode: q("[data-tape-mode]"),
    k: q("[data-tape-k]"),
    s: q("[data-tape-s]"),
    head: q("[data-tape-head]"),
    done: q("[data-tape-done]"),
    ghost: q("[data-tape-ghost]"),
    ticks: Array.from(el.querySelectorAll<HTMLElement>("[data-tick]")),
    last: {},
  };
}

const EVENT_AT = pct(ENTRIES[3].at);

/** Write a tape state into the DOM: only the nodes whose value changed are touched. */
export function driveTape(n: TapeNodes, st: TapeState, animate: boolean): void {
  const l = n.last;
  if (l.time !== st.time && n.clock) n.clock.textContent = st.time;
  if (l.mode !== st.mode && n.mode) n.mode.textContent = st.mode;
  if (l.kicker !== st.kicker && n.k) n.k.textContent = st.kicker;
  if (l.sentence !== st.sentence && n.s) {
    n.s.textContent = st.sentence;
    // 120 ms vertical mask slide; the sentence never drops below half opacity (spec §3.3).
    if (animate && l.sentence !== undefined && n.s.animate) n.s.animate([{ transform: "translateY(55%)", opacity: 0.55 }, { transform: "none", opacity: 1 }], { duration: 120, easing: "cubic-bezier(0.22,1,0.36,1)" });
  }
  if (l.replay !== st.replay) {
    if (st.replay) n.el.setAttribute("data-replay", "1");
    else n.el.removeAttribute("data-replay");
  }
  if (l.at !== st.at) {
    const p = st.at * 100;
    if (n.head) n.head.style.left = `${p}%`;
    if (n.done) n.done.style.width = `${st.replay ? Math.min(p, EVENT_AT) : p}%`;
    if (n.ghost) {
      n.ghost.style.left = `${EVENT_AT}%`;
      n.ghost.style.width = st.replay ? `${Math.max(0, p - EVENT_AT)}%` : "0%";
    }
  }
  const key = st.stamped.join(",");
  if (l.stamped !== key || l.current !== st.current) {
    for (const t of n.ticks) {
      const num = Number(t.dataset.tick);
      const on = st.stamped.includes(num);
      const was = t.dataset.on === "1";
      if (on && !was) {
        t.dataset.on = "1";
        if (animate) {
          t.removeAttribute("data-pop");
          void t.offsetWidth;
          t.setAttribute("data-pop", "1");
        }
      } else if (!on && was) {
        delete t.dataset.on;
        t.removeAttribute("data-pop");
      }
      if (num === st.current) t.dataset.cur = "1";
      else delete t.dataset.cur;
    }
  }
  n.last = { time: st.time, kicker: st.kicker, sentence: st.sentence, mode: st.mode, replay: st.replay, at: st.at, current: st.current, stamped: key };
}
