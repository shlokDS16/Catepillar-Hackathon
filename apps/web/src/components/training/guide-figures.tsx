import type { GuideFigureId } from "@/training/guide-steps";

/**
 * The four figures of "How practice works". Each one DEMONSTRATES its phase rather than decorating
 * it, inside the training motion carve-out (visual-language §5.1):
 *
 * - `read`   Brief: three lines of the situation write themselves in order, and the countdown bar
 *            below stays dashed and empty. Teaches "you are told what happened, with no clock".
 * - `fan`    Investigate: a stack of evidence cards fans into the grid, two are stamped ① and ②,
 *            and the one that did not matter stays shut and dims. Teaches "pick what matters, and
 *            the order is recorded".
 * - `clock`  Decide: the same bar shape as the Brief, now draining linearly, and a choice is taken
 *            before it empties. Teaches "this part is timed, and an unanswered step is a miss".
 * - `trace`  Debrief: the safest route sits there dashed; your route draws itself over it, parts
 *            company and rejoins, then the three scores fill. Teaches "you see your path against
 *            the ideal, and the numbers come from it".
 *
 * All four are ink on paper only: a filled safety colour always means a live state, never a replay
 * (visual-language §1.1). They are pure decoration layered under real text, so the whole SVG is
 * aria-hidden; every idea in them is also written in the step's sentence.
 *
 * Motion technique: each animated element's BASE style is its FINAL state and every keyframe set
 * only describes where it starts (`animation-fill-mode: both` holds that during the delay). So
 * `prefers-reduced-motion: reduce` collapses the whole figure to its finished picture with a
 * single `animation: none`, with nothing left to autoplay.
 */
export function GuideFigure({ figure }: { figure: GuideFigureId }) {
  return (
    <svg className="guide-fig" data-figure={figure} viewBox="0 0 160 96" aria-hidden="true" focusable="false">
      {figure === "read" ? <ReadFigure /> : null}
      {figure === "fan" ? <FanFigure /> : null}
      {figure === "clock" ? <ClockFigure /> : null}
      {figure === "trace" ? <TraceFigure /> : null}
    </svg>
  );
}

/* Brief: the situation writes itself; the clock track below is empty and dashed. */
function ReadFigure() {
  return (
    <g>
      <rect className="gf-plate" x="6" y="8" width="148" height="60" />
      {/* A speaker: the situation is read aloud once (T2). */}
      <path className="gf-speaker" d="M16 18 h5 l7 -6 v18 l-7 -6 h-5 Z" />
      <path className="gf-wave" d="M32 17 q5 6 0 12" style={{ "--gf-i": 0 } as React.CSSProperties} />
      <path className="gf-wave" d="M38 13 q8 10 0 20" style={{ "--gf-i": 1 } as React.CSSProperties} />
      <rect className="gf-line" x="16" y="40" width="124" height="5" style={{ "--gf-i": 0 } as React.CSSProperties} />
      <rect className="gf-line" x="16" y="50" width="132" height="5" style={{ "--gf-i": 1 } as React.CSSProperties} />
      <rect className="gf-line" x="16" y="60" width="86" height="5" style={{ "--gf-i": 2 } as React.CSSProperties} />
      {/* The clock track, empty: the Brief is untimed (D11 decision 2). Decide reuses this shape. */}
      <rect className="gf-track gf-track-off" x="6" y="78" width="148" height="10" />
    </g>
  );
}

/* Investigate: cards fan out, two are opened in order, the distractor stays shut. */
const FAN_CARDS = [
  { x: 6, y: 8, from: "translate(34px, 26px) rotate(-7deg)" },
  { x: 88, y: 8, from: "translate(-34px, 26px) rotate(6deg)" },
  { x: 6, y: 52, from: "translate(34px, -18px) rotate(5deg)" },
  { x: 88, y: 52, from: "translate(-34px, -18px) rotate(-6deg)" },
];

function FanFigure() {
  return (
    <g>
      {FAN_CARDS.map((card, i) => (
        <g
          key={card.x + card.y}
          className="gf-card"
          data-dim={i === 3 ? "" : undefined}
          style={{ "--gf-i": i, "--gf-from": card.from } as React.CSSProperties}
        >
          <rect className="gf-plate" x={card.x} y={card.y} width="66" height="36" />
          <rect className="gf-line" x={card.x + 10} y={card.y + 22} width="38" height="4" />
          <circle className="gf-dot" cx={card.x + 16} cy={card.y + 13} r="4" />
        </g>
      ))}
      {/* The order stamp: an opened card is numbered where it was opened, not where it sits. */}
      <GuideStamp x={59} y={11} n="1" order={0} />
      <GuideStamp x={59} y={55} n="2" order={1} />
    </g>
  );
}

function GuideStamp({ x, y, n, order }: { x: number; y: number; n: string; order: number }) {
  return (
    <g className="gf-stamp" style={{ "--gf-i": order } as React.CSSProperties}>
      <rect x={x} y={y} width="16" height="16" />
      <text x={x + 8} y={y + 12} fontSize="12" textAnchor="middle">
        {n}
      </text>
    </g>
  );
}

/* Decide: the bar drains linearly and one choice is taken before it empties. */
function ClockFigure() {
  return (
    <g>
      <rect className="gf-line" x="6" y="10" width="86" height="5" />
      <rect className="gf-plate" x="6" y="26" width="70" height="36" />
      <rect className="gf-plate" x="84" y="26" width="70" height="36" />
      <rect className="gf-line" x="18" y="42" width="40" height="4" />
      <rect className="gf-line" x="96" y="42" width="40" height="4" />
      {/* The chosen plate: ink fill with the tick cut out of it, like Mark kind="check". */}
      <g className="gf-pick">
        <rect x="6" y="26" width="70" height="36" />
        <path d="M30 44 l7 7 l14 -16" />
      </g>
      <rect className="gf-track" x="6" y="78" width="148" height="10" />
      <rect className="gf-fill" x="6" y="78" width="148" height="10" />
    </g>
  );
}

/* Debrief: your route draws itself over the safest route, then the three scores fill. */
const IDEAL_PATH = "M10 54 L44 36 L80 32 L116 42 L150 24";
const YOUR_PATH = "M10 54 L42 50 L72 62 L108 54 L150 24";
const SCORE_BARS = [
  { x: 10, v: 0.78 },
  { x: 58, v: 0.62 },
  { x: 106, v: 0.9 },
];

function TraceFigure() {
  return (
    <g>
      <path className="gf-ideal" d={IDEAL_PATH} />
      <path className="gf-your" d={YOUR_PATH} />
      <circle className="gf-flag" cx="150" cy="24" r="5" />
      {SCORE_BARS.map((bar) => (
        <g key={bar.x}>
          <rect className="gf-track" x={bar.x} y="78" width="44" height="10" />
          <rect className="gf-score" x={bar.x} y="78" width="44" height="10" style={{ "--gf-v": bar.v } as React.CSSProperties} />
        </g>
      ))}
    </g>
  );
}
