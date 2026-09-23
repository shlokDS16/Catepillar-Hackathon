import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Mark } from "@/components/ui/pictogram";

export type ButtonVariant = "primary" | "secondary";
export type ButtonSize = "hit" | "sos" | "dense";
/** Feedback states from interaction-map §3. Timing (1.2 s success) is the caller's job. */
export type ButtonStatus = "idle" | "loading" | "success" | "error";

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  status?: ButtonStatus;
  /** Full-width block button. */
  block?: boolean;
  /** Leading pictogram or icon; the label is always present next to it. */
  icon?: ReactNode;
  /**
   * The one small line under the label: the reason when disabled ("Needs vest", "Needs signal"),
   * the message when status is "error". A disabled button without a reason is a design error.
   */
  note?: string;
  className?: string;
  children: ReactNode;
};

type ButtonAsButton = CommonProps & {
  href?: undefined;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

type ButtonAsLink = CommonProps & {
  href: string;
  disabled?: boolean;
};

export type ButtonProps = ButtonAsButton | ButtonAsLink;

/**
 * The one button. Primary = ink plate, white label (at most one per view); secondary = ink outline.
 * States: default, hover (underline), pressed (inset rule), focus, disabled + reason, loading
 * (label stays, bar after 300 ms, clicks ignored, focus kept), success (tick), error (✕ + one line, never red).
 */
export function Button(props: ButtonProps) {
  const {
    variant = "secondary",
    size = "hit",
    status = "idle",
    block = false,
    icon,
    note,
    className,
    children,
    ...rest
  } = props;

  const busy = status === "loading";
  const dataAttrs = {
    "data-variant": variant,
    "data-size": size === "hit" ? undefined : size,
    "data-block": block || undefined,
    "data-status": status === "idle" ? undefined : status,
  };

  const content = (
    <>
      <span className="btn-row">
        {status === "success" ? <Mark kind="check" /> : status === "error" ? <Mark kind="cross" /> : icon}
        <span className="btn-label">{children}</span>
      </span>
      {note ? <span className="btn-note">{note}</span> : null}
      {busy ? <span className="btn-bar" aria-hidden="true" /> : null}
    </>
  );

  if ("href" in rest && typeof rest.href === "string") {
    const { href, disabled } = rest as ButtonAsLink;
    if (disabled) {
      return (
        <span role="link" className={cx("btn", className)} aria-disabled="true" {...dataAttrs}>
          {content}
        </span>
      );
    }
    return (
      <Link href={href} className={cx("btn", className)} {...dataAttrs}>
        {content}
      </Link>
    );
  }

  const { type = "button", onClick, ...buttonRest } = rest as ButtonAsButton;
  return (
    <button
      type={type}
      className={cx("btn", className)}
      aria-busy={busy || undefined}
      onClick={busy ? undefined : onClick}
      {...dataAttrs}
      {...buttonRest}
    >
      {content}
    </button>
  );
}
