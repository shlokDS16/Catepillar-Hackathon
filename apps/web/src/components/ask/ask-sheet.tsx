"use client";

import { Camera, TriangleAlert, UserRound, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Mark } from "@/components/ui/pictogram";
import { Plate } from "@/components/ui/plate";
import { Sheet } from "@/components/ui/sheet";
import { newRequestId } from "@/data/port";
import { useAppState, useDataPort } from "@/data/store";
import { canAsk, citeNumbers, compressPhoto, confidencePct, isDemoAnswer, QUESTION_MAX, refusalCopyKey } from "@/ask/ask";
import type { AskResponse } from "@cat/shared";

type ProposedAction = NonNullable<NonNullable<AskResponse["answer"]>["proposed_action"]>;
type Phase = { kind: "idle" } | { kind: "reading" } | { kind: "done"; response: AskResponse } | { kind: "error" };
type Photo = { name: string; path: string };

/**
 * S6 Ask Spotter (screens.md; A17, A18). Levels top to bottom: L1 rule plate and handover, L2 numbered
 * steps with citation marks, L4 citation, photo and "Review and log" chips, L6 the composer. The sheet
 * is working content: ink on paper, mono caption for provenance. When the fixture adapter answered it
 * says so ("SIM"); it never implies a live model.
 */
export function AskSheet({ open, onClose, onReview }: { open: boolean; onClose: () => void; onReview: (a: ProposedAction) => void }) {
  const t = useTranslations("ask");
  const tc = useTranslations("chrome");
  const lang = useLocale();
  const port = useDataPort();
  const offline = useAppState((s) => s.connectivity.kind === "nosignal");
  const userId = useAppState((s) => s.snapshot?.profile.user_id ?? null);
  const [question, setQuestion] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const busy = phase.kind === "reading";
  const suggested = t.raw("suggested") as string[];

  const send = async (text: string) => {
    if (!canAsk(text, busy, offline)) return;
    setPhase({ kind: "reading" });
    try {
      const response = await port.ask({
        request_id: newRequestId(),
        question: text.trim(),
        lang: lang === "hi" || lang === "ta" ? lang : "en",
        photo_path: photo?.path ?? null,
        history: [],
      });
      setPhase({ kind: "done", response });
      resultRef.current?.scrollIntoView({ block: "nearest" });
    } catch {
      setPhase({ kind: "error" });
    }
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setPhotoError(false);
    try {
      await compressPhoto(file); // longest side <= 1,600 px; the fixture adapter uploads nothing
      setPhoto({ name: file.name, path: `${userId ?? "00000000-0000-4000-8000-000000000000"}/${newRequestId()}.jpg` });
    } catch {
      setPhoto(null);
      setPhotoError(true);
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("title")}>
      <div className="ask flex flex-col gap-5">
        <div ref={resultRef} className="flex flex-col gap-4" aria-live="polite">
          {phase.kind === "reading" ? (
            <p className="t-title ask-reading" role="status">
              {t("reading")}
            </p>
          ) : null}
          {phase.kind === "error" ? (
            <Plate tone="sunk" rule="heavy" role="alert" className="flex items-start gap-3">
              <Mark kind="cross" />
              <p className="t-body">{t("error")}</p>
            </Plate>
          ) : null}
          {phase.kind === "done" ? <AskResult response={phase.response} onReview={onReview} /> : null}
        </div>

        <form
          className="flex flex-col gap-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void send(question);
          }}
        >
          <label htmlFor="ask-q" className="t-label">
            {t("questionLabel")}
          </label>
          <textarea
            id="ask-q"
            className="incident-note"
            rows={3}
            maxLength={QUESTION_MAX}
            value={question}
            disabled={busy}
            placeholder={t("placeholder")}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <p className="t-meta text-ink-2 tnum">{t("count", { n: question.length, max: QUESTION_MAX })}</p>

          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void pick(e.target.files?.[0])} />
          {photo ? (
            <div className="ask-photo">
              <Chip tone="meta" icon={<Camera className="icon" aria-hidden="true" />}>
                {t("photoAttached")} · {photo.name}
              </Chip>
              <Button size="dense" icon={<X className="icon" aria-hidden="true" />} onClick={() => setPhoto(null)}>
                {t("photoRemove")}
              </Button>
            </div>
          ) : (
            <Button size="dense" icon={<Camera className="icon" aria-hidden="true" />} disabled={busy} onClick={() => fileRef.current?.click()}>
              {t("photo")}
            </Button>
          )}
          {photoError ? (
            <p className="t-label" role="alert">
              {t("photoFailed")}
            </p>
          ) : null}

          <Button variant="primary" block type="submit" status={busy ? "loading" : "idle"} disabled={!canAsk(question, busy, offline) && !busy} note={offline ? tc("needsSignal") : undefined}>
            {t("ask")}
          </Button>
          {offline ? (
            <p className="t-meta text-ink-2" role="status">
              {t("offline")}
            </p>
          ) : null}
        </form>

        <section className="flex flex-col gap-2" aria-labelledby="ask-suggested">
          <h3 id="ask-suggested" className="t-label">
            {t("suggestedTitle")}
          </h3>
          <ul className="ask-suggest">
            {suggested.map((s) => (
              <li key={s}>
                <Button
                  size="dense"
                  block
                  disabled={busy || offline}
                  onClick={() => {
                    setQuestion(s);
                    void send(s);
                  }}
                >
                  {s}
                </Button>
              </li>
            ))}
          </ul>
        </section>

        <p className="t-meta text-ink-2 ask-footer">{t("footer")}</p>
      </div>
    </Sheet>
  );
}

