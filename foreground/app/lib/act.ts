import type { CostLineItem } from "./costs";
import type { FactorCard } from "./matches";
import { CATEGORY_LABEL, type DefectFinding } from "./inspection";

export type ActItem = { id: string; group: string; text: string; origin: string };

/** Deterministic checklist: no LLM. Every inspection finding yields its verification step; every unknown factor and unknown cost yields a question. */
export function buildChecklist(findings: DefectFinding[], factors: FactorCard[], lines: CostLineItem[]): ActItem[] {
  const items: ActItem[] = [];
  const rank = { high: 0, medium: 1, unknown: 2, low: 3 } as const;
  for (const f of [...findings].sort((a, b) => rank[a.severity] - rank[b.severity])) {
    items.push({
      id: `finding:${f.id}`,
      group: "Verify on site",
      text: `${f.title}: ${f.verificationStep}${f.canConfirmFromImagery ? "" : " (imagery cannot confirm this)"}`,
      origin: `${CATEGORY_LABEL[f.category]}, severity ${f.severity}`,
    });
  }
  for (const factor of factors.filter((x) => x.status === "unknown")) {
    const name = factor.factorId.replace(/[_-]+/g, " ");
    items.push({ id: `factor:${factor.factorId}`, group: "Ask the landlord", text: `What is the ${name} for this space? We found no evidence.`, origin: "Unknown factor" });
  }
  for (const line of lines.filter((x) => x.status === "unknown" || x.expected === null)) {
    items.push({ id: `cost:${line.itemId}`, group: "Get a quote", text: `Get a written quote for: ${line.label}.`, origin: "Unpriced cost line" });
  }
  return items;
}
