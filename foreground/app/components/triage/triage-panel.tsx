"use client";

import { useEffect, useState } from "react";
import {
  FIELD_LABEL, SCOPE_LABEL, STATUS_LABEL, fetchAerial, fetchQueue, fetchTriage, scopeMismatch, showValue, statusCounts,
  type AerialResult, type QueueResponse, type TriageField, type TriageResult, type TriageStatus,
} from "../../lib/triage";
import LineagePanel from "./lineage-panel";

const TONE: Record<TriageStatus, string> = {
  confirmed: "bg-match-soft text-match",
  filled: "bg-accent/10 text-accent",
  conflicting: "bg-accent text-background",
  "blank-unfillable": "border border-foreground/20 text-foreground/55",
  unverified: "border border-dashed border-foreground/30 text-foreground/55",
};

function Cell({ label, value, unit }: { label: string; value: string; unit?: string }) {
  const unknown = value === "Cannot say";
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-foreground/45">{label}</div>
      <div className={`text-sm ${unknown ? "italic text-foreground/45" : ""}`}>{value}{!unknown && unit && !value.includes(unit) ? ` ${unit}` : ""}</div>
    </div>
  );
}

function FieldRow({ f }: { f: TriageField }) {
  const mismatch = scopeMismatch(f);
  const scanOrAerial = f.scanValue ?? f.aerialValue;
  const source = f.scanValue != null ? "Matterport scan" : f.aerialValue != null ? "Vexcel aerial" : "Scan / aerial";
  return (
    <li className="grid gap-3 border-t border-foreground/10 py-3 md:grid-cols-[10rem_1fr_1fr_auto]" data-testid={`triage-${f.field}`}>
      <div>
        <div className="text-sm font-medium">{FIELD_LABEL[f.field] ?? f.field}</div>
        <div className="mt-1 text-xs text-foreground/50">{SCOPE_LABEL[f.scope] ?? f.scope}{mismatch ? " (scope mismatch: no verdict)" : ""}</div>
      </div>
      <Cell label="CoStar says" value={showValue(f.costarValue, f.unit)} unit={f.unit} />
      <Cell label={`${source} say${f.scanValue != null || f.aerialValue != null ? "s" : ""}`} value={showValue(scanOrAerial, f.unit)} unit={f.unit} />
      <div className="flex flex-col items-start gap-1 md:items-end">
        <span className={`rounded-full px-2 py-0.5 text-xs ${TONE[f.status]}`}>{STATUS_LABEL[f.status]}</span>
        <span className="text-[11px] text-foreground/45">{f.valueStatus} · confidence {f.confidence} (rule label)</span>
      </div>
      <div className="md:col-span-4">
        {f.note && <p className="text-xs text-foreground/60">{f.note}</p>}
        <p className="text-xs text-foreground/40">Rule: {f.rule}</p>
        {f.evidenceRefs.length > 0 && (
          <ul className="mt-1 flex flex-wrap gap-1.5" aria-label="Evidence references">
            {f.evidenceRefs.map((e, i) => (
              <li key={i} title={e.detail ?? e.ref} className="rounded border border-foreground/15 px-1.5 py-0.5 text-[11px] text-foreground/60">
                {e.source}: {e.ref}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

function Aerial({ a }: { a: AerialResult | null }) {
  if (!a) return <p className="mt-2 text-xs text-foreground/50">Aerial: no Vexcel analysis for this listing. Cannot say.</p>;
  const v = a.vehicles;
  return (
    <div className="mt-3 rounded-lg border border-foreground/10 p-3 text-xs text-foreground/70" data-testid="aerial-card">
      <div className="font-medium text-foreground">Aerial layer (Vexcel)</div>
      {v.expected != null ? (
        <p className="mt-1">
          Vehicles in the crop (not parking stalls): {v.low}-{v.high}, expected {v.expected}. <span className="text-foreground/50">{v.rationale}</span>
        </p>
      ) : <p className="mt-1">Vehicles: cannot say.</p>}
      <ul className="mt-1 list-disc pl-4 text-foreground/55">
        {(["rooftop_units", "parking_stalls", "loading_docks", "roof_area_shape"] as const).map((k) => (
          <li key={k}>{k.replace(/_/g, " ")}: Cannot say. {a[k].reason}</li>
        ))}
      </ul>
      <p className="mt-1 text-foreground/45">Imagery date {a.imagery.capture_date ?? "unknown"}. {a.provenance}</p>
    </div>
  );
}

export default function TriagePanel({ listingId }: { listingId: number }) {
  const [state, setState] = useState<{ id: number; triage: TriageResult | null; aerial: AerialResult | null; queue: QueueResponse | null } | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([fetchTriage(listingId), fetchAerial(listingId), fetchQueue(8)]).then(([triage, aerial, queue]) => {
      if (live) setState({ id: listingId, triage, aerial, queue });
    });
    return () => { live = false; };
  }, [listingId]);

  const cur = state?.id === listingId ? state : null;
  const t = cur?.triage;
  const counts = t ? statusCounts(t.fields) : null;
  const mine = cur?.queue?.items.filter((q) => q.listingId === String(listingId)) ?? [];

  return (
    <section className="mt-8 border-t border-foreground/10 pt-6" aria-labelledby="triage-title">
      <h2 id="triage-title" className="text-lg font-medium tracking-tight">Record triage: what CoStar says vs. what the scan and aerial say</h2>
      <p className="mt-1 text-sm text-foreground/50">
        Screening triage, not an engineering assessment and not a claim that CoStar is wrong. A suite scan compared with a building number gives no verdict. Confidence is a rule label, not a probability.
      </p>
      {!cur && <p className="mt-3 text-sm text-foreground/50">Loading triage.</p>}
      {cur && !t && <p className="mt-3 text-sm text-foreground/60" data-testid="triage-unavailable">No triage result for this listing. Cannot say whether the record is complete; this is not a finding that it is.</p>}
      {t && counts && (
        <>
          <p className="mt-3 text-sm" data-testid="triage-summary">
            {t.hasScan ? "Matterport scan on file" : "No Matterport scan"} · {t.hasAerial ? "Vexcel aerial on file" : "No aerial"} ·{" "}
            {counts.confirmed} confirmed, {counts.filled} filled, {counts.conflicting} conflicting, {counts["blank-unfillable"]} cannot say, {counts.unverified} unverified
          </p>
          <ul className="mt-2">{[...t.fields].sort((a, b) => b.reviewScore - a.reviewScore).map((f) => <FieldRow key={f.field} f={f} />)}</ul>
          <Aerial a={cur.aerial} />
          {mine.length > 0 && <p className="mt-2 text-xs text-foreground/50">In the researcher review queue: {mine.map((q) => `${FIELD_LABEL[q.field] ?? q.field} (score ${q.score})`).join(", ")}.</p>}
        </>
      )}
      {cur?.queue && (
        <details className="mt-4 rounded-lg border border-foreground/10 p-3" data-testid="review-queue">
          <summary className="cursor-pointer text-sm font-medium">Researcher review queue ({cur.queue.total} items, top {cur.queue.items.length})</summary>
          <p className="mt-2 text-xs text-foreground/50">{cur.queue.notice}</p>
          <ol className="mt-2 space-y-1 text-xs">
            {cur.queue.items.map((q, i) => (
              <li key={i} className="flex flex-wrap gap-x-3 border-t border-foreground/10 pt-1">
                <span className="w-10 tabular-nums text-foreground/50">{q.score}</span>
                <span className="w-28">{FIELD_LABEL[q.field] ?? q.field}</span>
                <span className="w-32">{STATUS_LABEL[q.status]}</span>
                <span className="text-foreground/55">CoStar {showValue(q.costarValue)} vs {showValue(q.scanValue ?? q.aerialValue)} · {SCOPE_LABEL[q.scope] ?? q.scope}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
      <LineagePanel listingId={listingId} />
    </section>
  );
}
