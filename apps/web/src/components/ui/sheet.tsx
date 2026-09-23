"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

/**
 * Bottom sheet on a native <dialog>: focus trap, Escape and backdrop close come for free.
 * The padding sits on .sheet-body, so a click that reaches the dialog itself is a backdrop click.
 * Layering is a 3 px ink rule, not a shadow (visual-language §3).
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const t = useTranslations("chrome");
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet-body">
        <div className="sheet-head">
          <h2 id={titleId} className="t-title">
            {title}
          </h2>
          <Button size="dense" onClick={onClose}>
            {t("close")}
          </Button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
