"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { KIND_PICTO } from "@/alerts/kinds";
import { safetyTone } from "@/alerts/selectors";
import { OverrideSheet } from "@/components/inbox/override-sheet";
import { AnomalyExplain } from "@/components/map/anomaly-explain";
import { Button, type ButtonStatus } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Pictogram } from "@/components/ui/pictogram";
import { Plate } from "@/components/ui/plate";
import { newRequestId } from "@/data/port";
import { useAppState, useDataPort } from "@/data/store";
import type { AlertStatus, Lang } from "@/data/types";
import { groupInbox, parseDispatch, rowActions, toggleExpanded, type InboxItem } from "@/inbox/inbox";

/**
 * S7 /fm: open alerts by tier then age, each row with who, where, how long, how often, the dispatch
 * line and its actions (A20 Acknowledge, A21 Grant override, A24 Show on map). Anomaly rows carry
 * the explanation sentence as their second line and expand to the full AnomalyExplain. Near-miss
 * rows are non-punitive: no operator name, no Acknowledge. Handled, resolved and suppressed rows
 * sit in folds underneath.
 */
export function InboxScreen() {
  const port = useDataPort();
  const t = useTranslations("inbox");
  const router = useRouter();
  const alerts = useAppState((s) => s.alerts);
  const dispatch = useAppState((s) => s.dispatch);
  const simNow = useAppState((s) => s.clock?.sim_now ?? null);
  const [base, setBase] = useState<InboxItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [local, setLocal] = useState<Record<string, AlertStatus>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [overrideFor, setOverrideFor] = useState<InboxItem | null>(null);

  useEffect(() => {
    let live = true;
    void port
      .inbox()
      .then((rows) => {
        if (!live) return;
        setBase(rows);
        setFailed(false);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [port, attempt]);

  // Live store state wins over the loaded rows; alerts the store raised since load get a minimal row.
  const items = useMemo(() => {
    if (!base) return [];
    const byId = new Map(base.map((i) => [i.id, i]));
    const merged = base.map((i) => {
      const live = alerts.find((a) => a.alert_id === i.id);
      const line = dispatch[i.id]?.at(-1) ?? i.dispatch;
      return { ...i, status: local[i.id] ?? live?.status ?? i.status, occurrences: live?.occurrences ?? i.occurrences, dispatch: line };
    });
    const extra: InboxItem[] = alerts
      .filter((a) => !byId.has(a.alert_id))
      .map((a) => ({
        id: a.alert_id, kind: a.kind, tier: a.tier, status: local[a.alert_id] ?? a.status, needsAck: a.needs_ack, occurrences: a.occurrences,
        firstSeen: a.first_seen, operatorName: null, machineCode: null, taskId: null, taskBlocked: false, missing: [],
        dispatch: dispatch[a.alert_id]?.at(-1) ?? null, anomaly: null, nonPunitive: false,
      }));
    return [...merged, ...extra];
  }, [base, alerts, dispatch, local]);

  const groups = useMemo(() => groupInbox(items), [items]);
  const markHandled = useCallback((id: string) => setLocal((m) => ({ ...m, [id]: "acknowledged" })), []);

  if (failed && !base) {
    return (
      <Plate as="section" className="flex flex-col items-start gap-4" aria-label={t("title")}>
        <p className="t-body">{t("loadFailed")}</p>
        <Button onClick={() => setAttempt((n) => n + 1)}>{t("retry")}</Button>
      </Plate>
    );
  }
  if (!base) return <Plate loading className="min-h-hit-sos" />;

  const row = (item: InboxItem, live: boolean) => (
    <InboxRow
      key={item.id}
      item={item}
      live={live}
      simNow={simNow}
      expanded={expanded.has(item.id)}
      onToggle={() => setExpanded((s) => toggleExpanded(s, item.id))}
      onAcknowledged={markHandled}
      onGrant={() => setOverrideFor(item)}
      onShowOnMap={() => router.push("/fm/map")}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      <h1 className="t-title">{t("title")}</h1>

      <section aria-label={t("needsAction")} className="flex flex-col gap-4">
        <h2 className="t-label">
          {t("needsAction")} <span className="tnum">({groups.needsAction.length})</span>
        </h2>
        {groups.needsAction.length === 0 ? <p className="t-body text-ink-2">{t("empty")}</p> : groups.needsAction.map((i) => row(i, true))}
      </section>

      <Fold label={t("handled", { n: groups.handled.length })} count={groups.handled.length}>
        {groups.handled.map((i) => row(i, false))}
      </Fold>
      <Fold label={t("resolved", { n: groups.resolved.length })} count={groups.resolved.length}>
        {groups.resolved.map((i) => row(i, false))}
      </Fold>
      <Fold label={t("suppressed", { n: groups.suppressed.length })} count={groups.suppressed.length}>
        {groups.suppressed.map((i) => row(i, false))}
      </Fold>

      <OverrideSheet item={overrideFor} onClose={() => setOverrideFor(null)} onGranted={markHandled} />
    </div>
  );
}

function Fold({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <details className="inbox-fold">
      <summary className="t-label">{label}</summary>
      <div className="flex flex-col gap-4 pt-3">{children}</div>
    </details>
  );
}

type RowProps = {
  item: InboxItem;
  /** Colour only while the alert is live and open. */
  live: boolean;
  simNow: string | null;
  expanded: boolean;
  onToggle: () => void;
  onAcknowledged: (id: string) => void;
  onGrant: () => void;
  onShowOnMap: () => void;
};

function InboxRow({ item, live, simNow, expanded, onToggle, onAcknowledged, onGrant, onShowOnMap }: RowProps) {
  const t = useTranslations("inbox");
  const lang = useLocale() as Lang;
  const port = useDataPort();
  const [ack, setAck] = useState<ButtonStatus>("idle");
  const [requestId] = useState(newRequestId);
  const actions = rowActions(item);
  const anomaly = item.anomaly;
  const sentence = anomaly ? (lang === "hi" ? anomaly.explanation.hi : anomaly.explanation.en) : null;
  const dispatch = parseDispatch(item.dispatch);
  const ageMin = simNow ? Math.max(0, Math.floor((Date.parse(simNow) - Date.parse(item.firstSeen)) / 60_000)) : null;
  const detailsId = `inbox-detail-${item.id}`;
  const tone = live ? safetyTone(item.tier) : "outline";
  const picto = item.kind === "near_miss" ? "proximity" : KIND_PICTO[item.kind];

  async function acknowledge() {
    setAck("loading");
    try {
      await port.alertAck({ p_alert_id: item.id, p_request_id: requestId });
      setAck("success");
      onAcknowledged(item.id);
    } catch {
      setAck("error");
    }
  }

  return (
    <Plate as="article" rule={live ? "heavy" : "normal"} className="inbox-row" aria-label={t(`kind.${item.kind}`)}>
      <div className="inbox-head">
        <Chip tone={tone} word icon={<Pictogram name={picto} />} count={item.occurrences}>
          {t(`tier.${item.tier}`)}
        </Chip>
        <p className="t-title">{t(`kind.${item.kind}`)}</p>
      </div>

      <p className="t-label text-ink-2">
        {item.nonPunitive ? t("noOperator") : item.operatorName}
        {!item.nonPunitive && item.operatorName && item.machineCode ? " · " : null}
        {item.nonPunitive && item.machineCode ? " · " : null}
        {item.machineCode}
        {" · "}
        <span className="tnum">{ageMin === null ? "" : ageMin === 0 ? t("ageNow") : t("age", { m: ageMin })}</span>
      </p>

      {item.missing.length > 0 ? <p className="t-body">{t("missing", { items: item.missing.map((m) => t(`ppe.${m}`)).join(", ") })}</p> : null}

      {sentence && !expanded ? (
        <p className="t-body" lang={lang === "hi" ? undefined : "en"}>
          {sentence}
        </p>
      ) : null}

      {dispatch ? (
        <p className="t-meta text-ink-2">
          {t("dispatch", { channel: t(`channel.${dispatch.channel}`), status: t(`dispatchStatus.${dispatch.status}`) })}
        </p>
      ) : null}

      {anomaly && expanded ? (
        <div id={detailsId}>
          <AnomalyExplain anomaly={anomaly} variant="full" live={live} detectedAt={item.firstSeen} onShowOnMap={actions.showOnMap ? onShowOnMap : undefined} />
        </div>
      ) : null}

      <div className="inbox-actions">
        {actions.acknowledge ? (
          <Button variant="primary" status={ack} note={ack === "error" ? t("notSent") : undefined} onClick={acknowledge}>
            {t("acknowledge")}
          </Button>
        ) : null}
        {actions.override ? <Button onClick={onGrant}>{t("grantOverride")}</Button> : null}
        {anomaly ? (
          <Button aria-expanded={expanded} aria-controls={detailsId} onClick={onToggle}>
            {expanded ? t("hideDetails") : t("details")}
          </Button>
        ) : null}
        {actions.showOnMap && !anomaly ? <Button onClick={onShowOnMap}>{t("showOnMap")}</Button> : null}
      </div>
    </Plate>
  );
}
