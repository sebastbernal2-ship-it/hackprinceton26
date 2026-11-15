import { ChevronRight } from "lucide-react";
import type { Cited, Scenario, ScenarioName, SiteAnalysis } from "@/lib/engine/types";
import { num, pct, usd, usdRange } from "@/lib/format";
import { niceStep } from "./dimension-line";
import { Estimate, Fact, SourceLabel } from "./primitives";
import { Tween } from "./tween";

const VERDICT = {
  comfortable: { text: "Comfortable", cls: "border-saved text-saved" },
  stretch: { text: "A stretch", cls: "border-maybe-ink border-dashed text-maybe-ink" },
  unlikely: { text: "Unlikely", cls: "border-needed bg-needed text-on-ink" },
} as const;

const SCEN: Record<ScenarioName, { name: string; color: string; dash?: string }> = {
  slow: { name: "Slow", color: "var(--needed)", dash: "6 4" },
  base: { name: "Base", color: "var(--ink)" },
  strong: { name: "Strong", color: "var(--saved)", dash: "2 3" },
};

export function Money({ analysis }: { analysis: SiteAnalysis }) {
  const { breakeven: be, occupancy, timeToOpen, scenarios, seats } = analysis;
  const v = VERDICT[be.verdict];
  // break-even runs on the smaller of what the space fits and what the owner plans
  const seatsUsed = analysis.brief.seats ? Math.min(seats.seats, analysis.brief.seats) : seats.seats;

  return (
    <div className="flex flex-col gap-12">
      {/* break-even */}
      <div className="grid gap-x-10 gap-y-6 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <h3 className="lettering text-xl font-semibold">Break-even from rent</h3>
          <p className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`inline-block rounded-sm border px-2 py-0.5 text-sm font-semibold uppercase tracking-[0.04em] ${v.cls}`}>{v.text}</span>
            <span className="text-sm text-ink-2">
              {num(be.turnsPerDay, 1)} table turns a day across {num(seatsUsed)} seats.
            </span>
          </p>
          <p className="mt-3 text-sm leading-snug text-ink-2">
            What the restaurant must sell for rent and occupancy to stay a healthy share of sales.
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4 lg:col-span-8">
          <Fact label="Sales needed / yr" value={<Tween value={be.salesNeededUsd} kind="usd" />} note={<Estimate />} />
          <Fact label="Covers / day" value={<Tween value={be.coversPerDay} />} note={<Estimate />} />
          <Fact label="Turns / day" value={<Tween value={be.turnsPerDay} kind="dec1" />} note={<Estimate />} />
          <Fact label="Average check" value={<Tween value={be.avgCheckUsd} kind="usd" />} note={<Estimate />} />
        </dl>
      </div>

      {/* three years */}
      <div className="grid gap-x-10 gap-y-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <h3 className="lettering text-xl font-semibold">Three years, three ways</h3>
          <p className="mt-1 text-base font-medium">{scenarios.verdict}</p>
          <ScenarioChart analysis={analysis} width={440} className="hidden sm:block" />
          <ScenarioChart analysis={analysis} width={330} className="sm:hidden" />
        </div>
        <div className="lg:col-span-5">
          <ScenarioTable scenarios={scenarios.scenarios} />
        </div>
      </div>

      {/* occupancy + time */}
      <dl className="grid gap-x-10 gap-y-6 border-t border-rule pt-6 sm:grid-cols-2 lg:grid-cols-4">
        <Fact
          label="Occupancy / yr"
          value={usdRange(occupancy.annualUsd)}
          note={<span className="text-ink-2">{occupancy.basis} <Estimate /></span>}
        />
        <Fact label="Time to open" value={`${num(timeToOpen.months.low)}–${num(timeToOpen.months.high)} months`} note={<span className="text-ink-2">{timeToOpen.basis} <Estimate /></span>} />
        <Fact label="Rent before opening" value={usdRange(timeToOpen.deadRentUsd)} note={<span className="text-ink-2">Rent paid while you build <Estimate /></span>} />
        <Fact label="Seats the plan fits" value={<Tween value={seats.seats} />} note={<span className="text-ink-2">{seats.basis} <Estimate /></span>} />
      </dl>

      <Assumptions items={[...be.assumptions, ...scenarios.assumptions]} />
    </div>
  );
}

