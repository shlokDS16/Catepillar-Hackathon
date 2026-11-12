"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { KIND_PICTO } from "@/alerts/kinds";
import { safetyTone } from "@/alerts/selectors";
import { InboxDetail, useRowMeta } from "@/components/inbox/inbox-detail";
import { OverrideSheet } from "@/components/inbox/override-sheet";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Pictogram } from "@/components/ui/pictogram";
import { Plate } from "@/components/ui/plate";
import { useAppState, useDataPort } from "@/data/store";
import type { AlertStatus } from "@/data/types";
import { effectiveStatus, groupInbox, type InboxItem } from "@/inbox/inbox";
import { moveSelection, resolveSelection, selectableIds, triage, type SelectionKey } from "@/inbox/split";

const DESKTOP = "(min-width: 1024px)";
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(DESKTOP);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
/** True from 1024 px: split list and detail. Below it the Inbox is a triage stack. */
function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(DESKTOP).matches, () => false);
}

const KEYS = new Set<string>(["ArrowDown", "ArrowUp", "Home", "End"]);

/**
 * S7 /fm. 1024 px and up: a list on the left (tier, then age), the selected alert in full on the
 * right (explanation, signal, dispatch timeline, actions); Up/Down move the selection, Enter moves
 * focus to the actions. Below 1024 px: triage, the most urgent open alert expanded and the rest
 * queued as compact rows, one tap to promote. Near-miss rows stay non-punitive in both layouts.
 */
export function InboxScreen() {
  const port = useDataPort();
  const t = useTranslations("inbox");
  const router = useRouter();
  const desktop = useIsDesktop();
  const alerts = useAppState((s) => s.alerts);
  const dispatch = useAppState((s) => s.dispatch);
  const simNow = useAppState((s) => s.clock?.sim_now ?? null);
  const [base, setBase] = useState<InboxItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [local, setLocal] = useState<Record<string, { status: AlertStatus; from: AlertStatus }>>({});
  const [granted, setGranted] = useState<Set<string>>(() => new Set());
  const [picked, setPicked] = useState<string | null>(null);
  const [overrideFor, setOverrideFor] = useState<InboxItem | null>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const leadRef = useRef<HTMLDivElement>(null);

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
      return { ...i, status: effectiveStatus(i.status, live?.status, local[i.id]), occurrences: live?.occurrences ?? i.occurrences, dispatch: line };
    });
    const extra: InboxItem[] = alerts
      .filter((a) => !byId.has(a.alert_id))
      .map((a) => ({
        id: a.alert_id, kind: a.kind, tier: a.tier, status: effectiveStatus(a.status, a.status, local[a.alert_id]), needsAck: a.needs_ack, occurrences: a.occurrences,
        firstSeen: a.first_seen, operatorName: null, machineCode: null, taskId: null, taskBlocked: false, missing: [],
        dispatch: dispatch[a.alert_id]?.at(-1) ?? null, anomaly: null, nonPunitive: false,
      }));
    return [...merged, ...extra];
  }, [base, alerts, dispatch, local]);

  const groups = useMemo(() => groupInbox(items), [items]);
  const ids = useMemo(() => selectableIds(groups), [groups]);
  const selectedId = resolveSelection(ids, picked);
  const all = useMemo(() => [...groups.needsAction, ...groups.handled, ...groups.resolved, ...groups.suppressed], [groups]);
  const triaged = useMemo(() => triage(groups, picked), [groups, picked]);

  // A successful Acknowledge shows at once; a later live change (resolved, escalated) takes over again.
  const markAcknowledged = (id: string) => {
    const from = alerts.find((a) => a.alert_id === id)?.status ?? base?.find((i) => i.id === id)?.status ?? "open";
    setLocal((m) => ({ ...m, [id]: { status: "acknowledged", from } }));
  };
  const markGranted = (id: string) => setGranted((s) => new Set(s).add(id));
  const showOnMap = useCallback(() => router.push("/fm/map"), [router]);

  // Keep the highlighted row in view while the arrow keys move through a long list.
  useEffect(() => {
    if (desktop && selectedId) document.getElementById(`inbox-opt-${selectedId}`)?.scrollIntoView({ block: "nearest" });
  }, [desktop, selectedId]);

  if (failed && !base) {
    return (
      <Plate as="section" className="flex flex-col items-start gap-4" aria-label={t("title")}>
        <p className="t-body">{t("loadFailed")}</p>
        <Button
          onClick={() => {
            setFailed(false);
            setAttempt((n) => n + 1);
          }}
        >{t("retry")}</Button>
      </Plate>
    );
  }
  if (!base) return <Plate loading className="min-h-hit-sos" />;

  const isLive = (i: InboxItem) => i.status === "open";
  const detail = (item: InboxItem, variant: "pane" | "lead") => (
    <InboxDetail
      key={item.id}
      item={item}
      live={isLive(item)}
      simNow={simNow}
      lines={dispatch[item.id] ?? []}
      granted={granted.has(item.id)}
      onAcknowledged={markAcknowledged}
      onGrant={() => setOverrideFor(item)}
      onShowOnMap={showOnMap}
      variant={variant}
    />
  );

  const sheet = <OverrideSheet item={overrideFor} onClose={() => setOverrideFor(null)} onGranted={markGranted} />;

  if (desktop) {
    const selected = all.find((i) => i.id === selectedId) ?? null;
    const onKeyDown = (e: React.KeyboardEvent) => {
      if (KEYS.has(e.key)) {
        e.preventDefault();
        setPicked(moveSelection(ids, selectedId, e.key as SelectionKey));
      } else if (e.key === "Enter") {
        e.preventDefault();
        paneRef.current?.querySelector<HTMLElement>("[data-inbox-actions] button:not(:disabled), [data-inbox-actions] a")?.focus();
      }
    };
    const sections: { key: string; label: string; rows: InboxItem[] }[] = [
      { key: "needs", label: `${t("needsAction")} (${groups.needsAction.length})`, rows: groups.needsAction },
      { key: "handled", label: t("handled", { n: groups.handled.length }), rows: groups.handled },
      { key: "resolved", label: t("resolved", { n: groups.resolved.length }), rows: groups.resolved },
      { key: "suppressed", label: t("suppressed", { n: groups.suppressed.length }), rows: groups.suppressed },
    ];
    return (
      <div className="inbox-split">
        <div className="inbox-list-col">
          <p className="t-meta inbox-keys">{t("keysHint")}</p>
          <div
            className="inbox-list"
            role="listbox"
            tabIndex={0}
            aria-label={t("title")}
            aria-activedescendant={selectedId ? `inbox-opt-${selectedId}` : undefined}
            onKeyDown={onKeyDown}
          >
            {ids.length === 0 ? <p className="t-body text-ink-2 inbox-empty">{t("empty")}</p> : null}
            {sections.map((s) =>
              s.rows.length === 0 ? null : (
                <div role="group" aria-label={s.label} key={s.key}>
                  <h2 className="t-label inbox-group-head">{s.label}</h2>
                  {s.rows.map((i) => (
                    <ListRow key={i.id} item={i} simNow={simNow} live={isLive(i)} selected={i.id === selectedId} option onPick={() => setPicked(i.id)} />
                  ))}
                </div>
              ),
            )}
          </div>
        </div>
        <div className="inbox-pane" ref={paneRef}>
          {selected ? detail(selected, "pane") : <p className="t-body text-ink-2">{t("empty")}</p>}
        </div>
        {sheet}
      </div>
    );
  }

  const { lead, queued } = triaged;
  const promote = (id: string) => {
    setPicked(id);
    leadRef.current?.scrollIntoView({ block: "start" });
  };
  const fold = (label: string, rows: InboxItem[]) =>
    rows.length === 0 ? null : (
      <details className="inbox-fold">
        <summary className="t-label">{label}</summary>
        <div className="inbox-queue">
          {rows.filter((i) => i.id !== lead?.id).map((i) => (
            <ListRow key={i.id} item={i} simNow={simNow} live={false} selected={false} onPick={() => promote(i.id)} />
          ))}
        </div>
      </details>
    );
  return (
    <div className="inbox-triage">
      <p className="t-label inbox-count">
        {t("needsAction")} <span className="tnum">({groups.needsAction.length})</span>
      </p>
      {lead === null ? <p className="t-body text-ink-2">{t("empty")}</p> : <div ref={leadRef}>{detail(lead, "lead")}</div>}
      {queued.length > 0 ? (
        <section aria-label={t("queueLabel", { n: queued.length })} className="inbox-queue">
          <h2 className="t-label">{t("queueLabel", { n: queued.length })}</h2>
          {queued.map((i) => (
            <ListRow key={i.id} item={i} simNow={simNow} live={isLive(i)} selected={false} onPick={() => promote(i.id)} />
          ))}
        </section>
      ) : null}
      {fold(t("handled", { n: groups.handled.length }), groups.handled)}
      {fold(t("resolved", { n: groups.resolved.length }), groups.resolved)}
      {fold(t("suppressed", { n: groups.suppressed.length }), groups.suppressed)}
      {sheet}
    </div>
  );
}

