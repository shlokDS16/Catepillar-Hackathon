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
 * Bottom sheet on a native <dialog>, opened NON-modally: a modal dialog would sit in the top layer
 * above SOS and make SOS inert, and the z-order (SOS 40 above sheets 20) must hold. So the sheet
 * draws its own backdrop, closes on Escape and backdrop tap, and moves focus in and back out itself.
 * Layering is a 3 px ink rule, not a shadow (visual-language §3).
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const t = useTranslations("chrome");
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement;
      dialog.show();
      dialog.focus();
    }
    if (!open && dialog.open) {
      dialog.close();
      if (opener.current instanceof HTMLElement) opener.current.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      {open ? <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" /> : null}
      <dialog ref={ref} className="sheet" aria-labelledby={titleId} tabIndex={-1} onClose={onClose}>
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
    </>
  );
}
