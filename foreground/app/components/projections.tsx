"use client";

import { useEffect, useState } from "react";
import {
  BANNER,
  fetchProjections,
  formatValue,
  overBudgetCard,
  postAssess,
  postReplan,
  splitCards,
  type AssumptionInput,
  type ProjectionCard,
  type ProjectionsResponse,
} from "../lib/projections";
import { useBrief } from "../lib/brief";

const KIND_LABEL = { published: "Published", fitted: "Fitted", scenario: "Scenario" } as const;
const title = (id: string) => id.replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase());

export default function Projections({ listingId }: { listingId: number }) {
  const [state, setState] = useState<{ id: number; data: ProjectionsResponse | null; error: boolean } | null>(null);

  useEffect(() => {
    let live = true;
    fetchProjections(listingId).then(
      (data) => live && setState({ id: listingId, data, error: false }),
      () => live && setState({ id: listingId, data: null, error: true }),
    );
    return () => {
      live = false;
    };
  }, [listingId]);

  const current = state?.id === listingId ? state : null;
  const { shown, hiddenCount } = splitCards(current?.data?.projections ?? []);

  return (
    <section className="mt-8 border-t border-foreground/10 pt-6" aria-labelledby="projections-title">
      <h2 id="projections-title" className="text-lg font-medium tracking-tight">Projections</h2>
      <p role="note" className="mt-2 rounded-lg border border-foreground/25 bg-foreground/5 px-3 py-2 text-sm font-medium">
        {BANNER}
      </p>
      {!current && <p className="mt-3 text-sm text-foreground/50">Loading projections.</p>}
      {current?.error && <p className="mt-3 text-sm text-foreground/60">Cannot say: the projections service did not answer.</p>}
      {current?.data && shown.length === 0 && (
        <p className="mt-3 text-sm text-foreground/60">
          Cannot say: no validated projection is available for this space.
          {current.data.note ? ` ${current.data.note}` : ""}
        </p>
      )}
      {shown.length > 0 && (
        <ul className="mt-4 grid gap-4 md:grid-cols-2">
          {shown.map((card, i) => (
            <Card key={`${card.metric}-${card.scenario}-${i}`} card={card} />
          ))}
        </ul>
      )}
      {hiddenCount > 0 && (
        <p className="mt-3 text-xs text-foreground/40">
          {hiddenCount} projection{hiddenCount === 1 ? "" : "s"} withheld: failed validation.
        </p>
      )}
      <AssumptionPanel listingId={listingId} />
      <ReplanPanel listingId={listingId} />
    </section>
  );
}

