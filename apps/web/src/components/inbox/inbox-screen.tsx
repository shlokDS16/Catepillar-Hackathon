"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { KIND_PICTO } from "@/alerts/kinds";
import { safetyTone } from "@/alerts/selectors";
import { InboxDetail, useRowMeta, useShortAge } from "@/components/inbox/inbox-detail";
import { OverrideSheet } from "@/components/inbox/override-sheet";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Pictogram } from "@/components/ui/pictogram";
import { Plate } from "@/components/ui/plate";
import { useAppState, useDataPort } from "@/data/store";
import type { AlertStatus } from "@/data/types";
import { tierChips, tierCounts } from "@/inbox/fm-band";
import { effectiveStatus, groupInbox, type InboxItem } from "@/inbox/inbox";
import { flat, moveSelection, resolveSelection, selectableIds, triage, unseenOpen, type SelectionKey } from "@/inbox/split";

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
 * right; Up/Down move the selection, Enter moves focus to the actions, Escape back to the list.
 * Below 1024 px: triage, the most urgent open alert expanded and the rest queued, one tap to promote.
 * What is on screen is pinned: an alert that arrives live is announced with a View button and never
 * replaces the alert being read. Near-miss rows stay non-punitive in both layouts.
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
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [overrideFor, setOverrideFor] = useState<InboxItem | null>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const leadRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const focusHeading = useRef(false);
  const keyMove = useRef(false);

  useEffect(() => {
    let live = true;
    void port
      .inbox()
      .then((rows) => {
        if (!live) return;
        setBase(rows);
        setFailed(false);
        // Pin what is on screen from the first load: later arrivals queue behind it instead of replacing it.
        const first = selectableIds(groupInbox(rows));
        setPicked((cur) => cur ?? first[0] ?? null);
        setSeen((cur) => (cur.size > 0 ? cur : new Set(first)));
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
  const all = useMemo(() => flat(groups), [groups]);
  const selectedId = resolveSelection(ids, picked);
  const triaged = useMemo(() => triage(groups, picked), [groups, picked]);

  const unseen = picked === null ? [] : unseenOpen(groups, seen);
  const pick = useCallback((id: string) => {
    setPicked(id);
    setSeen((s) => new Set(s).add(id));
  }, []);
  const viewNew = () => {
    const first = unseen[0];
    if (!first) return;
    focusHeading.current = true;
    setSeen((s) => new Set([...s, ...unseen.map((i) => i.id)]));
    setPicked(first.id);
  };

  // A successful Acknowledge shows at once; a later live change (resolved, escalated) takes over again.
  const markAcknowledged = (id: string) => {
    const from = alerts.find((a) => a.alert_id === id)?.status ?? base?.find((i) => i.id === id)?.status ?? "open";
    setLocal((m) => ({ ...m, [id]: { status: "acknowledged", from } }));
  };
  const markGranted = (id: string) => setGranted((s) => new Set(s).add(id));
  const showOnMap = useCallback(() => router.push("/fm/map"), [router]);

  // After a promote or View: focus the new alert's heading. After a key move: keep the row in view.
  useEffect(() => {
    if (focusHeading.current) {
      focusHeading.current = false;
      (desktop ? paneRef.current : leadRef.current)?.querySelector<HTMLElement>("[data-inbox-heading]")?.focus();
    }
    if (desktop && keyMove.current && selectedId) {
      keyMove.current = false;
      document.getElementById(`inbox-opt-${selectedId}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [desktop, selectedId, picked]);

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
  const detail = (item: InboxItem, variant: "pane" | "lead", position?: string) => (
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
      position={position}
    />
  );

  // "Critical 1 · Warning 1 · Caution 4": colour + pictogram + word + count, only tiers that have an open alert.
  const chips = tierChips(tierCounts(groups.needsAction));
  const tiers = chips.length === 0 ? null : (
    <ul className="inbox-tiers" aria-label={t("tierChips")}>
      {chips.map(({ tier, n }) => (
        <li key={tier}>
          <Chip tone={safetyTone(tier)} word icon={<Pictogram name="fault" />}>
            {t(`tier.${tier}`)} <span className="tnum">{n}</span>
          </Chip>
        </li>
      ))}
    </ul>
  );
  const sheet = <OverrideSheet item={overrideFor} onClose={() => setOverrideFor(null)} onGranted={markGranted} />;
  const top = unseen[0];
  const banner = (
    <div role="status" aria-live="polite" className="inbox-new">
      {top ? (
        <>
          <span className="t-label">{t("newAlert", { n: unseen.length, tier: t(`tier.${top.tier}`).toLowerCase() })}</span>
          <Button variant="primary" size="dense" onClick={viewNew}>{t("viewNew")}</Button>
        </>
      ) : null}
    </div>
  );

  if (desktop) {
    const selected = all.find((i) => i.id === selectedId) ?? null;
    const onKeyDown = (e: React.KeyboardEvent) => {
      if (KEYS.has(e.key)) {
        e.preventDefault();
        keyMove.current = true;
        pick(moveSelection(ids, selectedId, e.key as SelectionKey) ?? "");
      } else if (e.key === "Enter") {
        e.preventDefault();
        const pane = paneRef.current;
        (pane?.querySelector<HTMLElement>("[data-inbox-actions] button:not(:disabled), [data-inbox-actions] a") ?? pane?.querySelector<HTMLElement>("[data-inbox-heading]"))?.focus();
      }
    };
    // Escape from the pane goes back to the list.
    const onPaneKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Escape") listRef.current?.focus();
    };
    const sections: { key: string; label: string; rows: InboxItem[] }[] = [
      { key: "needs", label: t("listKicker", { n: groups.needsAction.length }), rows: groups.needsAction },
      { key: "handled", label: t("handled", { n: groups.handled.length }), rows: groups.handled },
      { key: "resolved", label: t("resolved", { n: groups.resolved.length }), rows: groups.resolved },
      { key: "suppressed", label: t("suppressed", { n: groups.suppressed.length }), rows: groups.suppressed },
    ];
    return (
      <div className="inbox-desktop">
        {banner}
        <div className="inbox-split">
          <div className="inbox-list-col">
            {tiers}
            {ids.length === 0 ? (
              <p className="t-body text-ink-2 inbox-empty">{t("empty")}</p>
            ) : (
              <div
                className="inbox-list"
                role="listbox"
                tabIndex={0}
                ref={listRef}
                aria-label={t("title")}
                aria-describedby="inbox-keys"
                aria-activedescendant={selectedId ? `inbox-opt-${selectedId}` : undefined}
                onKeyDown={onKeyDown}
              >
                {sections.map((s) =>
                  s.rows.length === 0 ? null : (
                    <div key={s.key} className="contents">
                      <div className="inbox-group-head t-caption" aria-hidden="true">{s.label}</div>
                      {s.rows.map((i) => (
                        <ListRow key={i.id} item={i} simNow={simNow} live={isLive(i)} selected={i.id === selectedId} groupLabel={s.key === "needs" ? null : s.label} option onPick={() => pick(i.id)} />
                      ))}
                    </div>
                  ),
                )}
              </div>
            )}
            <p id="inbox-keys" className="t-meta inbox-keys">{t("keysHint")}</p>
          </div>
          <div className="inbox-pane" ref={paneRef} onKeyDown={onPaneKeyDown}>
            {selected ? detail(selected, "pane") : <p className="t-body text-ink-2">{t("empty")}</p>}
          </div>
          {sheet}
        </div>
      </div>
    );
  }

  const { lead, queued } = triaged;
  const leadIndex = lead ? groups.needsAction.findIndex((i) => i.id === lead.id) : -1;
  const promote = (id: string) => {
    focusHeading.current = true;
    pick(id);
  };
  const fold = (label: string, rows: InboxItem[]) =>
    rows.length === 0 ? null : (
      <details className="inbox-fold">
        <summary className="t-label">{label}</summary>
        <div className="inbox-queue">
          {rows.filter((i) => i.id !== lead?.id).map((i) => (
            <ListRow key={i.id} item={i} simNow={simNow} live={false} selected={false} groupLabel={null} onPick={() => promote(i.id)} />
          ))}
        </div>
      </details>
    );
  return (
    <div className="inbox-triage">
      {banner}
      <p className="t-label inbox-count">
        {t("needsAction")} <span className="tnum">({groups.needsAction.length})</span>
      </p>
      {tiers}
      {lead === null ? (
        <p className="t-body text-ink-2">{t("empty")}</p>
      ) : (
        <div ref={leadRef}>{detail(lead, "lead", leadIndex >= 0 ? t("ofN", { i: leadIndex + 1, n: groups.needsAction.length }) : undefined)}</div>
      )}
      {queued.length > 0 ? (
        <section aria-label={t("queueLabel", { n: queued.length })} className="inbox-queue">
          <h2 className="t-label">{t("queueLabel", { n: queued.length })}</h2>
          {queued.map((i) => (
            <ListRow key={i.id} item={i} simNow={simNow} live={isLive(i)} selected={false} groupLabel={null} onPick={() => promote(i.id)} />
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
  /** Spoken status for rows outside Needs action (the visible group heading is hidden from the listbox). */
  groupLabel: string | null;
  /** Desktop list rows are listbox options driven by the list's arrow keys; mobile rows are plain buttons. */
  option?: boolean;
  onPick: () => void;
};

/** One compact row: chip and title, who and where below, the age in its own column. Only a live row carries colour. */
function ListRow({ item, simNow, live, selected, groupLabel, option = false, onPick }: ListRowProps) {
  const t = useTranslations("inbox");
  const meta = useRowMeta(item, simNow, false);
  const age = useShortAge(item, simNow);
  const tone = live ? safetyTone(item.tier) : "outline";
  const picto = item.kind === "near_miss" ? "proximity" : KIND_PICTO[item.kind];
  const body = (
    <>
      {option ? null : <span className="sr-only">{t("open")}: </span>}
      <span className="inbox-row-main">
        <span className="inbox-row-top">
          <Chip tone={tone} word icon={<Pictogram name={picto} />} count={item.occurrences}>
            {t(`tier.${item.tier}`)}
          </Chip>
          <span className="t-title inbox-row-title">{t(`kind.${item.kind}`)}</span>
        </span>
        {meta ? <span className="t-meta text-ink-2">{meta}</span> : null}
      </span>
      <span className="inbox-row-age t-caption tnum">{age}</span>
      {groupLabel ? <span className="sr-only">{groupLabel}</span> : null}
    </>
  );
  const common = { className: "inbox-row-compact", "data-live": live || undefined, "data-tier": live ? item.tier : undefined, onClick: onPick };
  if (option) {
    return (
      <div id={`inbox-opt-${item.id}`} role="option" aria-selected={selected} data-selected={selected || undefined} {...common}>
        {body}
      </div>
    );
  }
  return (
    <button type="button" {...common}>
      {body}
    </button>
  );
}
