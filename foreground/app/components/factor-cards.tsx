import { groupEvidence, type EvidenceGroup } from "../lib/evidence-groups";
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


export default function FactorCards({ factors, demo }: { factors: FactorCard[]; demo?: boolean }) {
  const groups = groupEvidence(factors);
  return (
    <section className="mt-8 border-t border-foreground/10 pt-6">
      <h2 className="text-lg font-medium tracking-tight">Evidence</h2>
      {groups.length === 0 ? (
        <p className="mt-3 text-sm text-foreground/50">
          {demo ? "Evidence cards for this demo scan are not built on this machine, so every factor is unknown here (not negative, not zero)." : "No evidence was found for this space yet."}
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-foreground/50">
            Observed facts come straight from a source record; derived and estimated values say how they were produced.
            Only what was found for this space is shown.
          </p>
          <ul className="mt-5 grid gap-4 md:grid-cols-2">
            {groups.map((g) => <Card key={g.factorId} group={g} />)}
          </ul>
        </>
      )}
    </section>
  );
}

function Card({ group }: { group: EvidenceGroup }) {
  const meta = [group.source && `Source: ${group.source}`, group.asOf && `As of ${group.asOf}`, group.geography && `Area: ${group.geography}`].filter(Boolean);
  return (
    <li className={`rounded-2xl border border-foreground/10 p-4 ${group.table ? "md:col-span-2" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium">{group.title}</p>
        <span className="flex shrink-0 gap-1">
          {group.statuses.map((s) => (
            <span key={s} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[s]}`}>{LABEL[s]}</span>
          ))}
        </span>
      </div>
      {group.table && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[26rem] text-sm">
            <thead className="text-left text-foreground/50">
              <tr><th className="pb-1.5 font-normal">Job</th>{group.table.columns.map((c) => <th key={c} className="pb-1.5 text-right font-normal">{c}</th>)}</tr>
            </thead>
            <tbody className="tabular-nums">
              {group.table.rows.map((r) => (
                <tr key={r.label} className="border-t border-foreground/10">
                  <td className="py-1.5 pr-3">{r.label}</td>
                  {r.cells.map((v, i) => <td key={i} className="py-1.5 text-right">{v ?? "–"}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {group.rows.length > 0 && (
        <dl className="mt-3 space-y-1.5 text-sm">
          {group.rows.map((r, i) => (
            <div key={`${r.label}-${i}`} className="flex justify-between gap-4">
              <dt className="text-foreground/60">{r.label}</dt>
              <dd className="text-right font-medium tabular-nums">{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {meta.length > 0 && <p className="mt-3 text-xs leading-relaxed text-foreground/45">{meta.join(" · ")}</p>}
      {group.limitations.length > 0 && <p className="mt-1 text-xs leading-relaxed text-foreground/55">Limits: {group.limitations.join(" ")}</p>}
    </li>
  );
}