type ListRowProps = {
  item: InboxItem;
  simNow: string | null;
  live: boolean;
  selected: boolean;
  /** Desktop list rows are listbox options driven by the list's arrow keys; mobile rows are plain buttons. */
  option?: boolean;
  onPick: () => void;
};

/** One compact row: tier word, kind, who/where/when. The tier chip carries the colour; the rest stays ink. */
function ListRow({ item, simNow, live, selected, option = false, onPick }: ListRowProps) {
  const t = useTranslations("inbox");
  const meta = useRowMeta(item, simNow);
  const tone = live ? safetyTone(item.tier) : "outline";
  const picto = item.kind === "near_miss" ? "proximity" : KIND_PICTO[item.kind];
  const body = (
    <>
      <Chip tone={tone} word icon={<Pictogram name={picto} />} count={item.occurrences}>
        {t(`tier.${item.tier}`)}
      </Chip>
      <span className="inbox-row-text">
        <span className="t-title inbox-row-title">{t(`kind.${item.kind}`)}</span>
        <span className="t-meta tnum text-ink-2">{meta}</span>
      </span>
    </>
  );
  if (option) {
    return (
      <div id={`inbox-opt-${item.id}`} role="option" aria-selected={selected} className="inbox-row-compact" data-selected={selected || undefined} data-live={live || undefined} data-tier={live ? item.tier : undefined} onClick={onPick}>
        {body}
      </div>
    );
  }
  return (
    <button type="button" className="inbox-row-compact" data-live={live || undefined} data-tier={live ? item.tier : undefined} aria-label={t("promote", { kind: t(`kind.${item.kind}`) })} onClick={onPick}>
      {body}
    </button>
  );
}
