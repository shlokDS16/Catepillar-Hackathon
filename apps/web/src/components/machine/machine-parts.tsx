import { useId } from "react";
import { useTranslations } from "next-intl";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { Mark, Pictogram } from "@/components/ui/pictogram";
import { cx } from "@/lib/cx";
import type { MachinePartView, PartState } from "@/machine/parts";

/**
 * The Bay parts list: the text twin of the drawing and the only route to part state on a phone.
 * Each row is at least 80 px and carries colour + pictogram + word, a one-line note, and the SIM caption
 * (every reading is simulated).
 */
const TONE: Record<PartState, ChipTone> = { ok: "clear", caution: "caution", warning: "warning", critical: "critical" };

function StateIcon({ state }: { state: PartState }) {
  if (state === "ok") return <Mark kind="check" />;
  return <Pictogram name="fault" shape={state === "critical" ? "octagon" : "triangle"} />;
}

export function MachineParts({ parts, variant = "live", className }: { parts: MachinePartView[]; variant?: "live" | "replay"; className?: string }) {
  const t = useTranslations("bay");
  const hid = useId();
  if (parts.length === 0) return null;
  return (
    <section className={cx("bay-parts", className)} aria-labelledby={hid}>
      <h2 id={hid} className="t-title">{t("partsTitle")}</h2>
      <ol className="bay-rows">
        {parts.map((p) => {
          const key = p.noteKey.replace(/^bay\./, "");
          return (
            <li key={p.id} className="bay-row" data-state={variant === "live" && p.state !== "ok" ? p.state : undefined}>
              <span className="bay-row-n t-label tnum" aria-hidden="true">
                {p.n}
              </span>
              <div className="bay-row-main">
                <span className="t-label">{t(`part.${p.id}`)}</span>
                <span className="t-meta text-ink-2">{t.has(key) && !(key === "note.ok" && p.state !== "ok") ? t(key) : t(p.state === "ok" ? "note.ok" : "note.generic")}</span>
                <span className="t-caption text-ink-3">{t("sim")}</span>
              </div>
              <Chip tone={variant === "live" ? TONE[p.state] : "outline"} word icon={<StateIcon state={p.state} />}>
                {t(`state.${p.state}`)}
              </Chip>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
