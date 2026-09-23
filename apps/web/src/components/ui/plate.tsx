import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { cx } from "@/lib/cx";

/** Filled tones. Safety tones mean a live state and nothing else (visual-language §0). */
export type PlateTone =
  | "surface"
  | "sunk"
  | "ink"
  | "clear"
  | "caution"
  | "warning"
  | "critical"
  | "mandatory"
  | "nosignal";

export type PlateRule = "normal" | "heavy" | "hair" | "none";

type PlateProps<T extends ElementType> = {
  as?: T;
  tone?: PlateTone;
  /** Border weight: normal 2 px (state plates, inputs), heavy 3 px (hero, alerts, SOS), hair 1 px. */
  rule?: PlateRule;
  /** Dashed rules mark an offline (cached) module. */
  dashed?: boolean;
  /** Loading state: the outline at final size, no shimmer. */
  loading?: boolean;
  /** Plays the one-shot border stamp; change the element key to replay it. */
  stamp?: boolean;
  className?: string;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

/**
 * A module drawn like a stencilled site sign: rectangular, ink rule, no radius, no shadow.
 * Layering is shown by rules, never by elevation.
 */
export function Plate<T extends ElementType = "div">({
  as,
  tone = "surface",
  rule = "normal",
  dashed = false,
  loading = false,
  stamp = false,
  className,
  children,
  ...rest
}: PlateProps<T>) {
  const Tag = (as ?? "div") as ElementType;
  return (
    <Tag
      className={cx("plate", className)}
      data-tone={tone === "surface" ? undefined : tone}
      data-rule={rule === "normal" ? undefined : rule}
      data-dashed={dashed || undefined}
      data-loading={loading || undefined}
      data-stamp={stamp || undefined}
      aria-busy={loading || undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}
