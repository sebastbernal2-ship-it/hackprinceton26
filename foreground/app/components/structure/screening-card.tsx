import Badge from "../reskin/badge";
import type { StructureResponse } from "../../lib/structure";

const TIER: Record<string, string> = { elevated: "bg-accent text-background", moderate: "bg-foreground/10 text-foreground", low: "bg-match-soft text-match", unknown: "border border-foreground/20 text-foreground/60" };

export default function ScreeningCard({ data }: { data: StructureResponse }) {
  const s = data.screening;
  return (
    <div className="rounded-2xl border border-foreground/15 p-4">
      <p className="text-sm font-semibold uppercase tracking-wide text-accent">Screening prior, not an engineering assessment</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className={`rounded-full px-3 py-1 text-sm font-medium ${TIER[s.tier] ?? TIER.unknown}`}>Tier: {s.tier}</span>
        {Object.entries(s.tierByLens).map(([lens, t]) => <span key={lens} className="text-xs text-foreground/60">{lens.replace("_", " + ")}: {t}</span>)}
      </div>
      <p className="mt-2 text-xs text-foreground/50">{s.tierRule}. The tier ranks where to look first, not whether the building is safe.</p>
      <ul className="mt-3 space-y-2 text-sm">
        {s.flags.map((f) => (
          <li key={f.id} className="rounded-lg border border-foreground/10 p-2.5">
            <div className="flex flex-wrap items-center gap-2"><span>{f.text}</span><Badge kind={f.status}>{f.status}</Badge>{f.severity && <Badge kind="derived">{f.severity}</Badge>}</div>
            {f.threshold && <p className="mt-1 text-xs text-foreground/50">Threshold {String(f.threshold.value)} ({f.threshold.source}): {f.threshold.note}</p>}
          </li>
        ))}
      </ul>
      {s.unknowns.length > 0 && <p className="mt-3 text-sm text-foreground/70">Unknown inputs (never guessed): {s.unknowns.join(", ")}.</p>}
      <p className="mt-2 text-xs text-foreground/50">
        Sources: CoStar kit fields (year built, material, stories), FEMA zone {data.hazards.fema?.zone ?? "unknown"}, USGS design category {data.hazards.usgs?.sdc ?? "unknown"}, site elevation {data.hazards.elevationFt ?? "unknown"} ft, retrieved {data.hazards.retrieved ?? "unknown"}. Subsidence: {data.hazards.subsidence}
      </p>
      <p className="mt-2 text-xs text-foreground/50">{s.notice}</p>
    </div>
  );
}
