import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";

export type ChipTone =
  | "outline"
  | "ink"
  | "sunk"
  | "meta"
  | "clear"
  | "caution"
  | "warning"
  | "critical"
  | "mandatory"
  | "nosignal";

type ChipProps = {
  tone?: ChipTone;
  /** Pictogram or icon. Safety chips always carry one: colour + pictogram + word. */
  icon?: ReactNode;
  /** Condensed uppercase word (state chips) instead of body text. */
  word?: boolean;
  /** "×3" style multiplier shown after the word. */
  count?: number;
  dashed?: boolean;
  /** Tappable chips become an 80 px target: a button (onClick) or a link (href). */
  href?: string;
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
  "aria-label"?: string;
  className?: string;
  children: ReactNode;
};

/**
 * A small labelled plate: safety chip, connectivity chip, provenance tag, order stamp.
 * A chip with a tone other than outline/meta is a live state, never decoration.
 */
export function Chip({
  tone = "outline",
  icon,
  word = false,
  count,
  dashed = false,
  href,
  onClick,
  className,
  children,
  ...rest
}: ChipProps) {
  const tappable = Boolean(href || onClick);
  const attrs = {
    className: cx("chip", className),
    "data-tone": tone === "outline" ? undefined : tone,
    "data-size": tappable ? "hit" : undefined,
    "data-dashed": dashed || undefined,
    "aria-label": rest["aria-label"],
  };
  const content = (
    <>
      {icon}
      <span className={word ? "t-chip" : undefined}>{children}</span>
      {count && count > 1 ? <span className={cx("tnum", word && "t-chip")}>×{count}</span> : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} {...attrs}>
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} {...attrs}>
        {content}
      </button>
    );
  }
  return <span {...attrs}>{content}</span>;
}
