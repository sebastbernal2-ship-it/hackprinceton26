"use client";

import { useEffect, useState } from "react";
import { fetchInspection, groupByCategory, CATEGORY_LABEL, MODE_BANNER, type DefectFinding, type InspectionResponse, type Severity } from "../lib/inspection";

const SEVERITY_TONE: Record<Severity, string> = {
  high: "bg-accent/15 text-accent",
  medium: "bg-foreground/10 text-foreground/80",
  low: "bg-match-soft text-match",
  unknown: "border border-foreground/15 text-foreground/45",
};

export default function InspectionPanel({ listingId, onData }: { listingId: number; onData?: (findings: DefectFinding[]) => void }) {
  const [state, setState] = useState<{ id: number; data: InspectionResponse | null } | null>(null);

  useEffect(() => {
    let live = true;
    fetchInspection(listingId).then(
      (data) => {
        if (!live) return;
        setState({ id: listingId, data });
        onData?.(data.mode === "live" || data.mode === "fixture" ? data.findings : []);
      },
      () => live && setState({ id: listingId, data: null }),
    );
    return () => {
      live = false;
    };
  }, [listingId, onData]);

  const current = state?.id === listingId ? state : null;
  const data = current?.data;

  return (
    <section className="mt-8 border-t border-foreground/10 pt-6" aria-labelledby="inspection-title">
      <h2 id="inspection-title" className="text-lg font-medium tracking-tight">Inspection findings</h2>
      <p className="mt-1 text-sm text-foreground/50">
        Things that could cost money, flagged from imagery and layout. Imagery cannot prove hidden defects; each finding says what an on-site inspector must verify.
      </p>
      {!current && <p className="mt-3 text-sm text-foreground/50">Loading inspection.</p>}
      {current && !data && <p className="mt-3 text-sm text-foreground/60">Cannot say: the inspection service did not answer.</p>}
      {data && data.mode !== "live" && (
        <p role="note" className="mt-3 rounded-lg border border-foreground/25 bg-foreground/5 px-3 py-2 text-sm font-medium">
          {MODE_BANNER[data.mode]}
          {data.notice ? <span className="font-normal text-foreground/60"> {data.notice}</span> : null}
        </p>
      )}
      {data && data.mode === "live" && data.notice && <p className="mt-3 text-sm text-foreground/60">{data.notice}</p>}
      {data && data.findings.length === 0 && <p className="mt-3 text-sm text-foreground/60">No findings. That does not mean the space has no defects.</p>}
      {data && groupByCategory(data.findings).map(([category, list]) => (
        <div key={category} className="mt-5">
          <h3 className="text-base font-medium">{CATEGORY_LABEL[category]}</h3>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {list.map((f) => (
              <li key={f.id} className="rounded-2xl border border-foreground/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">{f.title}</p>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${SEVERITY_TONE[f.severity]}`}>
                    {f.severity === "unknown" ? "Severity unknown" : `${f.severity[0].toUpperCase()}${f.severity.slice(1)} severity`}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-foreground/70">{f.description}</p>
                <p className="mt-2 text-xs text-foreground/50">
                  Model&apos;s own stated confidence: {Math.round(f.modelConfidence * 100)}% (not a probability) · Evidence: {f.evidence.source.replace("_", " ")} ({f.evidence.ref})
                  {f.roomId ? ` · Room ${f.roomId}` : ""}
                </p>
                <p className="mt-2 text-sm">
                  <span className="font-medium">Inspector must verify: </span>
                  {f.verificationStep}
                </p>
                {!f.canConfirmFromImagery && <p className="mt-1 text-xs text-foreground/50">Imagery alone cannot confirm this.</p>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
