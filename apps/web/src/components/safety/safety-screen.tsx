"use client";

import { Map as MapIcon, Megaphone } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useReducer, useRef, useState } from "react";
import { KIND_PICTO } from "@/alerts/kinds";
import { useSafetyState } from "@/alerts/use-safety-state";
import { IncidentSheet } from "@/components/safety/incident-sheet";
import { Button, type ButtonStatus } from "@/components/ui/button";
import { Mark, Pictogram } from "@/components/ui/pictogram";
import { Plate } from "@/components/ui/plate";
import { ProvenanceChip } from "@/components/ui/provenance";
import { newRequestId, RpcError } from "@/data/port";
import { useAppState, useDataPort } from "@/data/store";
import type { AlertRecord } from "@/data/types";
import { deriveChecks, liveTierFor, splitAlerts, type CheckKey } from "@/safety/checks";
import {
  incidentReducer,
  initialIncident,
  isEmptyDraft,
  loadDraft,
  saveDraft,
  sendIncident,
  sessionStore,
} from "@/safety/incident-sheet";

type Ui = { open: boolean; restored: boolean; hydrated: boolean };
type UiAction = { type: "open" } | { type: "close" } | { type: "hydrated"; restored: boolean } | { type: "clearRestored" };
function uiReducer(s: Ui, a: UiAction): Ui {
  switch (a.type) {
    case "open":
      return { ...s, open: true };
    case "close":
      return { ...s, open: false };
    case "hydrated":
      return { open: a.restored, restored: a.restored, hydrated: true };
    case "clearRestored":
      return { ...s, restored: false };
  }
}

const tierTone = (a: AlertRecord) => (a.tier === "info" ? "surface" : a.tier);

/**
 * S3 Safety (screens.md): active alerts with a status line, the four checks (ink unless a live alert
 * colours them), recent alerts, the Map entry (D14) and [Report something] (A13).
 */
