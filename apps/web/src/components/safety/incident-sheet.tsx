"use client";

import { Camera, HeartPulse, MoreHorizontal, TriangleAlert, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Dispatch, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Mark } from "@/components/ui/pictogram";
import { Plate } from "@/components/ui/plate";
import { Sheet } from "@/components/ui/sheet";
import { newRequestId } from "@/data/port";
import {
  INCIDENT_KINDS,
  kindAllowed,
  missingFields,
  NOTE_MAX,
  SEVERITIES,
  severityAllowed,
  type IncidentAction,
  type IncidentKind,
  type IncidentState,
  type Severity,
} from "@/safety/incident-sheet";

const KIND_ICON: Record<IncidentKind, ReactNode> = {
  near_miss: <TriangleAlert className="icon" aria-hidden="true" />,
  first_aid: <HeartPulse className="icon" aria-hidden="true" />,
  property_damage: <Wrench className="icon" aria-hidden="true" />,
  manual: <MoreHorizontal className="icon" aria-hidden="true" />,
};

/**
 * One big pictogram plate per severity. The shape carries the level without colour: circle 1,
 * triangle 3, octagon 5, with the number inside (safety colours are for live danger only).
 */
function SeverityGlyph({ level }: { level: Severity }) {
  const shape = level === 1 ? "M24 3 A21 21 0 1 1 23.9 3 Z" : level === 3 ? "M24 4 L45 42 L3 42 Z" : "M15.5 3 H32.5 L45 15.5 V32.5 L32.5 45 H15.5 L3 32.5 V15.5 Z";
  return (
    <svg viewBox="0 0 48 48" className="sev-glyph" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="4" strokeLinejoin="round">
      <path d={shape} />
      <text x="24" y={level === 3 ? 35 : 31} textAnchor="middle" fontSize="20" fontWeight="800" fill="currentColor" stroke="none" fontFamily="var(--ff-display)">
        {level}
      </text>
    </svg>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  state: IncidentState;
  dispatch: Dispatch<IncidentAction>;
  onSubmit: () => void;
  offline: boolean;
  restored: boolean;
  /** Ledger sequence once `incident.logged` arrived for the sent report. */
  ledgerSeq: number | null;
  /** Distinguishes element ids when a second instance is mounted (the Ask sheet's A18 copy). */
  idPrefix?: string;
};

/** A13 (interaction-map §4.4): one sheet, no steps. The draft is kept on failure and on reload. */
export function IncidentSheet({ open, onClose, state, dispatch, onSubmit, offline, restored, ledgerSeq, idPrefix = "incident" }: Props) {
  const t = useTranslations("incident");
  const tc = useTranslations("chrome");
  const missing = state.showMissing ? missingFields(state) : [];
  const sending = state.phase === "sending";
  const failed = state.phase === "failed";
  const nearMiss = state.kind === "near_miss";

  if (state.phase === "sent") {
    const next = t.raw(nearMiss ? "nextNearMiss" : "nextOther") as string[];
    return (
      <Sheet open={open} onClose={onClose} title={t("sent")}>
        <div className="flex flex-col gap-4">
          <p className="t-title flex items-center gap-3" role="status">
            <Mark kind="check" />
            {ledgerSeq !== null ? t("recorded", { seq: ledgerSeq }) : t("recording")}
          </p>
          <section className="flex flex-col gap-2" aria-labelledby={`${idPrefix}-next`}>
            <h3 id={`${idPrefix}-next`} className="t-label">
              {t("nextTitle")}
            </h3>
            <ol className="incident-next">
              {next.map((line) => (
                <li key={line} className="t-body">
                  {line}
                </li>
              ))}
            </ol>
          </section>
          <Button variant="primary" onClick={onClose}>
            {t("done")}
          </Button>
          <Button onClick={() => dispatch({ type: "reset", requestId: newRequestId() })}>{t("another")}</Button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("title")}>
      <form
        className="incident-form flex flex-col gap-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        {restored ? (
          <p className="t-meta text-ink-2" role="status">
            {t("draftRestored")}
          </p>
        ) : null}

        <fieldset className="choice-set" disabled={sending}>
          <legend className="t-label">{t("typeLegend")}</legend>
          <div className="choice-grid">
            {INCIDENT_KINDS.map((k) => (
              <label key={k} className="choice">
                <input type="radio" name="incident-kind" className="choice-input" checked={state.kind === k} disabled={!kindAllowed(k, state.severity)} onChange={() => dispatch({ type: "kind", kind: k })} />
                <span className="choice-body">
                  {KIND_ICON[k]}
                  <span className="t-label">{t(`type.${k}.label`)}</span>
                  <span className="t-meta choice-hint">{t(`type.${k}.hint`)}</span>
                </span>
              </label>
            ))}
          </div>
          {state.severity === 5 ? (
            <p className="t-label" role="note">
              {t("injuryNoNearMiss")}
            </p>
          ) : null}
          {missing.includes("kind") ? (
            <p className="t-label" role="alert">
              {t("missingKind")}
            </p>
          ) : null}
        </fieldset>

        {nearMiss ? (
          <Plate tone="sunk" rule="hair" role="note" className="flex items-start gap-3">
            <Mark kind="info" />
            <p className="t-body">{t("nearMissPrivacy")}</p>
          </Plate>
        ) : null}

        <fieldset className="choice-set" disabled={sending}>
          <legend className="t-label">{t("severityLegend")}</legend>
          <div className="choice-grid" data-cols="3">
            {SEVERITIES.map((n) => (
              <label key={n} className="choice" data-sev={n}>
                <input type="radio" name="incident-severity" className="choice-input" checked={state.severity === n} disabled={!severityAllowed(n, state.kind)} onChange={() => dispatch({ type: "severity", severity: n })} />
                <span className="choice-body">
                  <SeverityGlyph level={n} />
                  <span className="t-label">{t(`severity.${n}.label`)}</span>
                  <span className="t-meta choice-hint">{t(`severity.${n}.hint`)}</span>
                </span>
              </label>
            ))}
          </div>
          {state.kind === "near_miss" ? (
            <p className="t-label" role="note">
              {t("injuryNoNearMissHint")}
            </p>
          ) : null}
          {state.severity === 5 ? (
            <p className="t-label" role="note">
              {t("injuryNote")}
            </p>
          ) : null}
          {missing.includes("severity") ? (
            <p className="t-label" role="alert">
              {t("missingSeverity")}
            </p>
          ) : null}
        </fieldset>

        <div className="flex flex-col gap-2">
          <label htmlFor={`${idPrefix}-note`} className="t-label">
            {t("noteLabel")}
          </label>
          <textarea
            id={`${idPrefix}-note`}
            className="incident-note"
            rows={3}
            maxLength={NOTE_MAX}
            value={state.note}
            disabled={sending}
            placeholder={t("notePlaceholder")}
            onChange={(e) => dispatch({ type: "note", note: e.target.value })}
          />
          <p className="t-meta text-ink-2 tnum">{t("noteCount", { n: state.note.length, max: NOTE_MAX })}</p>
        </div>

        <Button size="dense" disabled icon={<Camera className="icon" aria-hidden="true" />} note={t("photoNote")}>
          {t("photo")}
        </Button>

        <div className="flex flex-col gap-2">
          <Button
            variant="primary"
            block
            type="submit"
            status={sending ? "loading" : failed ? "error" : "idle"}
            disabled={offline}
            note={offline ? tc("needsSignal") : failed ? t("failed") : undefined}
          >
            {failed ? tc("tryAgain") : t("submit")}
          </Button>
          {!offline && !failed ? <p className="t-meta text-ink-2">{t("draftSaved")}</p> : null}
        </div>
      </form>
    </Sheet>
  );
}
