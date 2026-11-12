"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Mark } from "@/components/ui/pictogram";
import { Plate } from "@/components/ui/plate";
import { useDataPort } from "@/data/store";
import {
  LedgerBusyError, checkRange, countSealed, diffAt, groupsOf4, parsePaste, rowView, runCompare, withBusyRetry,
  type CompareOutcome, type ExportRow,
} from "@/ledger/witness";

type VerifyOut = Awaited<ReturnType<ReturnType<typeof useDataPort>["ledgerVerify"]>>;
type VerifyState =
  | { s: "idle" }
  | { s: "loading" }
  | { s: "busy" }
  | { s: "network" }
  | { s: "done"; out: VerifyOut; rows: ExportRow[] };
type CompareState = { s: "idle" } | { s: "loading" } | { s: "done"; out: CompareOutcome };

const TABLE_ROWS = 25;

/** One hash as 16 groups of 4; the first differing group is boxed and its first differing character marked. */
function HashPair({
  topLabel, bottomLabel, top, bottom, ariaLabel,
}: { topLabel: string; bottomLabel: string; top: string; bottom: string; ariaLabel: string }) {
  const t = useTranslations("ledger");
  const diff = diffAt(top, bottom);
  const tg = groupsOf4(top);
  const bg = groupsOf4(bottom);
  const chunk = (groups: string[], c: number, side: "published" | "computed", label: string) => (
    <div className="hash-chunk" data-side={side} style={{ ["--c" as string]: c }} key={`${side}${c}`}>
      <span className="hash-chunklabel t-meta">{label}</span>
      <div className="hash-groups t-mono">
        {groups.slice(c * 4, c * 4 + 4).map((g, i) => {
          const gi = c * 4 + i;
          const boxed = diff?.group === gi;
          return (
            <span className="hash-g" key={gi} data-diff={boxed || undefined}>
              {boxed
                ? [...g].map((ch, k) => (
                    <span className="hash-c" key={k} data-first={k === diff.char || undefined}>{ch}</span>
                  ))
                : g}
            </span>
          );
        })}
      </div>
    </div>
  );
  return (
    <div className="hash-pair" role="group" aria-label={ariaLabel}>
      <div className="hash-grid">
        <span className="hash-rowlabel t-meta" data-side="published">{topLabel}</span>
        <span className="hash-rowlabel t-meta" data-side="computed">{bottomLabel}</span>
        {[0, 1, 2, 3].flatMap((c) => [chunk(tg, c, "published", topLabel), chunk(bg, c, "computed", bottomLabel)])}
      </div>
      {diff ? (
        <p className="t-meta sr-only">{t("firstDiff", { group: diff.group + 1, char: diff.char + 1 })}</p>
      ) : null}
    </div>
  );
}

function Verdict({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <p className="ledger-plate-verdict">
      <Mark kind={ok ? "check" : "cross"} />
      <span>{children}</span>
    </p>
  );
}

