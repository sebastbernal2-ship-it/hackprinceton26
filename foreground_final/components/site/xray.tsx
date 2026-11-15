import type { SiteAnalysis } from "@/lib/engine/types";
import type { Finding } from "@/lib/sites/schema";
import { usd, usdRange } from "@/lib/format";
import { BudgetVessel } from "./budget-vessel";
import { lineKey } from "./focus-key";
import { DimensionLine, niceMax, niceStep } from "./dimension-line";
import { Estimate, SourceLabel, STATUS_TEXT } from "./primitives";
import { TweenRange, Tween } from "./tween";
import { SeeInScan, XRayRow } from "./xray-row";

const ORDER = { needed: 0, maybe: 1, saved: 2 } as const;

export function XRay({ analysis, findings, lensPanos = [] }: { analysis: SiteAnalysis; findings: Finding[]; lensPanos?: string[] }) {
  const { xray, brief } = analysis;
  const lines = [...xray.lines].sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.range.mid - a.range.mid);
  const max = niceMax(Math.max(...lines.map((l) => l.range.high), 1));
  const step = niceStep(max);
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  const byId = new Map(findings.map((f) => [f.id, f]));

  return (
    <div className="@container">
    <div className="grid gap-x-10 gap-y-10 @6xl:grid-cols-12">
      <div className="@6xl:col-span-4 @6xl:order-2 @3xl:max-w-xl">
        <BudgetBlock analysis={analysis} />
      </div>

      <div className="@6xl:col-span-8 @6xl:order-1">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">
            Build-out cost lines for a {brief.concept} concept, low to high range in US dollars
          </caption>
          <thead className="hidden md:table-header-group">
            <tr className="border-b border-rule-strong text-xs font-medium uppercase tracking-[0.06em] text-ink-2">
              <th scope="col" className="w-28 pb-2 font-medium">Status</th>
              <th scope="col" className="pb-2 font-medium">Item</th>
              <th scope="col" className="w-[32%] pb-2 font-medium">
                <span className="sr-only">Range on a shared scale</span>
                <span aria-hidden className="relative block h-4">
                  {ticks.map((t) => (
                    <span
                      key={t}
                      className="absolute top-0 -translate-x-1/2 font-mono text-[0.625rem] font-normal normal-case tracking-normal first:translate-x-0 last:-translate-x-full"
                      style={{ left: `${(t / max) * 100}%` }}
                    >
                      {usd(t)}
                    </span>
                  ))}
                </span>
              </th>
              <th scope="col" className="w-32 pb-2 text-right font-medium">Range</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const f = l.findingId ? byId.get(l.findingId) : undefined;
              return (
                <XRayRow key={l.id} focusKey={lineKey(l)} index={i} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-b border-rule py-3 md:table-row">
                  <td className="col-span-2 md:w-28 md:py-3 md:align-top">
                    <StatusMark status={l.status} />
                  </td>
                  <td className="col-span-2 md:py-3 md:pr-4 md:align-top">
                    <p className={`font-semibold leading-snug ${l.status === "saved" ? "text-saved" : ""}`}>{l.label}</p>
                    <p className="mt-0.5 text-sm leading-snug text-ink-2">{l.reason}</p>
                    <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <SourceLabel source={l.source} />
                      {f ? <SeeInScan findingId={f.id} panoId={f.panoId && lensPanos.includes(f.panoId) ? f.panoId : undefined} /> : null}
                    </div>
                  </td>
                  <td className="relative md:py-3 md:align-top">
                    <div className="relative pt-1.5">
                      <span aria-hidden className="absolute inset-0 hidden md:block">
                        {ticks.slice(1, -1).map((t) => (
                          <span key={t} className="absolute top-0 h-full border-l border-dotted border-rule" style={{ left: `${(t / max) * 100}%` }} />
                        ))}
                      </span>
                      <DimensionLine range={l.range} max={max} status={l.status} draw="load" index={i} />
                    </div>
                  </td>
                  <td className="text-right md:py-3 md:align-top">
                    <TweenRange
                      low={l.range.low}
                      high={l.range.high}
                      delay={0.3 + i * 0.05}
                      className={`lettering text-lg font-semibold leading-none whitespace-nowrap ${l.status === "saved" ? "text-saved line-through decoration-1" : ""}`}
                    />
                    {l.status === "saved" ? <span className="block text-xs text-saved">not spent</span> : null}
                  </td>
                </XRayRow>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-ink-2">
          Ranges, not quotes. Unknown lines count at half their range in the total. Get contractor bids before you sign.
        </p>
      </div>
    </div>
    </div>
  );
}

function StatusMark({ status }: { status: keyof typeof STATUS_TEXT }) {
  const cls =
    status === "needed"
      ? "bg-needed text-on-ink border-needed"
      : status === "saved"
        ? "border-saved text-saved"
        : "border-maybe-ink border-dashed text-maybe-ink";
  return (
    <span className={`inline-block rounded-sm border px-1.5 py-px text-[0.6875rem] font-semibold uppercase tracking-[0.06em] ${cls}`}>
      {STATUS_TEXT[status]}
    </span>
  );
}

function BudgetBlock({ analysis }: { analysis: SiteAnalysis }) {
  const { xray, brief } = analysis;
  const budget = brief.budgetUsd ?? null;
  const total = xray.total;
  const over = budget ? { low: Math.max(0, total.low - budget), high: Math.max(0, total.high - budget) } : null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.06em] text-ink-2">Total to open</p>
        <p className="lettering mt-1 text-[2.75rem] font-bold leading-none sm:text-[3.25rem]">
          <TweenRange low={total.low} high={total.high} delay={0.2} />
        </p>
        <p className="mt-1 text-sm text-ink-2">
          Most likely <Tween value={total.mid} kind="usd" delay={0.2} className="font-semibold text-ink" />, contingency included. <Estimate />
        </p>
      </div>

      <BudgetVessel
        lines={xray.lines.map(({ id, label, status, range, findingId }) => ({ id, label, status, range, findingId }))}
        total={total}
        budget={budget}
      />

      {over && over.high > 0 ? (
        <p className="border-l-0 text-base leading-snug">
          <span className="font-semibold text-needed">
            {over.low > 0 ? `Over budget by ${usdRange(over)}.` : `Up to ${usd(over.high)} over budget at the high end.`}
          </span>{" "}
          Ask the landlord for tenant improvement money or more free rent.
        </p>
      ) : budget ? (
        <p className="text-base font-semibold text-saved">Fits your {usd(budget)} budget even at the high end.</p>
      ) : (
        <p className="text-sm text-ink-2">Add a budget to compare.</p>
      )}

      {xray.saved.high > 0 ? (
        <p className="text-sm leading-snug">
          <span className="font-semibold text-saved">{usdRange(xray.saved)} already in the walls.</span>{" "}
          <span className="text-ink-2">Existing equipment you would not have to buy, compared with a bare shell.</span>
        </p>
      ) : null}
    </div>
  );
}
