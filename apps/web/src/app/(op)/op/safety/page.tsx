import { Map } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Stub } from "@/components/ui/stub";

/** F11 is not built yet. Map lives inside Safety now (D14), so the link is here from the start. */
export default function Page() {
  const t = useTranslations("nav");
  return (
    <div className="flex flex-col gap-4">
      <Stub task="F11" />
      <Button href="/op/map" icon={<Map className="icon" aria-hidden="true" />} block>
        {t("map")}
      </Button>
    </div>
  );
}
