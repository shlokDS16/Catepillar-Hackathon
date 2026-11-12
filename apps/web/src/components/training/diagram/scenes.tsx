import { useId } from "react";
import { C, CONE_AXES, CONE_HALF, CONE_R, RING_R, WORKER_FROM, WORKER_TO, type BlindFrame } from "@/lesson-diagrams/blindspot";
import type { CompareFrame } from "@/lesson-diagrams/compare";
import { GAUGE_MAX_DEG, LIMIT_DEG, P, type Figure } from "@/lesson-diagrams/roll";
import type { RolloverFrame } from "@/lesson-diagrams/rollover";

/**
 * SVG scenes for the lesson diagrams: ink line art on paper. Hazard is told in ink, never in a
 * safety colour (visual-language §5.1): a hatched band, a heavier stroke, an inverted chip, and the
 * endangered person filled solid against the safe person outlined. Generic machine silhouettes.
 * Class rules live in styles/lesson-anim.css; every colour is a token.
 */
const rad = (d: number) => (d * Math.PI) / 180;
const clean = (id: string) => id.replace(/[^a-zA-Z0-9]/g, "");

/** The roll-cage machine in local coordinates (origin: downhill track corner). */
function Machine() {
  return (
    <g className="dg-line">
      <rect x="-80" y="-18" width="30" height="18" rx="4" className="dg-fill" />
      <rect x="-30" y="-18" width="30" height="18" rx="4" className="dg-fill" />
      <rect x="-80" y="-30" width="80" height="14" className="dg-fill" />
      <path d="M-72 -30 V-84 H-8 V-30" className="dg-heavy" />
      <path d="M-72 -62 H-8" className="dg-thin" />
      <rect x="-52" y="-40" width="24" height="9" className="dg-fill" />
    </g>
  );
}

/** A person: outlined when safe, solid ink when in danger. `scale` enlarges the only thing that differs between panels. */
function Person({ f, belted = false, solid = false, scale = 1 }: { f: Figure; belted?: boolean; solid?: boolean; scale?: number }) {
  return (
    <g transform={`translate(${f.x.toFixed(1)} ${f.y.toFixed(1)}) rotate(${f.rot.toFixed(1)}) scale(${scale})`} className="dg-line">
      <circle cx="0" cy="-13" r="6.5" className={solid ? "dg-solid" : "dg-fill"} />
      <path d="M0 -6 V10 M0 -2 L-10 6 M0 -2 L10 6 M0 10 L-7 24 M0 10 L7 24" className={solid ? "dg-limb dg-limb-solid" : "dg-limb"} />
      {belted ? <path d="M-7 -5 L7 9" className="dg-heavy" /> : null}
    </g>
  );
}

function Ground({ deg }: { deg: number }) {
  const ticks = [];
  for (let x = -240; x <= 180; x += 18) ticks.push(<path key={x} d={`M${x} 0 L${x - 9} 12`} />);
  return (
    <g transform={`translate(${P.x} ${P.y}) rotate(${deg})`} className="dg-line">
      <path d="M-260 0 H190" className="dg-heavy" />
      <g className="dg-thin">{ticks}</g>
    </g>
  );
}

