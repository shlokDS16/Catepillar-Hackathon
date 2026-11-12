/**
 * Stage-1 poster, server-rendered as inline SVG: it is the LCP picture, so it costs no request.
 * Sky, sun disc and glow, four terraced quarry silhouettes (far to near), a haul road, rocks and a
 * generic excavator (counterweight, cab, curved boom, cylinders, toothed bucket) on the bench. All colour comes from the landing scenery tokens.
 */

const W = 1600;
const H = 900;

/** Deterministic pseudo-random in [0, 1): the poster must render the same on server and client. */
function rnd(i: number, seed: number): number {
  const x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** A bench-stepped skyline: the height holds for a run, then drops or climbs one terrace. */
function benchPath(seed: number, base: number, amp: number, run: number, tilt: number): string {
  let y = base;
  let d = `M0 ${H} L0 ${y}`;
  let x = 0;
  let i = 0;
  while (x < W) {
    const w = run * (0.6 + rnd(i, seed) * 0.9);
    x = Math.min(W, x + w);
    d += ` L${x.toFixed(0)} ${y.toFixed(0)}`;
    y = base + (rnd(i + 40, seed) - 0.5) * amp + Math.sin(x * tilt) * amp * 0.4;
    d += ` L${x.toFixed(0)} ${y.toFixed(0)}`;
    i += 1;
  }
  return `${d} L${W} ${H} Z`;
}

export function DawnPoster({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="dp-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--dawn-top)" />
          <stop offset="0.45" stopColor="var(--dawn-mid)" />
          <stop offset="0.72" stopColor="var(--dawn-low)" />
          <stop offset="1" stopColor="var(--dawn-horizon)" />
        </linearGradient>
        <radialGradient id="dp-sun" cx="0.68" cy="0.6" r="0.45">
          <stop offset="0" stopColor="var(--dawn-sun)" stopOpacity="0.95" />
          <stop offset="0.25" stopColor="var(--dawn-horizon)" stopOpacity="0.55" />
          <stop offset="1" stopColor="var(--dawn-horizon)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="dp-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--dawn-horizon)" stopOpacity="0" />
          <stop offset="1" stopColor="var(--dawn-horizon)" stopOpacity="0.32" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill="url(#dp-sky)" />
      <rect width={W} height={H} fill="url(#dp-sun)" />
      <path d={benchPath(3, 520, 46, 150, 0.004)} fill="var(--rock-far)" />
      <rect y="440" width={W} height="220" fill="url(#dp-haze)" />
      <path d={benchPath(7, 610, 70, 190, 0.006)} fill="var(--rock-mid)" />
      <path d={benchPath(11, 700, 90, 240, 0.005)} fill="var(--rock-near)" />
      {/* Sun disc and low rim glow behind the machine. */}
      <circle cx="1088" cy="540" r="34" fill="var(--dawn-sun)" opacity="0.9" />
      {/* Haul road: a lighter ramp across the mid bench. */}
      <path d="M0 640 L420 610 L760 640 L420 676 Z" fill="var(--rock-mid)" opacity="0.55" />
      {/* Scattered rocks on the near bench. */}
      <g fill="var(--rock-near)">
        {Array.from({ length: 16 }, (_, i) => {
          const x = 40 + i * 98 + rnd(i, 5) * 40;
          const y = 716 + rnd(i + 9, 5) * 34;
          const r = 6 + rnd(i + 3, 5) * 12;
          return <ellipse key={i} cx={x.toFixed(0)} cy={y.toFixed(0)} rx={r.toFixed(0)} ry={(r * 0.62).toFixed(0)} />;
        })}
      </g>
      {/* Generic tracked excavator on the bench: tracks, counterweight, hood, cab with glass,
          curved boom, stick, bucket with teeth, three cylinders. Warm off-white body, graphite
          undercarriage, a dawn rim light on the sun side. */}
      <g className="dp-machine">
        <ellipse cx="90" cy="2" rx="150" ry="9" fill="var(--rock-front)" opacity="0.55" />
        <path d="M-10 0 h188 a17 17 0 0 0 0 -34 h-188 a17 17 0 0 0 0 34Z" fill="var(--graphite)" />
        <g fill="var(--rock-near)">
          {[8, 40, 72, 104, 136].map((x) => (
            <circle key={x} cx={x} cy="-12" r="7" />
          ))}
          <circle cx="-2" cy="-17" r="13" />
          <circle cx="170" cy="-17" r="13" />
        </g>
        <path d="M0 -34 h150 v-10 H0Z" fill="var(--graphite)" />
        <path d="M-22 -50 q0 -24 26 -26 h40 v50 h-52 q-14 0 -14 -24Z" fill="var(--machine-body)" />
        <path d="M24 -76 h96 v42 h-96Z" fill="var(--machine-body)" />
        <g stroke="var(--graphite)" strokeWidth="2" opacity="0.5">
          {[44, 54, 64, 74, 84].map((x) => (
            <line key={x} x1={x} y1="-68" x2={x} y2="-44" />
          ))}
        </g>
        <path d="M108 -76 h44 l8 18 v26 h-52Z" fill="var(--machine-body)" />
        <path d="M112 -112 h36 l10 22 h-46Z M116 -72 h28 l8 -16 h-36Z" fill="var(--glass)" />
        <path d="M108 -112 h44 l10 24 v6 h-54Z" fill="var(--glass)" opacity="0.85" />
        <path d="M106 -80 h56 v8 h-56Z" fill="var(--machine-body)" />
        <path d="M112 -126 h34 v6 h-34Z" fill="var(--machine-body)" />
        <circle cx="128" cy="-132" r="3.5" fill="var(--state-warning)" />
        <path d="M-22 -50 q0 -24 26 -26 h116 h36" fill="none" stroke="var(--dawn-sun)" strokeWidth="2" opacity="0.8" />
        <path d="M120 -62 Q196 -176 296 -126" fill="none" stroke="var(--graphite)" strokeWidth="22" strokeLinecap="round" />
        <path d="M120 -62 Q196 -176 296 -126" fill="none" stroke="var(--machine-body)" strokeWidth="15" strokeLinecap="round" />
        <path d="M120 -62 Q196 -176 296 -126" fill="none" stroke="var(--dawn-sun)" strokeWidth="2" opacity="0.7" transform="translate(0 -7)" />
        <path d="M296 -126 L336 -22" fill="none" stroke="var(--graphite)" strokeWidth="16" strokeLinecap="round" />
        <path d="M296 -126 L336 -22" fill="none" stroke="var(--machine-body)" strokeWidth="9" strokeLinecap="round" />
        <path d="M116 -44 L204 -122" stroke="var(--rock-front)" strokeWidth="9" strokeLinecap="round" />
        <path d="M150 -78 L204 -122" stroke="var(--bone)" strokeWidth="3" strokeLinecap="round" />
        <path d="M222 -150 L300 -128" stroke="var(--rock-front)" strokeWidth="8" strokeLinecap="round" />
        <path d="M262 -138 L300 -128" stroke="var(--bone)" strokeWidth="3" strokeLinecap="round" />
        <path d="M316 -92 L350 -62" stroke="var(--rock-front)" strokeWidth="7" strokeLinecap="round" />
        <path d="M326 -30 L372 -34 q8 22 -14 40 l-34 4 q-12 -22 -2 -42 Z" fill="var(--graphite)" />
        <path d="M326 -30 L372 -34 l-2 8 l-44 6Z" fill="var(--machine-body)" opacity="0.8" />
        <g fill="var(--bone)">
          {[0, 1, 2, 3, 4].map((i) => (
            <path key={i} d={`M${330 + i * 9} 14 l4 12 l4 -12Z`} />
          ))}
        </g>
        <g fill="var(--graphite)">
          <circle cx="120" cy="-62" r="5" />
          <circle cx="296" cy="-126" r="5.5" />
          <circle cx="336" cy="-22" r="5" />
        </g>
      </g>
      <path d={benchPath(19, 790, 60, 300, 0.003)} fill="var(--rock-front)" />
    </svg>
  );
}