function ReplanPanel({ listingId }: { listingId: number }) {
  const brief = useBrief();
  const [area, setArea] = useState("2500");
  const [result, setResult] = useState<Awaited<ReturnType<typeof postReplan>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    const max = Number(area);
    if (!Number.isFinite(max) || max <= 0 || brief.length === 0) return;
    setBusy(true);
    setError("");
    try {
      setResult(await postReplan(listingId, max, brief));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The replan service did not answer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 rounded-[1.1rem] border border-dashed border-foreground/25 p-4" data-testid="replan-panel">
      <h3 className="text-sm font-medium">Revise the space requirement</h3>
      <p className="mt-1 text-xs text-foreground/50">Set a maximum area and rerun the hard-constraint screen using your saved intake answers. This is a user assumption, not an area recommendation.</p>
      {brief.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-foreground/55" aria-label="Intake answers used for replan">
          {brief.map((exchange, i) => <li key={`${i}-${exchange.question}`}>{exchange.question} <span className="text-foreground/75">{exchange.answer}</span></li>)}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-accent">No saved intake brief in this tab. Complete the intake before replanning.</p>
      )}
      <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); void run(); }}>
        <label className="text-xs text-foreground/60">Maximum area (sq ft)
          <input type="number" min="1" value={area} onChange={(event) => setArea(event.target.value)} className="mt-1 block w-40 rounded-lg border border-foreground/20 bg-background px-3 py-2 text-sm text-foreground" />
        </label>
        <button type="submit" disabled={busy || brief.length === 0 || !(Number(area) > 0)} className="rounded-full bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50">{busy ? "Replanning" : "Replan"}</button>
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-foreground/60">Cannot say: {error}</p>}
      {result && <div className="mt-3 text-sm" aria-live="polite">
        {typeof result.change.maxAreaSqft === "number" && <p>Screened with a maximum area of {formatValue(result.change.maxAreaSqft, "sq ft")}.</p>}
        <p>{result.changed.length} site status changes. Screen counts: {formatCounts(result.countsBefore)} → {formatCounts(result.countsAfter)}.</p>
        {result.changed.length > 0 && (
          <ul className="mt-2 space-y-2">
            {result.changed.map((site) => (
              <li key={site.site_id} className="rounded-lg bg-foreground/5 p-3">
                <p className="font-medium">Site {site.site_id}: {site.from} → {site.to}</p>
                {site.because.length > 0 ? (
                  <ul className="mt-1 space-y-1 text-xs text-foreground/60">
                    {site.because.map((reason, i) => (
                      <li key={`${reason.constraint}-${i}`}>
                        {title(reason.constraint)}: {reason.from} → {reason.to}. {reason.reason}
                        {reason.missing_fields.length > 0 && <> Missing fields: {reason.missing_fields.join(", ")}.</>}
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-1 text-xs text-foreground/60">The service returned no constraint-level reason.</p>}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-foreground/55">{result.note} No fit score is produced.</p>
      </div>}
    </div>
  );
}

function formatCounts(counts: Record<string, number>) {
  return Object.entries(counts).map(([key, value]) => `${key}: ${value}`).join(", ") || "no counts returned";
}

function Badge({ card }: { card: ProjectionCard }) {
  const label =
    card.kind === "published" ? (
      <>
        Published
        {card.citation && (
          <>
            {" · "}
            <a
              className="underline"
              href={/^https?:\/\//.test(card.citation.recordId) ? card.citation.recordId : `#cite-${encodeURIComponent(card.citation.recordId)}`}
              {...(/^https?:\/\//.test(card.citation.recordId) ? { target: "_blank", rel: "noreferrer" } : {})}
            >
              {card.citation.source}
            </a>
          </>
        )}
      </>
    ) : card.kind === "fitted" ? (
      <>
        Fitted · backtest {card.validation?.filter((m) => m.passed).length}/{card.validation?.length} passed
      </>
    ) : (
      KIND_LABEL.scenario
    );
  return (
    <span className="rounded-full border border-foreground/25 px-2.5 py-0.5 text-xs font-medium text-foreground/75">{label}</span>
  );
}

export function RangeBar({ lower, point, upper, unit }: { lower: number; point: number; upper: number; unit?: string }) {
  const span = upper - lower;
  const pos = span > 0 ? ((point - lower) / span) * 100 : 50;
  return (
    <div className="mt-3">
      <div
        role="img"
        aria-label={`Estimate ${formatValue(point, unit)}, range ${formatValue(lower, unit)} to ${formatValue(upper, unit)}`}
        className="relative h-2 rounded-full bg-foreground/15"
      >
        <span className="absolute inset-y-0 left-0 right-0 rounded-full bg-foreground/30" />
        <span className="absolute -top-1 h-4 w-1 -translate-x-1/2 rounded bg-foreground" style={{ left: `${pos}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-xs tabular-nums text-foreground/60">
        <span>low {formatValue(lower, unit)}</span>
        <span className="font-medium text-foreground">{formatValue(point, unit)}</span>
        <span>high {formatValue(upper, unit)}</span>
      </div>
    </div>
  );
}

function Card({ card }: { card: ProjectionCard }) {
  return (
    <li className="rounded-[1.1rem] border border-foreground/12 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{title(card.metric)}</h3>
        <Badge card={card} />
      </div>
      <p className="mt-1 text-xs text-foreground/50">
        {card.horizon} · {card.scenario}
      </p>
      {card.status === "unknown" ? (
        <p className="mt-3 text-sm font-medium text-foreground/60">Cannot say</p>
      ) : (
        <RangeBar lower={card.lower!} point={card.point!} upper={card.upper!} unit={card.unit} />
      )}
      <p className="mt-3 text-xs leading-relaxed text-foreground/55">Method: {card.method}</p>
      {card.kind === "fitted" && card.trainingWindow && (
        <p className="mt-1 text-xs text-foreground/45">
          Trained {card.trainingWindow.start} to {card.trainingWindow.end}, {card.trainingWindow.geography}.
        </p>
      )}
      {card.kind === "published" && card.citation && (
        <p id={`cite-${encodeURIComponent(card.citation.recordId)}`} className="mt-1 text-xs text-foreground/45">
          {card.citation.source}, record {card.citation.recordId}, as of {card.citation.asOf}, {card.citation.geography}.{" "}
          {card.citation.limitations}
        </p>
      )}
    </li>
  );
}

const DEFAULTS: AssumptionInput[] = [
  { key: "monthly_budget", value: 8000, unit: "USD/month", note: "Your rent budget" },
  { key: "rent_growth", value: 3, unit: "percent/year", note: "Assumed, not observed" },
];

type Result = { p: ProjectionCard | undefined; note: string; unknown: boolean };

function AssumptionPanel({ listingId }: { listingId: number }) {
  const [values, setValues] = useState(DEFAULTS.map((a) => String(a.value)));
  const [result, setResult] = useState<Result | null>(null);
  const [previous, setPrevious] = useState<ProjectionCard | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function run() {
    const assumptions = DEFAULTS.map((a, i) => ({ ...a, value: Number(values[i]) }));
    if (assumptions.some((a) => !Number.isFinite(a.value))) return;
    setBusy(true);
    setError(false);
    try {
      const out = await postAssess(listingId, assumptions);
      setPrevious(result?.p);
      const { shown } = splitCards(out.projections ?? []);
      setResult({ p: overBudgetCard(shown), note: out.note ?? "", unknown: out.status !== "estimated" || shown.length === 0 });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const p = result?.p;
  return (
    <div className="mt-6 rounded-[1.1rem] border border-dashed border-foreground/25 p-4">
      <h3 className="text-sm font-medium">Try your own assumptions</h3>
      <p className="mt-1 text-xs text-foreground/50">These are your inputs, not observed facts. Results are scenarios.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {DEFAULTS.map((a, i) => (
          <label key={a.key} className="text-xs text-foreground/60">
            {title(a.key)} ({a.unit})
            <input
              type="number"
              value={values[i]}
              onChange={(e) => setValues(values.map((v, j) => (j === i ? e.target.value : v)))}
              className="mt-1 block w-full rounded-lg border border-foreground/20 bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
        ))}
      </div>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="mt-3 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {busy ? "Running" : "Run scenario"}
      </button>
      {error && <p className="mt-3 text-sm text-foreground/60">Cannot say: the assessment service did not answer.</p>}
      {result && !error && (
        <div className="mt-3" aria-live="polite">
          <p className="text-xs font-medium text-foreground/70">{BANNER}</p>
          {p && p.status === "estimated" ? (
            <>
              <p className="mt-2 text-sm">
                P(over budget): <span className="font-medium tabular-nums">{formatValue(p.point!, p.unit)}</span>
                {previous?.status === "estimated" && (
                  <span className="text-foreground/55">
                    {" "}
                    (was {formatValue(previous.point!, previous.unit)}, change {formatDelta(p.point! - previous.point!)})
                  </span>
                )}
              </p>
              <RangeBar lower={p.lower!} point={p.point!} upper={p.upper!} unit={p.unit} />
              <p className="mt-2 text-xs text-foreground/55">Method: {p.method}</p>
            </>
          ) : (
            <p className="mt-2 text-sm font-medium text-foreground/60">
              Cannot say{result.note ? `: ${result.note}` : "."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const formatDelta = (d: number) => `${d >= 0 ? "+" : ""}${(d * 100).toFixed(0)} pts`;
