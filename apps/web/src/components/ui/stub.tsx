import { useTranslations } from "next-intl";
import { Plate } from "@/components/ui/plate";

/** Loading-shaped placeholder for a screen whose task has not landed yet. Removed as screens land. */
export function Stub({ task }: { task: string }) {
  const t = useTranslations("chrome");
  return (
    <Plate loading className="min-h-hit-sos">
      <p className="t-body">
        {t("comingSoon")} <span className="t-meta">({task})</span>
      </p>
    </Plate>
  );
}
