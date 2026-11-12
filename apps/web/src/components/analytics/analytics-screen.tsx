"use client";

import { useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Chip } from "@/components/ui/chip";
import { Mark } from "@/components/ui/pictogram";
import {
  CONDITION_ORDER, biasLine, conditionsPresent, evidenceValue, fmtMin, groupsFor, maxMinutes, modelBeats, parseRows, pickDefault,
  totalN, weightedMae, type BiasLine, type EvidenceLite, type Group, type WeatherKey,
} from "@/analytics/analytics";
import { BarGroup, BarPatterns, Swatch, type BarRow } from "./bar-group";

/** `demo` = fixture rows: always labelled "Simulated demo data". `live` = organiser rows from `v_task_analytics`. */
type Props = { rows: unknown[]; evidence: EvidenceLite[]; source: "demo" | "live" };

export function AnalyticsScreen({ rows: rawRows, evidence, source }: Props) {
  const demo = source === "demo";
  const t = useTranslations("analytics");
  const tt = useTranslations("enums.task");
  const rows = useMemo(() => parseRows(rawRows), [rawRows]);
  const present = useMemo(() => conditionsPresent(rows), [rows]);
  const [cond, setCond] = useState<WeatherKey | null>(() => pickDefault(rows));
  const groups = useMemo(() => (cond ? groupsFor(rows, cond) : []), [rows, cond]);
  const max = maxMinutes(groups);
  const verdict = weightedMae(groups);
  const titleId = useId();

  const bias = (b: BiasLine) =>
    b.kind === "unknown" ? t("bias.unknown") : b.kind === "exact" || b.kind === "flat" ? t(`bias.${b.kind}`) : t(`bias.${b.kind}`, { m: b.minutes });

  const seriesRows = (g: Group): BarRow[] => [
    { key: "actual", label: t("series.actual"), value: g.actual, text: fmtMin(g.actual) ?? "", pattern: "solid" },
    { key: "organiser", label: t("series.organiser"), value: g.organiser, text: fmtMin(g.organiser) ?? "", pattern: "outline" },
    { key: "model", label: t("series.model"), value: g.model, text: fmtMin(g.model) ?? "", pattern: "hatch" },
  ];

  return (
    <section className="an" aria-labelledby={titleId}>
      <BarPatterns />
      <div className="an-head">
        <h1 id={titleId} className="t-title">{t("title")}</h1>
        <p className="t-meta an-meta">
          {t(demo ? "metaDemo" : "meta", { n: totalN(groups) })}
        </p>
        <div className="an-chips">
          {demo ? <Chip tone="outline">{t("demoChip")}</Chip> : <Chip tone="meta">{t("organiserFields")}</Chip>}
          <Chip tone="meta">{t("simulatedOps")}</Chip>
        </div>
      </div>

      <ConditionSelector present={present} value={cond} onChange={setCond} />

      <div className="an-legend" role="list" aria-label={t("legend")}>
        {(["actual", "organiser", "model"] as const).map((s) => (
          <span role="listitem" key={s} className="an-legend-item">
            <Swatch pattern={s === "actual" ? "solid" : s === "organiser" ? "outline" : "hatch"} />
            <span className="t-label">{t(`series.${s}`)}</span>
          </span>
        ))}
        <span className="t-meta an-unit">{t("unit")}</span>
      </div>

      {cond === null || groups.length === 0 ? (
        <p className="plate an-empty t-body" role="status">{t("noTasks")}</p>
      ) : (
        <>
          <p className="an-verdict t-body">
            <Mark kind="info" />
            <span>
              {verdict
                ? t("verdict.some", { ours: fmtMin(verdict.model) ?? "", organiser: fmtMin(verdict.organiser) ?? "", n: verdict.n })
                : t("verdict.none")}
            </span>
          </p>

          <ol className="an-groups">
            {groups.map((g) => (
              <li key={g.task} className="an-group" data-few={g.few || undefined}>
                <div className="an-group-head">
                  <h2 className="t-label">{tt(g.task)}</h2>
                  <span className="t-mono t-meta">n = {g.n}</span>
                  {g.few ? <span className="t-meta an-few">{t("few", { n: g.n })}</span> : null}
                </div>
                <BarGroup rows={seriesRows(g)} max={max} dim={g.few} noData={t("noData")} />
                <p className="an-takeaway t-body">
                  {t("takeaway", { organiser: bias(biasLine(g.biasOrganiser, g.maeOrganiser)), ours: bias(biasLine(g.biasModel, g.maeModel)) })}
                </p>
                {modelBeats(g) === false ? <p className="t-meta an-honest">{t("notBetter")}</p> : null}
              </li>
            ))}
          </ol>

          <div className="an-tablewrap">
            <table className="an-table t-mono">
              <caption className="t-meta">{t("tableCaption", { cond: t(`cond.${cond}`) })}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("col.task")}</th>
                  <th scope="col">n</th>
                  <th scope="col">{t("col.maeOrganiser")}</th>
                  <th scope="col">{t("col.maeOurs")}</th>
                  <th scope="col">{t("series.actual")}</th>
                  <th scope="col">{t("series.organiser")}</th>
                  <th scope="col">{t("series.model")}</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.task} data-few={g.few || undefined}>
                    <th scope="row">{tt(g.task)}</th>
                    <td>{g.n}</td>
                    <Num v={g.maeOrganiser} na={t("noData")} />
                    <Num v={g.maeModel} na={t("noData")} />
                    <Num v={g.actual} na={t("noData")} />
                    <Num v={g.organiser} na={t("noData")} />
                    <Num v={g.model} na={t("noData")} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="t-meta an-source">{t(demo ? "sourceDemo" : "source")}</p>
      <EvidenceCard evidence={evidence} />
    </section>
  );
}

