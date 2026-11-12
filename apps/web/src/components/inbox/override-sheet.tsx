"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button, type ButtonStatus } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { newRequestId, RpcError } from "@/data/port";
import { useAppState, useDataPort } from "@/data/store";
import { REASON_MAX, validateReason, type InboxItem } from "@/inbox/inbox";

type Props = { item: InboxItem | null; onClose: () => void; onGranted: (id: string) => void };

/**
 * A21 Grant override (interaction-map §7): reason 10 to 500 characters with a counter and two quick
 * reasons, a 15-minute override recorded permanently in the ledger. One request_id per intent,
 * reused on retry so a double tap never grants twice.
 */
export function OverrideSheet({ item, onClose, onGranted }: Props) {
  const t = useTranslations("inbox.override");
  const tp = useTranslations("inbox.ppe");
  const open = item !== null && item.taskId !== null;
  const items = item ? item.missing.map((m) => tp(m)).join(", ") : "";
  // The form is keyed by the row, so a new row is a fresh intent (empty reason, new request_id).
  return (
    <Sheet open={open} onClose={onClose} title={t("title", { name: item?.operatorName ?? t("anyone"), items })}>
      {item && item.taskId ? <OverrideForm key={item.id} item={item} taskId={item.taskId} items={items} onClose={onClose} onGranted={onGranted} /> : null}
    </Sheet>
  );
}

type FormProps = { item: InboxItem; taskId: string; items: string; onClose: () => void; onGranted: (id: string) => void };

function OverrideForm({ item, taskId, items, onClose, onGranted }: FormProps) {
  const t = useTranslations("inbox.override");
  const tc = useTranslations("chrome");
  const offline = useAppState((s) => s.connectivity.kind === "nosignal");
  const format = useFormatter();
  const port = useDataPort();
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [status, setStatus] = useState<ButtonStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [validUntil, setValidUntil] = useState<string | null>(null);
  const [requestId] = useState(newRequestId);

  const check = validateReason(reason);
  const fieldError = touched && !check.ok ? t(check.error === "too_short" ? "tooShort" : check.error === "too_long" ? "tooLong" : "control") : null;

  async function grant() {
    setTouched(true);
    if (!check.ok) return;
    setStatus("loading");
    setError(null);
    try {
      const out = await port.ppeOverride({ p_task_id: taskId, p_reason: check.value, p_request_id: requestId });
      setValidUntil(out.valid_until);
      setStatus("success");
      onGranted(item.id);
    } catch (e) {
      setStatus("error");
      const code = e instanceof RpcError ? e.code : "network";
      setError(t(code === "forbidden" ? "forbidden" : code === "invalid_state" ? "invalidState" : code === "validation" ? "validation" : "network"));
    }
  }

  const done = validUntil !== null;
  return (
      <div className="flex flex-col gap-4">
        {done ? (
          <p className="t-body" role="status">
            {t("done", { time: format.dateTime(new Date(validUntil), "time") })}
          </p>
        ) : (
          <>
            <label className="t-label" htmlFor="override-reason">
              {t("reasonLabel")}
            </label>
            <div className="flex flex-wrap gap-3">
              {(["quick1", "quick2"] as const).map((k) => (
                <Button key={k} size="dense" onClick={() => setReason(k === "quick1" ? t(k, { items }) : t(k))}>
                  {k === "quick1" ? t(k, { items }) : t(k)}
                </Button>
              ))}
            </div>
            <textarea
              id="override-reason"
              className="inbox-textarea t-body"
              value={reason}
              maxLength={REASON_MAX + 50}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby="override-hint"
              onChange={(e) => setReason(e.target.value)}
              onBlur={() => setTouched(true)}
            />
            <p id="override-hint" className="t-meta flex justify-between gap-3">
              <span role={fieldError ? "alert" : undefined}>{fieldError ?? t("hint")}</span>
              <span className="tnum">{t("counter", { n: reason.trim().length })}</span>
            </p>
            <Button variant="primary" status={status} disabled={offline} note={offline ? tc("needsSignal") : (error ?? undefined)} onClick={grant}>
              {t("grant")}
            </Button>
          </>
        )}
        <p className="t-meta text-ink-2">{t("permanent")}</p>
        <Button onClick={onClose}>{t("back")}</Button>
      </div>
  );
}
