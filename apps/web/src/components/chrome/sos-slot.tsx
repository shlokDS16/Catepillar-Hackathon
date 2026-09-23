import { useTranslations } from "next-intl";
import { Pictogram } from "@/components/ui/pictogram";

/**
 * The SOS slot: fixed bottom-right, 108 px, above every layer but the SOS status (z 40).
 * F03 reserves the space with a static plate; F05 replaces it with the hold-to-arm button.
 */
export function SosSlot() {
  const t = useTranslations("chrome");
  return (
    <div className="sos-slot" aria-hidden="true">
      <div className="btn sos" data-variant="primary" data-size="sos">
        <span className="btn-row">
          <Pictogram name="sos" shape="none" />
          <span className="btn-label t-chip">{t("sos")}</span>
        </span>
        <span className="btn-note">{t("help")}</span>
      </div>
    </div>
  );
}
