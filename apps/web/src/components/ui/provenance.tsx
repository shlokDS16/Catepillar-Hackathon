"use client";

import { useTranslations } from "next-intl";
import { Chip } from "@/components/ui/chip";
import { Mark } from "@/components/ui/pictogram";
import { provenanceOf, type ProvenanceTable } from "@/data/provenance";
import { useMode } from "@/data/mode";

type ProvenanceChipProps = { table: ProvenanceTable; field: string; inputAssumed?: boolean };

/**
 * The per-field chip: "assumed" / "simulated" / a source line, in Detailed mode and on FM screens.
 * In Simple mode it renders nothing; the screen shows one ProvenanceLine instead (Decision 4).
 */
export function ProvenanceChip({ table, field, inputAssumed }: ProvenanceChipProps) {
  const t = useTranslations("provenance");
  const { mode } = useMode();
  const tag = provenanceOf(table, field, { inputAssumed });
  if (mode === "simple" || tag.kind === "none") return null;
  if (tag.kind === "source") return <span className="t-meta text-ink-3">{tag.label}</span>;
  return <Chip tone="meta">{t(tag.kind)}</Chip>;
}

/** Simple mode: one line per screen, shown when any listed value is assumed or simulated. */
export function ProvenanceLine({ fields }: { fields: Array<[ProvenanceTable, string]> }) {
  const t = useTranslations("provenance");
  const { mode } = useMode();
  const any = fields.some(([table, field]) => {
    const k = provenanceOf(table, field).kind;
    return k === "assumed" || k === "simulated";
  });
  if (mode !== "simple" || !any) return null;
  return (
    <p className="t-meta text-ink-3 flex items-center gap-2">
      <Mark kind="info" />
      {t("someAssumed")}
    </p>
  );
}