export function SafetyScreen() {
  const t = useTranslations("safety");
  const tc = useTranslations();
  const format = useFormatter();
  const port = useDataPort();
  const { safety } = useSafetyState();
  const alerts = useAppState((s) => s.alerts);
  const machine = useAppState((s) => s.machine);
  const operator = useAppState((s) => s.operator);
  const snapshot = useAppState((s) => s.snapshot);
  const ledgerSeq = useAppState((s) => s.ledgerSeq);
  const offline = useAppState((s) => s.connectivity.kind === "nosignal");

  const [incident, dispatch] = useReducer(incidentReducer, undefined, () => initialIncident(newRequestId()));
  const [ui, uiDispatch] = useReducer(uiReducer, { open: false, restored: false, hydrated: false });
  const { open, restored, hydrated } = ui;

  // Restore an unfinished report after a reload, then start saving. Saving waits for this so the
  // empty first render never wipes the stored draft.
  useEffect(() => {
    const draft = loadDraft(sessionStore());
    if (draft) {
      dispatch({ type: "restore", draft });
    }
    uiDispatch({ type: "hydrated", restored: draft !== null });
  }, []);
  useEffect(() => {
    if (hydrated) saveDraft(sessionStore(), incident);
  }, [hydrated, incident]);

  const place = operator?.location ?? machine?.location ?? null;
  const submit = () => {
    if (incident.phase === "sending" || incident.phase === "sent") return;
    dispatch({ type: "submit" });
    if (incident.kind === null || incident.severity === null) return;
    uiDispatch({ type: "clearRestored" });
    void sendIncident(incident, place, (input) => port.incidentLog(input), dispatch, (e) => (e instanceof RpcError ? e.code : "network"));
  };

  const checks = deriveChecks(machine, operator, snapshot?.weather);
  const { active, recent } = splitAlerts(alerts);
  const hasDraft = hydrated && !isEmptyDraft(incident) && incident.phase !== "sent";
  const time = (iso: string) => format.dateTime(new Date(iso), "time");

  return (
    <div className="safety-screen">
      <div className="safety-main">
        {safety === "nosignal" ? (
          <Plate tone="nosignal" rule="heavy" role="status" className="flex flex-col gap-1">
            <p className="t-title">{tc("enums.safety.nosignal")}</p>
            <p className="t-body">{t("noSignalNote")}</p>
          </Plate>
        ) : active.length === 0 ? (
          <Plate tone="clear" rule="heavy" role="status" className="flex items-center gap-3">
            <Mark kind="check" />
            <div>
              <p className="t-title">{t("clearTitle")}</p>
              <p className="t-body">{t("clearNote")}</p>
            </div>
          </Plate>
        ) : (
          <section className="flex flex-col gap-3" aria-labelledby="safety-active">
            <h2 id="safety-active" className="t-label">
              {t("activeTitle")}
            </h2>
            {active.map((a) => (
              <ActiveAlertRow key={a.alert_id} alert={a} time={time(a.first_seen)} />
            ))}
          </section>
        )}

        <div className="flex flex-col gap-3">
          <Button variant="primary" block icon={<Megaphone className="icon" aria-hidden="true" />} onClick={() => uiDispatch({ type: "open" })} note={hasDraft ? t("reportDraft") : t("reportNote")}>
            {t("report")}
          </Button>
          <Button href="/op/map" block icon={<MapIcon className="icon" aria-hidden="true" />}>
            {t("openMap")}
          </Button>
        </div>
      </div>

      <div className="safety-side">
        <section className="flex flex-col gap-3" aria-labelledby="safety-checks">
          <h2 id="safety-checks" className="t-label">
            {t("checksTitle")}
          </h2>
          <div className="check-grid">
            <CheckPlate label={t("seatbelt.label")} live={liveTierFor(alerts, "seatbelt")} keyName="seatbelt">
              <p className="t-title">{t(`seatbelt.${checks.seatbelt}`)}</p>
              <ProvenanceChip table="machine_state" field="seatbelt_fastened" />
            </CheckPlate>

            <CheckPlate label={t("ppe.label")} live={liveTierFor(alerts, "ppe")} keyName="ppe">
              <ul className="check-ppe">
                {checks.ppe.map((p) => (
                  <li key={p.item} className="t-body flex items-center gap-2">
                    <Mark kind={p.state === "on" ? "check" : p.state === "off" ? "cross" : "info"} />
                    <span>
                      {t(`ppe.item.${p.item}`)} <span className="t-meta">{t(`ppe.${p.state}`)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <ProvenanceChip table="operator_state" field="ppe" />
            </CheckPlate>

            <CheckPlate label={t("proximity.label")} live={liveTierFor(alerts, "proximity")} keyName="proximity">
              <p className="t-title tnum">
                {checks.proximity.kind === "none"
                  ? t("proximity.none")
                  : `${t(`proximity.${checks.proximity.what}`, { m: checks.proximity.distance_m })} · ${t(`proximity.zone.${operator?.nearest?.zone ?? "awareness"}`)}`}
              </p>
              <ProvenanceChip table="operator_state" field="nearest" />
            </CheckPlate>

            <CheckPlate label={t("conditions.label")} live={null} keyName="conditions">
              <p className="t-title tnum">{checks.wbgt_c === null ? t("conditions.unknown") : t("conditions.wbgt", { c: Math.round(checks.wbgt_c * 10) / 10 })}</p>
              <ProvenanceChip table="weather_snapshots" field="wbgt_c" />
            </CheckPlate>
          </div>
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="safety-recent">
          <h2 id="safety-recent" className="t-label">
            {t("recentTitle")}
          </h2>
          {recent.length === 0 ? (
            <p className="t-body text-ink-2">{t("recentNone")}</p>
          ) : (
            <ul className="recent-list">
              {recent.map((a) => (
                <li key={a.alert_id} className="recent-row">
                  <Pictogram name={KIND_PICTO[a.kind]} shape="none" />
                  <span className="t-label">{tc(`alerts.kind.${a.kind}`)}</span>
                  <span className="t-meta text-ink-2 tnum">
                    {time(a.first_seen)} · {t(`status.${a.status === "resolved" ? "resolved" : "acknowledged"}`)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <IncidentSheet
        open={open}
        onClose={() => uiDispatch({ type: "close" })}
        state={incident}
        dispatch={dispatch}
        onSubmit={submit}
        offline={offline}
        restored={restored}
        ledgerSeq={incident.eventId ? (ledgerSeq[incident.eventId] ?? null) : null}
      />
    </div>
  );
}

function CheckPlate({ label, live, keyName, children }: { label: string; live: ReturnType<typeof liveTierFor>; keyName: CheckKey | "conditions"; children: React.ReactNode }) {
  return (
    <Plate as="div" tone={live ?? "surface"} className="check-plate" data-check={keyName}>
      <p className="t-label">{label}</p>
      {children}
    </Plate>
  );
}

/** An alert that still needs the operator: tier plate, status line, and Acknowledge when the contract says so. */
function ActiveAlertRow({ alert, time }: { alert: AlertRecord; time: string }) {
  const t = useTranslations("safety");
  const tc = useTranslations();
  const port = useDataPort();
  const [status, setStatus] = useState<ButtonStatus>("idle");
  const requestId = useRef<string | null>(null);
  const canAck = alert.needs_ack && alert.status === "open";

  async function ack() {
    setStatus("loading");
    requestId.current ??= newRequestId();
    try {
      await port.alertAck({ p_alert_id: alert.alert_id, p_request_id: requestId.current });
      requestId.current = null;
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  return (
    <Plate tone={tierTone(alert)} rule="heavy" className="alert-row">
      <div className="flex items-center gap-3">
        <Pictogram name={KIND_PICTO[alert.kind]} size="lg" />
        <div className="flex flex-col gap-1">
          <p className="t-title">{tc(`alerts.kind.${alert.kind}`)}</p>
          <p className="t-meta tnum">
            {tc(`enums.safety.${alert.tier === "info" ? "caution" : alert.tier}`)} · {time}
            {alert.occurrences > 1 ? ` · ${tc("alerts.occurrences", { n: alert.occurrences })}` : ""}
          </p>
        </div>
      </div>
      <p className="t-body">{t(`status.${alert.status === "suppressed" || alert.status === "resolved" || alert.status === "acknowledged" ? "open" : alert.status}`)}</p>
      {canAck ? (
        <Button variant="primary" status={status} note={status === "error" ? tc("alerts.notSent") : undefined} onClick={ack}>
          {tc("alerts.acknowledge")}
        </Button>
      ) : null}
    </Plate>
  );
}