function ScenarioTable({ scenarios }: { scenarios: Record<ScenarioName, Scenario> }) {
  const order: ScenarioName[] = ["slow", "base", "strong"];
  return (
    <table className="w-full border-collapse text-left text-sm">
      <caption className="sr-only">Three-year scenarios: yearly sales, rent share, profit and payback</caption>
      <thead>
        <tr className="border-b border-rule-strong text-xs uppercase tracking-[0.06em] text-ink-2">
          <th scope="col" className="py-2 font-medium">Case</th>
          <th scope="col" className="py-2 text-right font-medium">Sales / yr</th>
          <th scope="col" className="py-2 text-right font-medium">Rent share</th>
          <th scope="col" className="py-2 text-right font-medium">Profit / yr</th>
          <th scope="col" className="py-2 text-right font-medium">Payback</th>
        </tr>
      </thead>
      <tbody>
        {order.map((k) => {
          const s = scenarios[k];
          return (
            <tr key={k} className="border-b border-rule">
              <th scope="row" className="py-2.5 font-semibold">
                <span className="flex items-center gap-2">
                  <svg width="18" height="6" aria-hidden>
                    <line x1="0" x2="18" y1="3" y2="3" stroke={SCEN[k].color} strokeWidth="2.5" strokeDasharray={SCEN[k].dash} />
                  </svg>
                  {SCEN[k].name}
                </span>
                <span className="block text-xs font-normal text-ink-2">${num(s.salesPerSfYr)}/SF</span>
              </th>
              <td className="py-2.5 text-right">{usd(s.annualSalesUsd)}</td>
              <td className={`py-2.5 text-right ${s.occupancySharePct > 15 ? "font-semibold text-needed" : ""}`}>{pct(s.occupancySharePct, 1)}</td>
              <td className={`py-2.5 text-right font-semibold ${s.annualProfitUsd < 0 ? "text-needed" : ""}`}>{usd(s.annualProfitUsd)}</td>
              <td className="py-2.5 text-right">{s.paybackYears == null ? "Never" : `${num(s.paybackYears, 1)} yr`}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={5} className="pt-2 text-xs text-ink-2">
            <Estimate /> Ranges, not promises. Rent share above 15% is where restaurants struggle.
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

function ScenarioChart({ analysis, width, className }: { analysis: SiteAnalysis; width: number; className?: string }) {
  const start = -analysis.xray.total.mid;
  const order: ScenarioName[] = ["slow", "base", "strong"];
  const series = order.map((k) => ({
    k,
    pts: [start, ...analysis.scenarios.scenarios[k].years.map((y) => y.cumulativeCashUsd)],
  }));
  const all = series.flatMap((s) => s.pts).concat(0);
  const step = niceStep(Math.max(...all) - Math.min(...all), 4);
  const lo = Math.floor(Math.min(...all) / step) * step;
  const hi = Math.ceil(Math.max(...all) / step) * step;
  const W = width;
  const H = 230;
  const L = 52;
  const R = width < 400 ? 74 : 62;
  const T = 12;
  const B = 28;
  const x = (i: number) => L + (i / 3) * (W - L - R);
  const y = (v: number) => T + ((hi - v) / (hi - lo || 1)) * (H - T - B);
  const grid: number[] = [];
  for (let g = lo; g <= hi + 1; g += step) grid.push(g);

  // avoid overlapping end labels
  const ends = series.map((s) => ({ k: s.k, y: y(s.pts[3]) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
  const endY = Object.fromEntries(ends.map((e) => [e.k, e.y]));

  return (
    <figure className={`m-0 mt-4 ${className ?? ""}`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="dim-draw h-auto w-full overflow-visible" role="img" aria-labelledby={`scen-title-${width} scen-desc-${width}`}>
        <title id={`scen-title-${width}`}>Cumulative cash over three years</title>
        <desc id={`scen-desc-${width}`}>
          {series.map((s) => `${SCEN[s.k].name}: ${usd(s.pts[3])} after year 3`).join("; ")}. Starts at {usd(start)}, the build-out midpoint.
        </desc>
        {grid.map((g) => (
          <g key={g}>
            <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke={g === 0 ? "var(--ink)" : "var(--rule)"} strokeWidth={g === 0 ? 1.25 : 1} strokeDasharray={g === 0 ? undefined : "2 3"} />
            <text x={L - 6} y={y(g) + 3.5} textAnchor="end" fontSize="10" fill="var(--ink-2)">
              {usd(g)}
            </text>
          </g>
        ))}
        {[0, 1, 2, 3].map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--ink-2)">
            {i === 0 ? "Opening" : `Year ${i}`}
          </text>
        ))}
        {series.map((s) => (
          <g key={s.k}>
            <polyline
              className={SCEN[s.k].dash ? "dt" : "dd"}
              pathLength={SCEN[s.k].dash ? undefined : 1}
              style={{ ["--i" as string]: 4 }}
              points={s.pts.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
              fill="none"
              stroke={SCEN[s.k].color}
              strokeWidth={s.k === "base" ? 2.5 : 2}
              strokeDasharray={SCEN[s.k].dash}
              strokeLinejoin="round"
            />
            {s.pts.map((v, i) => (
              <circle key={i} className="dt" style={{ ["--i" as string]: 6 + i * 2 }} cx={x(i)} cy={y(v)} r={2.5} fill="var(--paper)" stroke={SCEN[s.k].color} strokeWidth={1.5} />
            ))}
            <text x={W - R + 6} y={endY[s.k] + 3.5} fontSize="10.5" fontWeight={600} fill={SCEN[s.k].color}>
              {SCEN[s.k].name} {usd(s.pts[3])}
            </text>
          </g>
        ))}
        <text x={x(0) + 4} y={y(0) - 5} fontSize="9.5" fill="var(--ink)">
          cash back to zero
        </text>
      </svg>
      <figcaption className="mt-1 text-xs text-ink-2">
        Cumulative cash after build-out. Starts at the build-out midpoint. <Estimate />
      </figcaption>
    </figure>
  );
}

function Assumptions({ items }: { items: Cited[] }) {
  return (
    <details className="group border-t border-rule pt-4" open>
      <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium uppercase tracking-[0.06em] text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-3.5 transition-transform group-open:rotate-90" />
        Assumptions and sources ({items.length})
      </summary>
      <ul className="mt-3 grid gap-x-10 gap-y-2 sm:grid-cols-2">
        {items.map((a, i) => (
          <li key={i} className="flex flex-col border-b border-dotted border-rule pb-2 text-sm">
            <span>{a.label}</span>
            {a.url ? (
              <a href={a.url} target="_blank" rel="noreferrer" className="w-fit font-mono text-[0.6875rem] text-ink-2 underline hover:text-ink">
                src {a.source}
              </a>
            ) : (
              <SourceLabel source={a.source} />
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