function Gauge({ tilt, needle, over, labels }: { tilt: number; needle: number; over: boolean; labels: { limit: string; tilt: string } }) {
  const pid = clean(useId());
  const cx = 330;
  const cy = 74;
  const r = 52;
  const at = (d: number, rr = r) => {
    const a = rad(180 - (d / GAUGE_MAX_DEG) * 180);
    return { x: cx + rr * Math.cos(a), y: cy - rr * Math.sin(a) };
  };
  const arc = (from: number, to: number, rr = r) => {
    const a = at(from, rr);
    const b = at(to, rr);
    return `M${a.x.toFixed(1)} ${a.y.toFixed(1)} A${rr} ${rr} 0 0 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  };
  const ticks = [0, 10, 20, 30, 40, 50, 60].map((d) => {
    const a = at(d, r - 4);
    const b = at(d, r + 9);
    return <path key={d} d={`M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${b.x.toFixed(1)} ${b.y.toFixed(1)}`} />;
  });
  const tip = at(needle, r - 6);
  const lim = at(LIMIT_DEG, r + 22);
  const shown = `${Math.round(needle)}°${tilt > GAUGE_MAX_DEG ? "+" : ""}`;
  return (
    <g className="dg-line">
      <defs>
        <pattern id={`${pid}g`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0 V4" className="dg-hatch-band" />
        </pattern>
      </defs>
      <path d={arc(0, LIMIT_DEG)} className="dg-heavy" />
      {/* the danger zone: a 9-unit band, 45-degree hatch, ink outline */}
      <path d={arc(LIMIT_DEG, GAUGE_MAX_DEG)} stroke={`url(#${pid}g)`} className="dg-band" />
      <path d={arc(LIMIT_DEG, GAUGE_MAX_DEG, r + 4.5)} className="dg-thin" />
      <path d={arc(LIMIT_DEG, GAUGE_MAX_DEG, r - 4.5)} className="dg-thin" />
      <g className="dg-thin">{ticks}</g>
      <path d={`M${cx} ${cy} L${tip.x.toFixed(1)} ${tip.y.toFixed(1)}`} className={over ? "dg-needle dg-needle-over" : "dg-needle"} />
      <circle cx={cx} cy={cy} r="6" className="dg-solid" />
      <text x={lim.x} y={lim.y} textAnchor="middle" className="dg-text dg-mono">
        {labels.limit}
      </text>
      {over ? (
        <>
          <rect x={cx - 38} y={cy + 12} width="76" height="30" className="dg-solid" />
          <text x={cx} y={cy + 34} textAnchor="middle" className="dg-text dg-num dg-on-ink">
            {shown}
          </text>
        </>
      ) : (
        <text x={cx} y={cy + 34} textAnchor="middle" className="dg-text dg-num">
          {shown}
        </text>
      )}
      <text x={cx} y={cy + 60} textAnchor="middle" className="dg-text dg-mono">
        {labels.tilt}
      </text>
    </g>
  );
}

/** (a) Rollover with the tilt gauge. */
export function RolloverScene({ f, labels }: { f: RolloverFrame; labels: { limit: string; tilt: string } }) {
  return (
    <svg viewBox="68 -14 332 232" className="dg-svg dg-roll" aria-hidden="true" focusable="false">
      <Ground deg={f.ground} />
      <g transform={`translate(${P.x} ${P.y}) rotate(${f.tilt})`}>
        <Machine />
      </g>
      <Person f={f.figure} solid={f.figure.thrown} scale={1.25} />
      <Gauge tilt={f.tilt} needle={f.needle} over={f.overLimit} labels={labels} />
    </svg>
  );
}

/** (b) One side of the belted vs unbelted pair, cropped to the machine and the landing. */
export function CompareScene({ f, belted }: { f: CompareFrame; belted: boolean }) {
  const fig = belted ? f.belted : f.unbelted;
  return (
    <svg viewBox="110 14 220 212" className="dg-svg" aria-hidden="true" focusable="false">
      <Ground deg={f.ground} />
      <g transform={`translate(${P.x} ${P.y}) rotate(${f.tilt})`}>
        <Machine />
      </g>
      <Person f={fig} belted={belted} solid={!belted && fig.thrown} scale={1.6} />
    </svg>
  );
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** (c) Plan view of an excavator: swing radius, blind cones, a person walking in. */
export function BlindScene({ f, labels }: { f: BlindFrame; labels: { ring: string; unseen: string } }) {
  const pid = clean(useId());
  const danger = f.inCone && f.inRing;
  const wedge = (axis: number) => {
    const a = rad(axis - CONE_HALF);
    const b = rad(axis + CONE_HALF);
    return `M${C.x} ${C.y} L${(C.x + CONE_R * Math.cos(a)).toFixed(1)} ${(C.y + CONE_R * Math.sin(a)).toFixed(1)} A${CONE_R} ${CONE_R} 0 0 1 ${(C.x + CONE_R * Math.cos(b)).toFixed(1)} ${(C.y + CONE_R * Math.sin(b)).toFixed(1)} Z`;
  };
  const ringR = RING_R * (0.7 + 0.3 * f.ring);
  const lead = { x: C.x + RING_R * Math.cos(rad(225)), y: C.y + RING_R * Math.sin(rad(225)) };
  const prints = f.walk > 0 ? [1, 2, 3, 4].map((i) => ({ k: Math.max(0, f.walk - i * 0.1), o: 0.6 - i * 0.12 })) : [];
  return (
    <svg viewBox="60 -4 240 232" className="dg-svg dg-blind" aria-hidden="true" focusable="false">
      <defs>
        <pattern id={`${pid}h`} width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0 V12" className="dg-hatch" />
        </pattern>
      </defs>
      <g opacity={f.cones} transform={`rotate(${f.swing} ${C.x} ${C.y})`}>
        {CONE_AXES.map((axis) => (
          <path key={axis} d={wedge(axis)} fill={`url(#${pid}h)`} className="dg-cone" data-hot={danger || undefined} />
        ))}
      </g>
      {/* tracks stay put; the upper structure turns on them */}
      <g className="dg-line">
        <rect x={C.x - 48} y={C.y - 46} width="20" height="92" rx="6" className="dg-fill" />
        <rect x={C.x + 28} y={C.y - 46} width="20" height="92" rx="6" className="dg-fill" />
        <rect x={C.x - 30} y={C.y - 12} width="60" height="24" className="dg-fill" />
      </g>
      <g transform={`rotate(${f.swing} ${C.x} ${C.y})`} className="dg-line">
        <path d={`M${C.x + 8} ${C.y - 26} V${C.y - 84}`} className="dg-boom" />
        <path d={`M${C.x - 2} ${C.y - 84} H${C.x + 18} L${C.x + 14} ${C.y - 100} H${C.x + 2} Z`} className="dg-fill" />
        <rect x={C.x - 26} y={C.y - 26} width="52" height="52" rx="5" className="dg-fill dg-heavy" />
        <rect x={C.x - 26} y={C.y + 24} width="52" height="18" rx="5" className="dg-solid" />
        <rect x={C.x - 22} y={C.y - 22} width="20" height="22" className="dg-fill" />
        <path d={`M${C.x - 22} ${C.y - 12} H${C.x - 2}`} className="dg-thin" />
      </g>
      <circle cx={C.x} cy={C.y} r={ringR} className="dg-ring" opacity={f.ring} />
      {f.ring > 0.9 ? (
        <g className="dg-line">
          <path d={`M${lead.x.toFixed(1)} ${lead.y.toFixed(1)} L96 18`} className="dg-thin" />
          <text x="64" y="14" className="dg-text">
            {labels.ring}
          </text>
        </g>
      ) : null}
      {prints.map((p, i) => (
        <circle key={i} cx={lerp(WORKER_FROM.x, WORKER_TO.x, p.k)} cy={lerp(WORKER_FROM.y, WORKER_TO.y, p.k)} r="2.5" className="dg-solid" opacity={p.o} />
      ))}
      {/* a person from above: solid shoulders, a hard hat with its brim */}
      <g transform={`translate(${f.worker.x.toFixed(1)} ${f.worker.y.toFixed(1)})`} className="dg-line">
        {danger ? (
          <>
            <circle r="15" className="dg-thin dg-dashed" />
            <circle r="21" className="dg-thin dg-dashed" />
          </>
        ) : null}
        <ellipse rx="11" ry="5" className="dg-solid" />
        <circle r="9" className="dg-fill dg-thin" />
        <circle r="6.5" className="dg-solid" />
      </g>
      {danger ? (
        <g>
          <rect x={f.worker.x - 44} y={f.worker.y - 52} width="88" height="26" className="dg-solid" />
          <text x={f.worker.x} y={f.worker.y - 33} textAnchor="middle" className="dg-text dg-on-ink">
            {labels.unseen}
          </text>
        </g>
      ) : null}
    </svg>
  );
}
