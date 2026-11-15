import type { CostLineItem } from "./costs";
import type { FactorCard } from "./matches";
import { CATEGORY_LABEL, type DefectFinding } from "./inspection";

export type ActItem = { id: string; group: string; text: string; origin: string };

/** Deterministic diligence prompts: no LLM. Findings become verification steps; unknown evidence and costs become requests for confirmation or quotes. */
export function buildChecklist(findings: DefectFinding[], factors: FactorCard[], lines: CostLineItem[]): ActItem[] {
  const items: ActItem[] = [];
  const rank = { high: 0, medium: 1, unknown: 2, low: 3 } as const;
  for (const f of [...findings].sort((a, b) => rank[a.severity] - rank[b.severity])) {
    items.push({
      id: `finding:${f.id}`,
      group: "Verify on site",
      text: `${f.title}: ${f.verificationStep}${f.canConfirmFromImagery ? "" : " Imagery cannot confirm this; inspect in person or request supporting records."}`,
      origin: `${CATEGORY_LABEL[f.category]} finding · ${f.severity} priority`,
    });
  }
  for (const factor of factors.filter((x) => x.status === "unknown")) {
    const name = factor.factorId.replace(/[_-]+/g, " ");
    items.push({
      id: `factor:${factor.factorId}`,
      group: "Confirm with landlord",
      text: `Confirm ${name} for this space and request the source document or written confirmation. No evidence was found in this review.`,
      origin: "Evidence gap",
    });
  }
  for (const line of lines.filter((x) => x.status === "unknown" || x.expected === null)) {
    items.push({
      id: `cost:${line.itemId}`,
      group: "Get written quotes",
      text: `Request an itemized written quote for ${line.label}, including scope, exclusions, timing, and whether it is one-time, monthly, or annual.`,
      origin: "Unpriced cost line",
    });
  }
  return items;
}
