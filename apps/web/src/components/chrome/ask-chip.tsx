"use client";

import { MessageCircleQuestion } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Chip } from "@/components/ui/chip";
import { Sheet } from "@/components/ui/sheet";
import { isReplayRoute } from "@/replay/leave-guard";

/**
 * The Ask slot (A17). F03 mounts the chip and an empty sheet; F19 fills it with Ask Spotter.
 * Hidden by the shell in motion lock and on first launch, and hidden inside a replay (R1) so the
 * answer key cannot be looked up mid-run (interaction-map §2).
 */
export function AskChip() {
  const [open, setOpen] = useState(false);
  const t = useTranslations("chrome");
  const pathname = usePathname();
  if (isReplayRoute(pathname)) return null;
  return (
    <>
      <Chip onClick={() => setOpen(true)} icon={<MessageCircleQuestion className="icon" aria-hidden="true" />}>
        {t("ask")}
      </Chip>
      <Sheet open={open} onClose={() => setOpen(false)} title={t("ask")}>
        <p className="t-body text-ink-2">{t("comingSoon")}</p>
      </Sheet>
    </>
  );
}
