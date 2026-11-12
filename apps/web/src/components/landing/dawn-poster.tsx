/**
 * Stage-1 poster, server-rendered as inline SVG: it is the LCP picture, so it costs no request.
 * Sky, sun glow, four terraced quarry silhouettes (far to near) and a generic excavator
 * silhouette on the middle bench. All colour comes from the landing scenery tokens.
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
      {/* Generic tracked excavator on the near bench: tracks, house, cab, boom, stick, bucket. */}
      <g fill="var(--rock-front)" transform="translate(1030 640)">
        <rect x="0" y="52" width="150" height="26" rx="13" />
        <rect x="14" y="22" width="112" height="34" />
        <rect x="70" y="-6" width="52" height="30" />
        <rect x="-4" y="26" width="26" height="22" />
        <path d="M118 8 L206 -52 L218 -42 L132 22 Z" />
        <path d="M204 -54 L170 20 L184 24 L224 -40 Z" />
        <path d="M168 14 L200 18 L190 50 L160 42 Z" />
      </g>
      <path d={benchPath(19, 790, 60, 300, 0.003)} fill="var(--rock-front)" />
    </svg>
  );
}
