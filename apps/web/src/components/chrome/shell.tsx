import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { AskChip } from "@/components/chrome/ask-chip";
import { LanguageChip } from "@/components/chrome/language-sheet";
import { ActiveTitle, Nav } from "@/components/chrome/nav";
import type { ShellRole } from "@/components/chrome/nav-items";
import { SosSlot } from "@/components/chrome/sos-slot";
import { StatusStrip } from "@/components/chrome/status-strip";

type ShellProps = { role: ShellRole; children: ReactNode };

/**
 * Persistent chrome (interaction-map §2). Phone: strip, title row, content, bottom nav, SOS.
 * From 1024 px: one top strip, a left rail, SOS bottom-right. The fleet manager's shell is
 * Detailed mode with no SOS. Z-order: content 0 · chrome 10 · sheets 20 · lock 25 · takeover 30 · SOS 40.
 */
export async function Shell({ role, children }: ShellProps) {
  const operator = role === "operator";
  const t = await getTranslations("chrome");
  return (
    <div className="shell" data-role={role} data-mode={operator ? undefined : "detailed"}>
      <a href="#main" className="skip-link t-label">
        {t("skipToContent")}
      </a>
      <StatusStrip showSafety={operator} />
      <Nav role={role} />
      <div className="shell-body">
        <div className="title-row">
          <ActiveTitle role={role} />
          <div className="flex items-center gap-6">
            <LanguageChip />
            {operator ? <AskChip /> : null}
          </div>
        </div>
        <main id="main" className="shell-main">
          {children}
        </main>
      </div>
      {operator ? <SosSlot /> : null}
    </div>
  );
}
