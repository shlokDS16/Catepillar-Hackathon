import type { SVGProps } from "react";
import { cx } from "@/lib/cx";

/**
 * The six safety pictograms, drawn by us in the manner of ISO 7010 signs (not copied from it).
 * Each sits inside its sign shape: triangle = caution/warning, circle = mandatory, octagon = critical.
 * Stroke is 5 units on a 48-unit box, which is 2.5 px at the 24 px size.
 * They are decorative next to a word (aria-hidden) unless a label is passed.
 */
export type PictogramName = "seatbelt" | "proximity" | "vest" | "fault" | "heat" | "sos";
export type SignShape = "triangle" | "circle" | "octagon" | "none";

const DEFAULT_SHAPE: Record<PictogramName, SignShape> = {
  seatbelt: "triangle",
  proximity: "triangle",
  vest: "circle",
  fault: "triangle",
  heat: "triangle",
  sos: "octagon",
};

const SHAPES: Record<Exclude<SignShape, "none">, string> = {
  triangle: "M24 4 L45 42 L3 42 Z",
  circle: "M24 3 A21 21 0 1 1 23.9 3 Z",
  octagon: "M15.5 3 H32.5 L45 15.5 V32.5 L32.5 45 H15.5 L3 32.5 V15.5 Z",
};

/* Glyphs are drawn for the lower two thirds of the box so they fit inside the triangle too. */
const GLYPHS: Record<PictogramName, React.ReactNode> = {
  seatbelt: (
    <>
      <path d="M14 18 L33 37" />
      <rect x="29" y="31" width="9" height="8" />
      <path d="M12 38 H22" />
    </>
  ),
  proximity: (
    <>
      <circle cx="15" cy="22" r="3" />
      <path d="M15 25 V36 M11 30 H19" />
      <path d="M26 27 H37 V37 H26 Z M28 37 V40 M35 37 V40" />
      <path d="M22 31 L24 33 L22 35" />
    </>
  ),
  vest: (
    <>
      <path d="M15 16 L20 12 L24 18 L28 12 L33 16 V37 H15 Z" />
      <path d="M15 28 H33" />
    </>
  ),
  fault: (
    <>
      <path d="M24 14 C24 14 15 25 15 30 A9 9 0 0 0 33 30 C33 25 24 14 24 14 Z" />
      <path d="M24 24 V30 M24 34 V34.5" />
    </>
  ),
  heat: (
    <>
      <circle cx="24" cy="34" r="4.5" />
      <path d="M24 30 V16 M21 20 H27 M21 25 H27" />
    </>
  ),
  sos: (
    <>
      <circle cx="24" cy="15" r="3.5" />
      <path d="M24 19 V31 M24 31 L18 40 M24 31 L30 40 M24 24 L33 15 M24 24 L15 28" />
    </>
  ),
};

type PictogramProps = {
  name: PictogramName;
  shape?: SignShape | "auto";
  size?: "md" | "lg";
  /** Accessible name; omit when a visible word sits next to the pictogram. */
  label?: string;
  className?: string;
} & Omit<SVGProps<SVGSVGElement>, "name" | "className">;

export function Pictogram({ name, shape = "auto", size = "md", label, className, ...rest }: PictogramProps) {
  const sign = shape === "auto" ? DEFAULT_SHAPE[name] : shape;
  return (
    <svg
      viewBox="0 0 48 48"
      className={cx("picto", className)}
      data-size={size === "lg" ? "lg" : undefined}
      fill="none"
      stroke="currentColor"
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      {...rest}
    >
      {sign !== "none" ? <path d={SHAPES[sign]} strokeWidth="4" /> : null}
      {GLYPHS[name]}
    </svg>
  );
}

/**
 * Result marks for buttons, quizzes and traces: a filled tick, an outlined cross, an info ring.
 * The tick is cut out of the filled square in the surface colour; a dark parent sets --mark-bg.
 */
export function Mark({ kind, className }: { kind: "check" | "cross" | "info"; className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={cx("picto", className)}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === "check" ? (
        <>
          <rect x="4" y="4" width="40" height="40" fill="currentColor" />
          <path d="M14 25 L21 32 L34 17" stroke="var(--mark-bg, var(--surface))" />
        </>
      ) : kind === "cross" ? (
        <>
          <rect x="4" y="4" width="40" height="40" />
          <path d="M16 16 L32 32 M32 16 L16 32" />
        </>
      ) : (
        <>
          <circle cx="24" cy="24" r="20" strokeWidth="4" />
          <path d="M24 21 V34 M24 14 V14.5" />
        </>
      )}
    </svg>
  );
}
