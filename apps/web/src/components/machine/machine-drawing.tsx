import { useTranslations } from "next-intl";
import { cx } from "@/lib/cx";
import { PART_IDS, type MachinePartView, type PartId, type PartState } from "@/machine/parts";

/**
 * An unbranded side-view excavator in ink (inline SVG), drawn on the Bay stage. The part ids are the
 * landing model's (components/landing/scene/excavator.ts) so a 3D stage can reuse them. A drawing, not
 * a photo: no logo, no livery. Proportions follow the landing model: tracks, upper house with the
 * engine, cab at the front, boom with its ram, stick and bucket, and a rear sensor.
 *
 * live: a part with a live state other than ok is filled in that state's colour (colour + the list's
 * pictogram + word carry it). replay: ink outlines only, never state fills (visual-language 1.1).
 */
export type DrawingCallouts = "tags" | "numbers" | "none";

type Props = {
  parts?: MachinePartView[];
  highlight?: PartId;
  callouts: DrawingCallouts;
  variant?: "live" | "replay";
  className?: string;
};

const W = 640;
const H = 360;

/** Anchor on the part, and where its tag sits (viewBox units). */
const CALLOUT: Record<PartId, { ax: number; ay: number; tx: number; ty: number }> = {
  rear_sensor: { ax: 81, ay: 205, tx: 62, ty: 120 },
  engine: { ax: 150, ay: 222, tx: 150, ty: 146 },
  cab: { ax: 300, ay: 150, tx: 236, ty: 64 },
  boom_ram: { ax: 420, ay: 132, tx: 420, ty: 40 },
  bucket: { ax: 560, ay: 262, tx: 574, ty: 178 },
  tracks: { ax: 250, ay: 291, tx: 330, ty: 346 },
};

export function MachineDrawing({ parts = [], highlight, callouts, variant = "live", className }: Props) {
  const t = useTranslations("bay");
  const byId = new Map(parts.map((p) => [p.id, p]));
  const live = variant === "live";
  const g = (id: PartId) => {
    const p = byId.get(id);
    return {
      "data-part": id,
      "data-state": live && p && p.state !== "ok" ? p.state : undefined,
      "data-hl": highlight === id || undefined,
    };
  };
  const rollers = [170, 215, 260, 305, 340];
  return (
    <div className={cx("bay-draw", className)} data-variant={variant} data-callouts={callouts}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("drawingLabel")} className="bay-svg">
        <line className="bay-ground" x1="30" y1="323" x2="620" y2="323" />
        {Array.from({ length: 36 }, (_, k) => (
          <line key={k} className="bay-hatch" x1={40 + k * 16} y1="326" x2={30 + k * 16} y2="340" />
        ))}
        <g {...g("tracks")} className="bay-p bay-dark">
          <rect x="96" y="262" width="308" height="58" rx="29" />
        </g>
        <rect className="bay-part" x="132" y="278" width="236" height="26" rx="6" />
        <circle className="bay-part" cx="125" cy="291" r="19" />
        <circle className="bay-part" cx="375" cy="291" r="19" />
        {rollers.map((x) => (
          <circle key={x} className="bay-part" cx={x} cy="291" r="10" />
        ))}
        <rect className="bay-dark-fill" x="190" y="248" width="140" height="14" />
        <g {...g("engine")} className="bay-p">
          <path d="M84 248V206q0-22 22-22h162v64z" />
        </g>
        <path className="bay-line" d="M118 200h96M118 208h96M118 216h96" />
        <g {...g("rear_sensor")} className="bay-p">
          <rect x="74" y="194" width="14" height="22" />
        </g>
        <g {...g("cab")} className="bay-p">
          <path d="M268 248V120q0-8 8-8h54l22 44v92z" />
        </g>
        <path className="bay-glass" d="M280 124h46l16 34v42h-62z" />
        <path className="bay-line bay-thick" d="M296 168l24 24" />
        <g {...g("boom_ram")} className="bay-p">
          <path d="M346 224l20-20q54-84 120-120l18 20q-58 36-120 128z" />
          <path className="bay-ram" d="M325.4 244.4l-10.8-8.8 52-64 10.8 8.8z" />
        </g>
        <path className="bay-line bay-thick" d="M372 176l28-34" />
        <path className="bay-line bay-thicker" d="M428 132l50-52" />
        <path className="bay-part" d="M480 82l26 2 54 152-20 8z" />
        <g {...g("bucket")} className="bay-p">
          <path d="M536 236l36-6 12 40q-18 30-56 22l-8-26z" />
        </g>
        <path className="bay-line" d="M526 292l-10 8M538 294l-8 9M550 293l-5 9" />
        <circle className="bay-part" cx="366" cy="214" r="6" />
        <circle className="bay-part" cx="494" cy="92" r="6" />
        <circle className="bay-part" cx="550" cy="240" r="6" />
        {callouts === "tags" ? (
          <g className="bay-leaders" aria-hidden="true">
            {PART_IDS.map((id) => (
              <g key={id}>
                <line className="bay-leader" x1={CALLOUT[id].ax} y1={CALLOUT[id].ay} x2={CALLOUT[id].tx} y2={CALLOUT[id].ty} />
                <circle className="bay-anchor" cx={CALLOUT[id].ax} cy={CALLOUT[id].ay} r="7" />
              </g>
            ))}
          </g>
        ) : null}
        {callouts === "numbers" ? (
          <g aria-hidden="true">
            {PART_IDS.map((id, i) => (
              <g key={id}>
                <circle className="bay-pin" cx={CALLOUT[id].ax} cy={CALLOUT[id].ay} r="14" />
                <text className="bay-pin-n" x={CALLOUT[id].ax} y={CALLOUT[id].ay + 6} textAnchor="middle">
                  {i + 1}
                </text>
              </g>
            ))}
          </g>
        ) : null}
      </svg>
      {callouts === "tags" ? (
        <ul className="bay-tags" aria-hidden="true">
          {PART_IDS.map((id, i) => {
            const p = byId.get(id);
            const state: PartState = p?.state ?? "ok";
            return (
              <li
                key={id}
                className="bay-tag"
                data-state={live && state !== "ok" ? state : undefined}
                data-hl={highlight === id || undefined}
                style={{ left: `${(CALLOUT[id].tx / W) * 100}%`, top: `${(CALLOUT[id].ty / H) * 100}%` }}
              >
                <span className="bay-tag-n tnum">{i + 1}</span>
                <span className="bay-tag-name">{t(`part.${id}`)}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