export function AskResult({ response, onReview }: { response: AskResponse; onReview: (a: ProposedAction) => void }) {
  const t = useTranslations("ask");
  const demo = isDemoAnswer(response);
  const answer = response.status === "refused" ? null : response.answer;

  const caption = (
    <p className="t-caption ask-caption">
      {demo ? (
        <>
          <span className="ask-sim">{t("sim")}</span> {t("simNote")}
        </>
      ) : null}
      {response.status === "degraded" ? <span> {demo ? "· " : ""}{t("backup")}</span> : null}
    </p>
  );

  if (!answer) {
    return (
      <div className="flex flex-col gap-2">
        <Plate tone="sunk" rule="heavy" role="status" className="flex items-start gap-3" data-refusal={response.refusal_reason ?? undefined}>
          <TriangleAlert className="icon" aria-hidden="true" />
          <p className="t-title">{t(`refusal.${refusalCopyKey(response.refusal_reason)}`)}</p>
        </Plate>
        {caption}
      </div>
    );
  }

  const { citations } = response;
  return (
    <div className="flex flex-col gap-4">
      {answer.rule ? <RulePlate rule={answer.rule} citations={citations} /> : null}
      {answer.handover_to_supervisor ? (
        <Chip tone="ink" icon={<UserRound className="icon" aria-hidden="true" />}>
          {t("handover")}
        </Chip>
      ) : null}

      <section className="flex flex-col gap-2" aria-labelledby="ask-steps">
        <h3 id="ask-steps" className="t-label">
          {t("stepsTitle")}
        </h3>
        <ol className="ask-steps">
          {answer.steps.map((s) => (
            <li key={s.text} className="t-body">
              {s.text}{" "}
              {citeNumbers(s.cited_ids, citations).map((n) => (
                <span key={n} className="ask-mark tnum" role="img" aria-label={t("citeMark", { n })}>
                  [{n}]
                </span>
              ))}
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="ask-sources">
        <h3 id="ask-sources" className="t-label">
          {t("sourcesTitle")}
        </h3>
        <ol className="ask-cites">
          {citations.map((c, i) => (
            <li key={c.id} className="flex flex-col gap-1">
              <Chip tone="meta">
                <span className="tnum">[{i + 1}]</span>{" "}
                {c.kind === "live" ? t("live") : c.page === null ? t("citeChipNoPage", { title: c.title }) : t("citeChip", { title: c.title, page: c.page })}
              </Chip>
              {c.review_status === "draft" ? <span className="t-meta">{t("draft")}</span> : null}
            </li>
          ))}
        </ol>
        {response.photo ? (
          <Chip tone="outline" icon={<Camera className="icon" aria-hidden="true" />}>
            {t("photoLooks", { category: t(`category.${response.photo.category}`), pct: confidencePct(response.photo.confidence) })}
          </Chip>
        ) : null}
      </section>

      {answer.proposed_action ? (
        <ReviewButton onClick={() => onReview(answer.proposed_action as ProposedAction)}>{t("review")}</ReviewButton>
      ) : null}
      {caption}
    </div>
  );
}

function RulePlate({ rule, citations }: { rule: { text: string; cited_id: string }; citations: AskResponse["citations"] }) {
  const t = useTranslations("ask");
  const c = citations.find((x) => x.id === rule.cited_id);
  return (
    <Plate tone="surface" rule="heavy" as="section" aria-label={t("rule")} className="flex flex-col gap-2">
      <p className="t-label ask-rule-label">{t("rule")}</p>
      <p className="t-title">{rule.text}</p>
      {c ? <p className="t-caption">{c.page === null ? t("ruleSourceNoPage", { title: c.title }) : t("ruleSource", { title: c.title, page: c.page })}</p> : null}
    </Plate>
  );
}

function ReviewButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  const t = useTranslations("ask");
  return (
    <Button variant="primary" block onClick={onClick} note={t("reviewNote")}>
      {children}
    </Button>
  );
}
