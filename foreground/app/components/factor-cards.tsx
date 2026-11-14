import type { FactorCard, FactorStatus } from "../lib/matches";

const LABEL: Record<FactorStatus, string> = {
  observed: "Observed",
  derived: "Derived",
  estimated: "Estimated",
  unknown: "Unknown",
};

const TONE: Record<FactorStatus, string> = {
  observed: "bg-match-soft text-match",
  derived: "bg-foreground/8 text-foreground/75",
  estimated: "border border-dashed border-foreground/30 text-foreground/70",
  unknown: "border border-foreground/15 text-foreground/45",
};

const title = (id: string) => id.replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase());

export default function FactorCards({ factors, demo }: { factors: FactorCard[]; demo?: boolean }) {
  if (factors.length === 0) {
    return (
      <section className="mt-8 border-t border-foreground/10 pt-6">
        <h2 className="text-lg font-medium tracking-tight">Evidence</h2>
        <p className="mt-3 text-sm text-foreground/50">
          {demo ? "Demo data carries no evidence cards." : "No evidence cards were returned for this space."}
        </p>
      </section>
    );
  }
  const known = factors.filter((factor) => factor.status !== "unknown");
  const unknown = factors.filter((factor) => factor.status === "unknown");
  return (
    <section className="mt-8 border-t border-foreground/10 pt-6">
      <h2 className="text-lg font-medium tracking-tight">Evidence</h2>
      <p className="mt-1 text-sm text-foreground/50">
        Observed facts come straight from a source record; derived and estimated values say how they were produced.
      </p>
      <ul className="mt-5 grid gap-4 md:grid-cols-2">
        {known.map((factor) => (
          <Card key={factor.factorId} factor={factor} />
        ))}
      </ul>
      {unknown.length > 0 && (
        <>
          <h3 className="mt-8 text-base font-medium">Unknown</h3>
          <p className="mt-1 text-sm text-foreground/50">
            No evidence was found for these. That is not a negative finding; it means we cannot say.
          </p>
          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {unknown.map((factor) => (
              <Card key={factor.factorId} factor={factor} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Card({ factor }: { factor: FactorCard }) {
  const hasValue = factor.value !== null && factor.value !== "";
  const meta = [
    factor.source && `Source: ${factor.source}`,
    factor.recordId && `Record ${factor.recordId}`,
    factor.asOf && `As of ${factor.asOf}`,
    factor.geography && `Area: ${factor.geography}`,
  ].filter(Boolean);
  return (
    <li className="rounded-2xl border border-foreground/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium">{title(factor.factorId)}</p>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[factor.status]}`}>
          {LABEL[factor.status]}
        </span>
      </div>
      <p className="mt-2 text-base tabular-nums">
        {hasValue ? `${factor.value}${factor.unit ? ` ${factor.unit}` : ""}` : <span className="text-foreground/45">No value</span>}
      </p>
      {meta.length > 0 && <p className="mt-2 text-xs leading-relaxed text-foreground/45">{meta.join(" · ")}</p>}
      {factor.limitations && <p className="mt-1 text-xs leading-relaxed text-foreground/55">Limits: {factor.limitations}</p>}
    </li>
  );
}
