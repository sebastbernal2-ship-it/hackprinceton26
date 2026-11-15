import { detectConcept } from "@/lib/agent/brief";
import type { Concept, OwnerBrief } from "@/lib/engine/types";

/**
 * Brief completeness for the flow: what Foreground still has to ask before it can search, how it asks, and how
 * it says the brief back. Pure; the free text itself is parsed by lib/agent/brief.ts. Nothing is ever assumed:
 * an unreadable answer is asked again.
 */

export type ClarifyField = "concept" | "seats" | "budgetUsd";

/** asked in this order, each at most once (a re-ask rewords the same question) */
export const CLARIFY_ORDER: readonly ClarifyField[] = ["concept", "seats", "budgetUsd"];

/** `conceptKnown` is false when the owner's words named no concept (parseBriefRegex then holds a placeholder) */
export function missingFields(brief: OwnerBrief, conceptKnown = true): ClarifyField[] {
  return CLARIFY_ORDER.filter((f) => (f === "concept" ? !conceptKnown : brief[f] == null));
}

export function isBriefComplete(brief: OwnerBrief, conceptKnown = true): boolean {
  return missingFields(brief, conceptKnown).length === 0;
}

export function shortUsd(n: number): string {
  if (n >= 1_000_000) return `$${Number((n / 1_000_000).toFixed(1))}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

const SEAT_OPTIONS: Record<Concept, number[]> = {
  cafe: [15, 25, 40, 60],
  bar: [30, 40, 60, 100],
  "quick-service": [20, 40, 60, 80],
  "fast-casual": [20, 40, 60, 80],
  "full-service": [40, 60, 90, 120],
};

const CONCEPT_OPTIONS: { label: string; value: Concept }[] = [
  { label: "Quick service", value: "quick-service" },
  { label: "Fast casual", value: "fast-casual" },
  { label: "Full service", value: "full-service" },
  { label: "Cafe", value: "cafe" },
  { label: "Bar", value: "bar" },
];

export type ClarifyPrompt = { question: string; options: { label: string; value: number | string }[] };

export function clarifyPrompt(field: ClarifyField, brief: OwnerBrief, retry = false): ClarifyPrompt {
  const lead = retry ? "I did not catch that. " : "";
  if (field === "concept") {
    return { question: `${lead}What kind of place is it?`, options: CONCEPT_OPTIONS };
  }
  if (field === "seats") {
    return {
      question: `${lead}How many seats are you picturing?`,
      options: SEAT_OPTIONS[brief.concept].map((n) => ({ label: `About ${n}`, value: n })),
    };
  }
  return {
    question: `${lead}What can you spend on the build-out, all in?`,
    options: [100_000, 250_000, 500_000, 1_000_000].map((n) => ({ label: shortUsd(n), value: n })),
  };
}

const UNIT = /^(k|m|mm|grand|thousand|million)\b/i;

/**
 * Reads a typed reply to one clarify question. `parsed` is the regex parse of the same text, so "40 seats" and
 * "$200k" work; a bare number ("40", "150") is read as the thing that was asked. Undefined means "ask again".
 */
export function readAnswer(field: "seats" | "budgetUsd", text: string, parsed: OwnerBrief): number | undefined {
  if (parsed[field] != null) return parsed[field];
  const m = /(\$?)\s*(\d[\d,]*(?:\.\d+)?)\s*([a-z]*)/i.exec(text.trim());
  if (!m) return undefined;
  const n = Number(m[2].replace(/,/g, ""));
  if (!Number.isFinite(n)) return undefined;
  const moneyLike = m[1] === "$" || UNIT.test(m[3]);
  if (field === "seats") {
    if (moneyLike || !Number.isInteger(n)) return undefined;
    return n >= 4 && n <= 400 ? n : undefined;
  }
  if (n >= 5_000 && n <= 20_000_000) return n;
  // "150" in reply to a budget question means $150k
  if (n >= 5 && n < 1_000) return n * 1_000;
  return undefined;
}

/** a typed reply to the concept question: the words, or one of the chip labels */
export function readConcept(text: string): Concept | undefined {
  const t = text.trim().toLowerCase();
  return CONCEPT_OPTIONS.find((o) => o.label.toLowerCase() === t || o.value === t)?.value ?? detectConcept(text);
}

const CONCEPT_PHRASE: Record<Concept, string> = {
  "quick-service": "quick-service place",
  "fast-casual": "fast-casual place",
  "full-service": "full-service restaurant",
  cafe: "cafe",
  bar: "bar",
};

/** The brief said back in one or two short sentences. Only what the owner said or chose. */
export function briefSummary(brief: OwnerBrief, spaceCount: number): string {
  const what = `${brief.seats != null ? `a ${brief.seats}-seat` : "a"} ${CONCEPT_PHRASE[brief.concept]}`;
  const cuisine =
    brief.cuisine && !(brief.concept === "cafe" && brief.cuisine === "Coffee") ? `, ${brief.cuisine}` : "";
  const where = brief.city ? ` in ${brief.city}` : " in Houston or Los Angeles";
  const money = brief.budgetUsd != null ? `, with about ${shortUsd(brief.budgetUsd)} for the build-out` : "";
  const musts = brief.mustHaves?.length ? ` Must have: ${brief.mustHaves.join(", ")}.` : "";
  const count = spaceCount > 0 ? `all ${spaceCount} spaces` : "every space";
  return `Got it: ${what}${cuisine}${where}${money}.${musts} I'm checking ${count} against that now.`;
}

/**
 * The search query for /search?q=: the owner's own words, plus whatever they added while clarifying, written so
 * lib/agent/brief.ts reads the same concept, seats and budget back.
 */
export function briefQuery(text: string, said: OwnerBrief, brief: OwnerBrief, conceptStated = true): string {
  const extra: string[] = [];
  if (!conceptStated) extra.push(brief.concept);
  if (said.seats == null && brief.seats != null) extra.push(`${brief.seats} seats`);
  if (said.budgetUsd == null && brief.budgetUsd != null) {
    extra.push(`$${Math.round(brief.budgetUsd).toLocaleString("en-US")} budget`);
  }
  if (said.city == null && brief.city != null) extra.push(brief.city);
  return [text.trim().replace(/[\s,.;]+$/, ""), ...extra].join(", ").slice(0, 500);
}
