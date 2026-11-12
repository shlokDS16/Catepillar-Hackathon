"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { FactorRows } from "@/components/task/factor-rows";
import { PpePlate } from "@/components/task/ppe-plate";
import { Button, type ButtonStatus } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Plate } from "@/components/ui/plate";
import { Sheet } from "@/components/ui/sheet";
import { useMode } from "@/data/mode";
import { newRequestId, RpcError } from "@/data/port";
import { useAppState, useDataPort } from "@/data/store";
import { currentTask, workState } from "@/hero/work-state";
import { derivePpe, elapsedMin, taskActions } from "@/task/task-state";

type Intent = "start" | "pause" | "complete";

/**
 * S2 Task (screens.md): PPE block plate (L1), title + state word + primary and secondary action
 * (L2), progress, ETA and elapsed (L3), why this estimate (L4). A06 Start/Resume, A07 Pause, A08
 * Complete with a confirmation. One request_id per intent, reused on retry (interaction-map §3).
 */
export function TaskScreen() {
  const t = useTranslations("task");
  const tc = useTranslations();
  const format = useFormatter();
  const { mode } = useMode();
  const port = useDataPort();
  const snapshot = useAppState((s) => s.snapshot);
  const machine = useAppState((s) => s.machine);
  const tasks = useAppState((s) => s.tasks);
  const ppeMissing = useAppState((s) => s.ppeMissing);
  const override = useAppState((s) => s.ppeOverride);
  const startedAt = useAppState((s) => s.taskStartedAt);
  const clock = useAppState((s) => s.clock);
  const offline = useAppState((s) => s.connectivity.kind === "nosignal");
  const detailed = mode === "detailed";

  const [status, setStatus] = useState<Record<Intent, ButtonStatus>>({ start: "idle", pause: "idle", complete: "idle" });
  const [error, setError] = useState<{ intent: Intent; code: string } | null>(null);
  const [serverExpired, setServerExpired] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [completed, setCompleted] = useState<string | null>(null);
  const ids = useRef<Partial<Record<Intent, string>>>({});
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((x) => window.clearTimeout(x)), []);

  const task = currentTask(tasks);
  const nowMs = clock ? Date.parse(clock.sim_now) : Date.parse(snapshot?.server_now ?? "1970-01-01T00:00:00Z");

  if (!snapshot) {
    return (
      <div className="task-screen">
        <Plate loading className="min-h-hit-sos" />
        <Plate loading className="min-h-hit" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="task-screen">
        {completed ? (
          <p className="t-title flex items-center gap-3" role="status">
            {t("completed", { task: completed })}
          </p>
        ) : null}
        <p className="t-body text-ink-2">{t("noTask")}</p>
      </div>
    );
  }

  const ppe = derivePpe({
    taskId: task.id,
    status: task.status,
    missing: ppeMissing,
    override,
    nowMs,
    serverExpired: serverExpired === task.id,
  });
  const actions = taskActions(task.status, ppe);
  const state = workState(machine, task);
  const taskName = tc(`enums.task.${task.task_type}`);
  const elapsed = elapsedMin(startedAt[task.id], nowMs);
  const missingItems = ppe.kind === "blocked" || ppe.kind === "expired" ? ppe.missing.map((i) => (tc.has(`task.ppe.item.${i}`) ? tc(`task.ppe.item.${i}`) : i)).join(", ") : "";

  const setIntent = (intent: Intent, s: ButtonStatus) => setStatus((prev) => ({ ...prev, [intent]: s }));
  const idFor = (intent: Intent) => (ids.current[intent] ??= newRequestId());
  const flashSuccess = (intent: Intent) => {
    setIntent(intent, "success");
    timers.current.push(window.setTimeout(() => setIntent(intent, "idle"), 1200));
  };
  const fail = (intent: Intent, e: unknown) => {
    setIntent(intent, "error");
    setError({ intent, code: e instanceof RpcError ? e.code : "network" });
  };

  async function start() {
    setError(null);
    setIntent("start", "loading");
    try {
      const out = await port.taskStart({
        p_task_id: task!.id,
        p_request_id: idFor("start"),
        p_eta_p50_min: task!.eta_p50_min != null && task!.eta_p50_min > 0 ? task!.eta_p50_min : null,
        p_eta_p90_min: task!.eta_p90_min != null && task!.eta_p90_min > 0 ? task!.eta_p90_min : null,
        p_eta_factors: task!.eta_factors,
        p_eta_model_version: null,
      });
      delete ids.current.start;
      if (out.status === "blocked") {
        // The plate arrives from the task.start_blocked and ppe.missing events; the button just rests.
        setServerExpired(null);
        setIntent("start", "idle");
        return;
      }
      setServerExpired(null);
      flashSuccess("start");
    } catch (e) {
      if (e instanceof RpcError && e.code === "override_expired") {
        // The server is the authority on the expiry; the plate switches to "Override expired".
        delete ids.current.start;
        setServerExpired(task!.id);
        setIntent("start", "idle");
        return;
      }
      fail("start", e);
    }
  }

  async function pause() {
    setError(null);
    setIntent("pause", "loading");
    try {
      await port.taskPause({ p_task_id: task!.id, p_request_id: idFor("pause") });
      delete ids.current.pause;
      flashSuccess("pause");
    } catch (e) {
      fail("pause", e);
    }
  }

  async function complete() {
    setError(null);
    setIntent("complete", "loading");
    try {
      await port.taskComplete({ p_task_id: task!.id, p_request_id: idFor("complete") });
      delete ids.current.complete;
      setCompleted(taskName);
      setConfirming(false);
      setIntent("complete", "idle");
    } catch (e) {
      fail("complete", e);
    }
  }

  const errorLine = (intent: Intent) => {
    if (error?.intent !== intent) return undefined;
    return error.code === "not_paired" ? t("errors.notPaired") : error.code === "invalid_state" ? t("errors.invalidState") : t("errors.notSent");
  };

  const primaryLabel = actions.primary === "pause" ? t("pause") : actions.primary === "resume" ? t("resume") : t("start");
  const primaryIntent: Intent = actions.primary === "pause" ? "pause" : "start";
  const primaryNote = actions.needsPpe ? t("needsPpe", { items: missingItems || t("ppe.item.vest") }) : offline ? tc("chrome.needsSignal") : errorLine(primaryIntent);
  const eta50 = task.eta_p50_min != null ? Math.round(task.eta_p50_min) : null;
  const eta90 = task.eta_p90_min != null ? Math.round(task.eta_p90_min) : null;
  const progress = Math.round(task.progress_pct);

  return (
    <div className="task-screen">
      <div className="task-main">
        <PpePlate view={ppe} />

        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="t-title">{taskName}</h1>
          <Chip tone={task.status === "in_progress" ? "ink" : task.status === "blocked_ppe" ? "caution" : "outline"} word>
            {tc(`enums.work.${state}`)}
          </Chip>
        </header>

        <div className="flex flex-col gap-3">
          {actions.primary ? (
            <Button
              variant="primary"
              block
              status={status[primaryIntent]}
              disabled={actions.needsPpe || offline}
              note={primaryNote}
              onClick={actions.primary === "pause" ? pause : start}
            >
              {primaryLabel}
            </Button>
          ) : null}
          {actions.canComplete ? (
            <Button
              block
              status={status.complete}
              disabled={offline}
              note={offline ? tc("chrome.needsSignal") : errorLine("complete")}
              onClick={() => {
                setError(null);
                setConfirming(true);
              }}
            >
              {t("complete")}
            </Button>
          ) : null}
          {error?.code === "not_paired" ? (
            <Link href="/" className="t-label underline underline-offset-4">
              {t("errors.pairLink")}
            </Link>
          ) : null}
          {completed ? (
            <p className="t-label" role="status">
              {t("completed", { task: completed })}
            </p>
          ) : null}
        </div>
      </div>

      <div className="task-side">
        <Plate as="section" className="flex flex-col gap-3" aria-label={t("progressLabel")}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="t-figure tnum">{tc("hero.pct", { pct: progress })}</span>
            <span className="t-label tnum">{eta50 != null ? `${tc("hero.eta")} ${tc("hero.etaMin", { min: eta50 })}` : "—"}</span>
          </div>
          <div className="bar" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={tc("hero.progress", { pct: progress })}>
            <div className="bar-fill" style={{ width: `${progress}%` }} />
            <div className="bar-ticks" />
          </div>
          <p className="t-meta text-ink-2 tnum">
            {elapsed != null ? t("elapsed", { min: elapsed }) : t("elapsedNone")}
            {detailed && eta90 != null ? ` · ${tc("hero.etaUpTo", { min: eta90 })}` : ""}
            {detailed ? ` · ${t("plannedStart", { time: format.dateTime(new Date(task.planned_start), "time") })}` : ""}
          </p>
        </Plate>

        <FactorRows factors={task.eta_factors} detailed={detailed} />
      </div>

      <Sheet open={confirming} onClose={() => setConfirming(false)} title={t("confirmTitle", { task: taskName })}>
        <div className="flex flex-col gap-4">
          <p className="t-body">
            {elapsed != null ? t("confirmBody", { pct: progress, min: elapsed }) : t("confirmBodyNoTime", { pct: progress })}
          </p>
          <Button variant="primary" status={status.complete} note={errorLine("complete")} onClick={complete}>
            {t("confirm")}
          </Button>
          <Button onClick={() => setConfirming(false)}>{t("back")}</Button>
        </div>
      </Sheet>
    </div>
  );
}