function Num({ v, na }: { v: number | null; na: string }) {
  const s = fmtMin(v);
  return <td data-null={s === null || undefined}>{s ?? na}</td>;
}

/** A11y radio group (A25): arrow keys move and select, local state only, no server call. */
function ConditionSelector({ present, value, onChange }: { present: WeatherKey[]; value: WeatherKey | null; onChange: (c: WeatherKey) => void }) {
  const t = useTranslations("analytics");
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const enabled = CONDITION_ORDER.filter((c) => present.includes(c));
  const onKey = (e: React.KeyboardEvent) => {
    const i = value ? enabled.indexOf(value) : -1;
    let n = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") n = (i + 1) % enabled.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = (i - 1 + enabled.length) % enabled.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = enabled.length - 1;
    if (n < 0 || enabled.length === 0) return;
    e.preventDefault();
    onChange(enabled[n]);
    refs.current[enabled[n]]?.focus();
  };
  return (
    <div className="an-seg" role="radiogroup" aria-label={t("condition")} onKeyDown={onKey}>
      {CONDITION_ORDER.map((c) => {
        const on = present.includes(c);
        const sel = value === c;
        return (
          <button
            key={c}
            ref={(el) => { refs.current[c] = el; }}
            type="button"
            role="radio"
            aria-checked={sel}
            disabled={!on}
            tabIndex={sel || (!value && c === enabled[0]) ? 0 : -1}
            className="an-seg-btn t-label"
            data-on={sel || undefined}
            onClick={() => onChange(c)}
          >
            <span>{t(`cond.${c}`)}</span>
            {!on ? <span className="t-meta an-seg-none">{t("noTasksShort")}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

function EvidenceCard({ evidence }: { evidence: EvidenceLite[] }) {
  const evId = useId();
  const t = useTranslations("analytics.ev");
  const no = t("none");
  const get = (k: string, type?: string) => evidenceValue(evidence, k, type);
  const meter = (label: string, e: EvidenceLite | null) => (
    <li className="an-ev-row" key={label}>
      <span className="t-label">{label}</span>
      {e ? (
        <>
          <BarGroup rows={[{ key: label, label, value: e.value, text: pct(e.value), pattern: "solid" }]} max={1} noData={no} />
          {e.n !== null ? <span className="t-mono t-meta">n = {e.n}</span> : null}
        </>
      ) : <span className="t-meta an-ev-none">{no}</span>}
    </li>
  );
  const pair = (a: { l: string; e: EvidenceLite | null; p: BarRow["pattern"] }, b: { l: string; e: EvidenceLite | null; p: BarRow["pattern"] }, fmt: (v: number) => string) => {
    const vals = [a.e?.value, b.e?.value].filter((v): v is number => v !== undefined);
    const max = vals.length ? Math.max(...vals) : 1;
    const mk = (x: typeof a): BarRow => ({ key: x.l, label: x.l, value: x.e ? x.e.value : null, text: x.e ? fmt(x.e.value) : "", pattern: x.p });
    return (
      <>
        <BarGroup rows={[mk(a), mk(b)]} max={max > 0 ? max : 1} noData={no} />
        <div className="an-ev-pairlegend t-meta">
          <span><Swatch pattern={a.p} /> {a.l}</span>
          <span><Swatch pattern={b.p} /> {b.l}</span>
        </div>
      </>
    );
  };
  const rag1 = get("rag.hit_at_5");
  const rag2 = get("rag.faithfulness");
  return (
    <section className="plate an-evidence" data-rule="heavy" aria-labelledby={evId}>
      <h2 id={evId} className="t-title">{t("title")}</h2>
      <div className="an-ev-grid">
        <div className="an-ev-block">
          <h3 className="t-label">{t("detection")}</h3>
          <ul className="an-ev-list">
            {(["idle_excess", "overheat"] as const).flatMap((ty) => [
              meter(`${t("precision")} · ${t(`type.${ty}`)}`, get("detector.precision", ty)),
              meter(`${t("recall")} · ${t(`type.${ty}`)}`, get("detector.recall", ty)),
            ])}
          </ul>
        </div>
        <div className="an-ev-block">
          <h3 className="t-label">{t("eta")}</h3>
          {get("eta.mae.model") || get("eta.mae.organiser")
            ? pair({ l: t("maeOurs"), e: get("eta.mae.model"), p: "hatch" }, { l: t("maeOrganiser"), e: get("eta.mae.organiser"), p: "outline" }, (v) => `${fmtMin(v)} min`)
            : <p className="t-meta an-ev-none">{no}</p>}
          <ul className="an-ev-list">{meter(t("p90"), get("eta.p90_coverage"))}</ul>
        </div>
        <div className="an-ev-block">
          <h3 className="t-label">{t("impact")}</h3>
          <p className="t-meta">{t("impactNote")}</p>
          {get("loop.repeat_rate.assigned") || get("loop.repeat_rate.control")
            ? pair({ l: t("assigned"), e: get("loop.repeat_rate.assigned"), p: "hatch" }, { l: t("control"), e: get("loop.repeat_rate.control"), p: "outline" }, pct)
            : <p className="t-meta an-ev-none">{no}</p>}
        </div>
        <div className="an-ev-block">
          <h3 className="t-label">{t("ops")}</h3>
          <ul className="an-ev-list">{meter(t("idle"), get("fleet.idle_pct"))}</ul>
        </div>
        <div className="an-ev-block">
          <h3 className="t-label">{t("ask")}</h3>
          {rag1 || rag2 ? <ul className="an-ev-list">{meter(t("hit5"), rag1)}{meter(t("faith"), rag2)}</ul> : <p className="t-meta an-ev-none">{t("inProgress")}</p>}
        </div>
      </div>
    </section>
  );
}