export function LedgerScreen() {
  const port = useDataPort();
  const t = useTranslations("ledger");
  const [verify, setVerify] = useState<VerifyState>({ s: "idle" });
  const [paste, setPaste] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [compare, setCompare] = useState<CompareState>({ s: "idle" });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const parsed = parsePaste(paste);

  function onPaste(text: string) {
    setPaste(text);
    const p = parsePaste(text);
    if (p.state === "ok") {
      setFrom(String(p.witness.first_seq));
      setTo(String(p.witness.last_seq));
    }
  }

  async function runVerify() {
    if (verify.s === "loading") return;
    setVerify({ s: "loading" });
    try {
      const out = await withBusyRetry(() => port.ledgerVerify({ p_from: 1, p_to: null }));
      let rows: ExportRow[] = [];
      if (out.head_seq > 0) {
        try {
          const first = Math.max(1, out.head_seq - TABLE_ROWS + 1);
          rows = (await port.ledgerExport({ p_first_seq: first, p_last_seq: out.head_seq })) as ExportRow[];
        } catch {
          rows = [];
        }
      }
      if (alive.current) setVerify({ s: "done", out, rows });
    } catch (e) {
      if (alive.current) setVerify({ s: e instanceof LedgerBusyError ? "busy" : "network" });
    }
  }

  async function runWitness() {
    if (compare.s === "loading") return;
    setCompare({ s: "loading" });
    const out = await runCompare(port, { from, to, paste: parsed });
    if (alive.current) setCompare({ s: "done", out });
  }

  const rangeCheck = checkRange(from, to);
  const done = compare.s === "done" ? compare.out : null;
  const rangeError =
    done?.kind === "validation"
      ? done.field === "from" ? t("rangeFrom") : done.field === "to" ? t("rangeTo") : t("rangeOrder")
      : null;

  return (
    <section className="ledger" aria-labelledby="ledger-title">
      <header>
        <h1 id="ledger-title" className="t-title">
          {t("title")} · <span className="ledger-sub">{t("subtitle")}</span>
        </h1>
      </header>

      <div className="ledger-plates">
        <InternalPlate state={verify} />
        <WitnessPlate state={compare} />
      </div>

      <div>
        <Button
          variant="primary"
          status={verify.s === "loading" ? "loading" : "idle"}
          onClick={() => void runVerify()}
        >
          {t("verify")}
        </Button>
        {verify.s === "busy" ? <p className="t-body" role="status">{t("busy")}</p> : null}
        {verify.s === "network" ? (
          <p className="t-body" role="status">{t("network")} <button type="button" className="btn" data-variant="secondary" data-size="dense" onClick={() => void runVerify()}>{t("tryAgain")}</button></p>
        ) : null}
      </div>

      <Plate as="section" className="ledger-compare" aria-labelledby="ledger-compare-title">
        <h2 id="ledger-compare-title" className="t-title">{t("compareTitle")}</h2>
        <p className="t-body">{t("step1")}</p>
        <div className="ledger-field">
          <label className="t-label" htmlFor="ledger-paste">{t("pasteLabel")}</label>
          <textarea
            id="ledger-paste"
            className="ledger-input"
            rows={3}
            spellCheck={false}
            autoComplete="off"
            value={paste}
            aria-invalid={parsed.state === "malformed" || undefined}
            aria-describedby={parsed.state === "malformed" ? "ledger-parse" : undefined}
            onChange={(e) => onPaste(e.target.value)}
          />
          {parsed.state === "malformed" ? (
            <p id="ledger-parse" className="t-meta ledger-error" role="alert">{t("parseFail")}</p>
          ) : null}
        </div>
        <div className="ledger-range">
          <div className="ledger-field">
            <label className="t-label" htmlFor="ledger-from">{t("from")}</label>
            <input
              id="ledger-from" className="ledger-input" inputMode="numeric" autoComplete="off" value={from}
              aria-invalid={done?.kind === "validation" && done.field !== "to" ? true : undefined}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="ledger-field">
            <label className="t-label" htmlFor="ledger-to">{t("to")}</label>
            <input
              id="ledger-to" className="ledger-input" inputMode="numeric" autoComplete="off" value={to}
              aria-invalid={done?.kind === "validation" && done.field !== "from" ? true : undefined}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
        {rangeError ? <p className="t-meta ledger-error" role="alert">{rangeError}</p> : null}
        <div>
          <Button
            variant="secondary"
            status={compare.s === "loading" ? "loading" : "idle"}
            disabled={!rangeCheck.ok && from === "" && to === ""}
            note={!rangeCheck.ok && from === "" && to === "" ? t("pasteNeeded") : undefined}
            onClick={() => void runWitness()}
          >
            {t("compare")}
          </Button>
        </div>
        {done?.kind === "busy" ? <p className="t-body" role="status">{t("busy")}</p> : null}
        {done?.kind === "network" ? <p className="t-body" role="status">{t("network")}</p> : null}
        {done?.kind === "done" ? <CompareDetail out={done} /> : null}
      </Plate>

      <EntriesTable state={verify} />

      <p className="t-meta ledger-footer">{t("footer")}</p>
    </section>
  );
}

function InternalPlate({ state }: { state: VerifyState }) {
  const t = useTranslations("ledger");
  const base = (
    <>
      <h2 className="t-label">{t("internalLabel")}</h2>
      <p className="t-meta">{t("internalAnswer")}</p>
    </>
  );
  if (state.s !== "done") {
    return (
      <Plate as="section" className="ledger-plate" loading={state.s === "loading"} aria-label={t("internalLabel")}>
        {base}
        <p className="t-body">{t("notChecked")}</p>
      </Plate>
    );
  }
  const o = state.out;
  const queueOnly = !o.ok && o.first_bad_seq === null;
  return (
    <Plate as="section" className="ledger-plate" tone={o.ok ? "clear" : "critical"} stamp aria-label={t("internalLabel")} key={o.ok ? "ok" : "bad"}>
      {base}
      <Verdict ok={o.ok}>
        {o.ok
          ? t("intact", { n: o.checked })
          : queueOnly ? t("queueIncomplete") : t("breaks", { seq: o.first_bad_seq ?? 0 })}
      </Verdict>
      {!o.ok && o.reason ? <p className="t-meta">{t(`reason_${o.reason}`)}</p> : null}
      {!o.ok && o.expected && o.stored ? (
        <HashPair topLabel={t("expectedHash")} bottomLabel={t("storedHash")} top={o.expected} bottom={o.stored} ariaLabel={t("breaks", { seq: o.first_bad_seq ?? 0 })} />
      ) : null}
    </Plate>
  );
}

