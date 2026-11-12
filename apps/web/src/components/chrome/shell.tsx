import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { AlertLayer } from "@/components/alerts/alert-layer";
import { AskChip } from "@/components/chrome/ask-chip";
import { AppProviders } from "@/components/chrome/providers";
import { LanguageChip } from "@/components/chrome/language-sheet";
import { LockableBody } from "@/components/chrome/lockable";
import { ActiveTitle, Nav } from "@/components/chrome/nav";
import type { ShellRole } from "@/components/chrome/nav-items";
import { SosControl } from "@/components/chrome/sos-control";
import { StatusStrip } from "@/components/chrome/status-strip";

type ShellProps = { role: ShellRole; children: ReactNode };

/**
 * Persistent chrome (interaction-map §2, D14 Ink Frame). The ink band holds the state plate (or the
 * FM page title), the connectivity caption, Language and Ask. Phone: band, content, dock (4
 * destinations + the SOS slot). From 1024 px: the dock becomes a full-height left rail with the SOS
 * slab under its items. SOS follows the nav in the DOM so keyboard and screen-reader users reach it
 * early; it stays a sibling of the nav (not inside it) so it keeps z 40 and stays out of the nav's
 * inert. The fleet manager's shell is Detailed mode with no SOS.
 * Z-order: content 0 · chrome 10 · sheets 20 · lock 25 · takeover 30 · SOS 40.
 */
export async function Shell({ role, children }: ShellProps) {
  const operator = role === "operator";
  const t = await getTranslations("chrome");
  return (
    <AppProviders role={role}>
    <div className="shell" data-role={role} data-mode={operator ? undefined : "detailed"}>
      <a href="#main" className="skip-link t-label">
        {t("skipToContent")}
      </a>
      <StatusStrip
        showSafety={operator}
        title={<ActiveTitle role={role} className={operator ? "sr-only" : "strip-title"} />}
        actions={
          <>
            <LanguageChip />
            {operator ? <AskChip /> : null}
          </>
        }
      />
      <Nav role={role} />
      {operator ? <SosControl /> : null}
      <LockableBody>
        <main id="main" className="shell-main">
          {children}
        </main>
      </LockableBody>
      {operator ? <AlertLayer /> : null}
    </div>
    </AppProviders>
  );
}
