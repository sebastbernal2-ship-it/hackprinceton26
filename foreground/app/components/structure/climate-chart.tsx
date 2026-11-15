import type { ClimateMetric } from "../../lib/structure";

const W = 168, H = 64, PX = 14, PY = 8;

/** Small line chart: one line per scenario across horizons; the selected scenario is bold with the selected horizon highlighted. */
export default function ClimateChart({ metric, horizons, scenario, horizon }: { metric: ClimateMetric; horizons: number[]; scenario: string; horizon: number }) {
  const all = Object.values(metric.series).flatMap((s) => Object.values(s));
  if (all.length === 0) return null;
  const lo = Math.min(...all, metric.today ?? Infinity), hi = Math.max(...all);
  const span = hi - lo || 1;
  const x = (h: number) => PX + (horizons.indexOf(h) / Math.max(1, horizons.length - 1)) * (W - 2 * PX);
  const y = (v: number) => H - PY - ((v - lo) / span) * (H - 2 * PY);
  const pts = (sc: string) => horizons.filter((h) => metric.series[sc]?.[String(h)] !== undefined).map((h) => [x(h), y(metric.series[sc][String(h)])] as const);
  const sel = metric.series[scenario]?.[String(horizon)];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label={`${metric.label} by horizon for each scenario; ${scenario} ${horizon} highlighted`}>
      {horizons.map((h) => <text key={h} x={x(h)} y={H - 0.5} textAnchor="middle" fontSize="8" className={h === horizon ? "fill-foreground font-semibold" : "fill-foreground/40"}>{h}</text>)}
      {Object.keys(metric.series).filter((sc) => sc !== scenario).map((sc) => (
        <polyline key={sc} points={pts(sc).map((p) => p.join(",")).join(" ")} fill="none" className="stroke-foreground/20" strokeWidth="1.2" />
      ))}
      <polyline points={pts(scenario).map((p) => p.join(",")).join(" ")} fill="none" className="stroke-accent" strokeWidth="2.2" strokeLinejoin="round" />
      {sel !== undefined && <circle cx={x(horizon)} cy={y(sel)} r="4.2" className="fill-accent stroke-background" strokeWidth="1.5" />}
    </svg>
  );
}