function WitnessPlate({ state }: { state: CompareState }) {
  const t = useTranslations("ledger");
  const base = (
    <>
      <h2 className="t-label">{t("witnessLabel")}</h2>
      <p className="t-meta">{t("witnessAnswer")}</p>
    </>
  );
  const out = state.s === "done" ? state.out : null;
  if (!out || out.kind !== "done" || !out.comparison) {
    return (
      <Plate as="section" className="ledger-plate" loading={state.s === "loading"} aria-label={t("witnessLabel")}>
        {base}
        <p className="t-body">{out?.kind === "done" ? t("pasteNeeded") : t("notChecked")}</p>
      </Plate>
    );
  }
  const ok = out.comparison.match;
  return (
    <Plate as="section" className="ledger-plate" tone={ok ? "clear" : "critical"} stamp aria-label={t("witnessLabel")} key={ok ? "ok" : "bad"}>
      {base}
      <Verdict ok={ok}>{ok ? t("matches", { n: out.local.checked }) : t("noMatch")}</Verdict>
      {ok && out.sealed > 0 ? <p className="t-meta">{t("sealedCount", { n: out.sealed })}</p> : null}
      {!ok && !out.local.ok && out.local.first_bad_seq !== null ? (
        <p className="t-meta">{t("witnessBroken", { seq: out.local.first_bad_seq })}</p>
      ) : null}
    </Plate>
  );
}

/** The side-by-side rows after Compare (S9 L3): root, then head; leaf count; the server's line last. */
function CompareDetail({ out }: { out: Extract<CompareOutcome, { kind: "done" }> }) {
  const t = useTranslations("ledger");
  const { witness, local, server } = out;
  const serverState = server ? (server.root_hex === local.root_hex ? t("serverAgrees") : t("serverDiffers")) : null;
  return (
    <div className="hash-pair" data-testid="ledger-compare-detail">
      {witness ? (
        <>
          <h3 className="t-label">{t("root")}</h3>
          <HashPair topLabel={t("fromTelegram")} bottomLabel={t("recomputed")} top={witness.root_hex} bottom={local.root_hex} ariaLabel={t("root")} />
          <h3 className="t-label">{t("head")}</h3>
          <HashPair topLabel={t("fromTelegram")} bottomLabel={t("recomputed")} top={witness.head_hash} bottom={local.head_hash} ariaLabel={t("head")} />
          <p className="t-meta t-mono hash-leaves">{t("leaves", { published: witness.leaf_count, computed: local.checked })}</p>
        </>
      ) : (
        <>
          <h3 className="t-label">{t("root")}</h3>
          <p className="t-mono t-body">{groupsOf4(local.root_hex).join(" ")}</p>
          <h3 className="t-label">{t("head")}</h3>
          <p className="t-mono t-body">{groupsOf4(local.head_hash).join(" ")}</p>
          <p className="t-meta t-mono hash-leaves">{t("leavesOnly", { n: local.checked })}</p>
          <p className="t-meta">{t("pasteNeeded")}</p>
        </>
      )}
      {serverState ? <p className="t-meta">{t("serverSays", { state: serverState })}</p> : null}
    </div>
  );
}

function EntriesTable({ state }: { state: VerifyState }) {
  const t = useTranslations("ledger");
  const rows = state.s === "done" ? state.rows : [];
  const bad = state.s === "done" && !state.out.ok ? state.out.first_bad_seq : null;
  const empty = state.s === "done" && rows.length === 0;
  return (
    <section aria-labelledby="ledger-entries" className="ledger-table-wrap">
      <h2 id="ledger-entries" className="t-title">{t("tableTitle")}</h2>
      {state.s === "done" && rows.length > 0 ? (
        <p className="t-meta">
          {t("showing", { n: rows.length })}{countSealed(rows) > 0 ? ` · ${t("sealedCount", { n: countSealed(rows) })}` : ""}
        </p>
      ) : null}
      <table className="ledger-table">
        <thead>
          <tr>
            <th scope="col">{t("colSeq")}</th>
            <th scope="col">{t("colTime")}</th>
            <th scope="col">{t("colType")}</th>
            <th scope="col">{t("colOperator")}</th>
            <th scope="col">{t("colMachine")}</th>
            <th scope="col">{t("colHash")}</th>
          </tr>
        </thead>
        <tbody>
          {state.s !== "done" || empty ? (
            <tr>
              <td colSpan={6}>{empty ? t("noEntries") : t("verifyToList")}</td>
            </tr>
          ) : (
            rows.map((r) => {
              const v = rowView(r);
              const flagged = bad !== null && Number(v.seq) === bad;
              return (
                <tr key={v.seq} tabIndex={0} data-sealed={v.sealed || undefined} data-bad={flagged || undefined}>
                  <td className="num">{v.seq}</td>
                  {v.sealed ? (
                    <td colSpan={4}>{t("sealedRow")}</td>
                  ) : (
                    <>
                      <td className="num">{v.time ?? "—"}</td>
                      <td>{v.type ? v.type.replace(/_/g, " ") : "—"}</td>
                      <td className="num" aria-label={v.operator ? undefined : t("withheld")}>{v.operator ?? "—"}</td>
                      <td className="num">{v.machine ?? "—"}</td>
                    </>
                  )}
                  <td className="hash">{v.hashPrefix}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </section>
  );
}
