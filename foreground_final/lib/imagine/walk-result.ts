import type { Assessment, Status } from "@/lib/feasibility/types";
import type { Range } from "@/lib/engine/types";

export type ImagineTone = "needed" | "saved" | "maybe" | "info";

/** One feasibility check as the Walk shows it: the sentence, its status, and the code it cites. */
export type WalkCheck = { id: string; label: string; status: Status; summary: string; citation?: { code: string; label: string; url?: string } };

export type WalkImagineSummary = {
  checks: WalkCheck[];
  permitWeeks: { low: number; high: number } | null;
  costDeltaUsd: { low: number; high: number };
  tone: ImagineTone;
};

/**
 * The tone of an Imagine result, from the real cost delta of that change against the owner's budget.
 * Savings read as saved; nothing to build as info; a blocker, or a delta of a tenth of the budget or more, as needed.
 */
export function toneFor(delta: Range, worst: Status, budgetUsd?: number): ImagineTone {
  if (delta.mid < 0) return "saved";
  if (worst === "likely-blocker") return "needed";
  if (delta.mid === 0 && delta.high === 0) return "info";
  const big = budgetUsd && budgetUsd > 0 ? delta.mid / budgetUsd >= 0.1 : delta.mid >= 25_000;
  return big ? "needed" : "maybe";
}

/** Fold an /api/imagine `checks` + `numbers` pair into what the imagineResult message shows. Checks needing a professional or blocking come first. */
export function summarizeImagine(assessment: Assessment, costDelta: Range, budgetUsd?: number): WalkImagineSummary {
  const rank: Record<Status, number> = { "likely-blocker": 0, "needs-professional": 1, "likely-fine": 2 };
  const checks = assessment.checks
    .filter((c) => c.triggeredBy.length > 0 || c.status !== "likely-fine")
    .sort((a, b) => rank[a.status] - rank[b.status])
    .slice(0, 4)
    .map((c): WalkCheck => {
      const cite = c.citations[0];
      return { id: c.id, label: c.label, status: c.status, summary: c.summary, citation: cite ? { code: cite.code, label: cite.source.label, url: cite.source.url } : undefined };
    });
  const w = assessment.time.permitWeeks;
  const permitWeeks = w.high > 0 ? { low: Math.round(w.low), high: Math.round(w.high) } : null;
  return {
    checks,
    permitWeeks,
    costDeltaUsd: { low: Math.round(costDelta.low), high: Math.round(costDelta.high) },
    tone: toneFor(costDelta, assessment.worst, budgetUsd),
  };
}
