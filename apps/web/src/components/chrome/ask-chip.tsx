"use client";

import { MessageCircleQuestion } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useReducer, useRef, useState } from "react";
import { AskSheet } from "@/components/ask/ask-sheet";
import { IncidentSheet } from "@/components/safety/incident-sheet";
import { Chip } from "@/components/ui/chip";
import { newRequestId, RpcError } from "@/data/port";
import { useAppState, useDataPort } from "@/data/store";
import { useMotionLock } from "@/hero/use-motion-lock";
import { incidentFromProposal } from "@/ask/ask";
import { isReplayRoute } from "@/replay/leave-guard";
import { incidentReducer, initialIncident, sendIncident } from "@/safety/incident-sheet";

/**
 * The Ask slot (A17, F19). The chip and the Ask sheet are hidden while the motion lock shows and inside
 * a replay (R1), so the answer key cannot be looked up mid-run (interaction-map §2). "Review and log"
 * (A18) closes Ask and opens the A13 incident sheet prefilled from `proposed_action`; the operator
 * confirms, the model writes nothing. The A13 copy stays mounted so a draft or a send in flight is not
 * lost when the lock appears, and focus returns to the chip when it closes.
 */
export function AskChip() {
  const [open, setOpen] = useState(false);
  const [incidentOpen, setIncidentOpen] = useState(false);
  const [incident, dispatch] = useReducer(incidentReducer, undefined, () => initialIncident(newRequestId()));
  const wrap = useRef<HTMLSpanElement>(null);
  const t = useTranslations("chrome");
  const pathname = usePathname();
  const port = useDataPort();
  const offline = useAppState((s) => s.connectivity.kind === "nosignal");
  const place = useAppState((s) => s.operator?.location ?? s.machine?.location ?? null);
  const ledgerSeq = useAppState((s) => s.ledgerSeqByCause);
  const serverLocked = useAppState((s) => s.operator?.motion_locked ?? false);
  const lockShown = useMotionLock(serverLocked);
  const hidden = isReplayRoute(pathname) || lockShown;

  const closeIncident = () => {
    if (incident.phase === "sent") dispatch({ type: "reset", requestId: newRequestId() });
    setIncidentOpen(false);
    requestAnimationFrame(() => wrap.current?.querySelector("button")?.focus());
  };
  const submit = () => {
    if (incident.phase === "sending" || incident.phase === "sent") return;
    dispatch({ type: "submit" });
    if (incident.kind === null || incident.severity === null) return;
    void sendIncident(incident, place, (input) => port.incidentLog(input), dispatch, (e) => (e instanceof RpcError ? e.code : "network"));
  };

  return (
    <>
      {hidden ? null : (
        <>
          <span ref={wrap} style={{ display: "contents" }}>
            <Chip onClick={() => setOpen(true)} icon={<MessageCircleQuestion className="icon" aria-hidden="true" />}>
              <span className="sr-only">{t("ask")}</span>
            </Chip>
          </span>
          <AskSheet
            open={open}
            onClose={() => setOpen(false)}
            onReview={(action) => {
              const draft = incidentFromProposal(action, newRequestId());
              dispatch({ type: "reset", requestId: draft.requestId });
              dispatch({ type: "restore", draft: { kind: draft.kind, severity: draft.severity, note: draft.note, requestId: draft.requestId } });
              setOpen(false);
              setIncidentOpen(true);
            }}
          />
        </>
      )}
      <IncidentSheet
        open={incidentOpen}
        onClose={closeIncident}
        state={incident}
        dispatch={dispatch}
        onSubmit={submit}
        offline={offline}
        restored={false}
        ledgerSeq={incident.eventId ? (ledgerSeq[incident.eventId] ?? null) : null}
        idPrefix="ask-incident"
      />
    </>
  );
}
