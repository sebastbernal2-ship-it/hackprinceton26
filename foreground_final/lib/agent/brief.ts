import { z } from "zod";
import type { Concept, OwnerBrief } from "@/lib/engine/types";

/**
 * Free text ("taqueria, 40 seats, $150k budget, Houston") → OwnerBrief.
 * `parseBriefRegex` is deterministic and always available; `parseBrief` asks Haiku first and
 * falls back to (and is sanity-checked by) the regex parse.
 */

const CONCEPT_RULES: [RegExp, Concept][] = [
  [/\b(caf[eé]|coffee|espresso|bakery|boba|tea\s?(shop|house|room)|juice|dessert|ice cream|donut|doughnut)\b/i, "cafe"],
  [/\b(full[- ]service|sit[- ]down|fine dining|bistro|steakhouse|trattoria|brasserie|table service|omakase)\b/i, "full-service"],
  [/\b(quick[- ]service|qsr|fast food|drive[- ]?thru|drive[- ]through|grab[- ]and[- ]go|take[- ]?out only|ghost kitchen)\b/i, "quick-service"],
  [/\b(fast[- ]casual|counter[- ]service|taqueria|taco|burrito|poke|bowl|sandwich|deli|pizza|pizzeria|burger|ramen|noodle|wings|bbq|barbecue)\b/i, "fast-casual"],
  [/\b(bar|pub|tavern|brewery|taproom|cocktail|lounge|wine bar|speakeasy)\b/i, "bar"],
];

const CUISINE_RULES: [RegExp, string][] = [
  [/\b(taqueria|taco|burrito|mexican|tex[- ]mex)\b/i, "Mexican"],
  [/\b(pizza|pizzeria)\b/i, "Pizza"],
  [/\b(ramen|sushi|japanese|izakaya|omakase)\b/i, "Japanese"],
  [/\b(korean|kbbq)\b/i, "Korean"],
  [/\b(pho|banh mi|vietnamese)\b/i, "Vietnamese"],
  [/\b(thai)\b/i, "Thai"],
  [/\b(chinese|dim sum|dumpling|szechuan|sichuan)\b/i, "Chinese"],
  [/\b(indian|curry|biryani)\b/i, "Indian"],
  [/\b(italian|pasta|trattoria)\b/i, "Italian"],
  [/\b(mediterranean|greek|falafel|shawarma|kebab|lebanese)\b/i, "Mediterranean"],
  [/\b(burger)\b/i, "Burgers"],
  [/\b(bbq|barbecue|smokehouse)\b/i, "Barbecue"],
  [/\b(poke|hawaiian)\b/i, "Hawaiian"],
  [/\b(coffee|espresso|caf[eé])\b/i, "Coffee"],
  [/\b(bakery|pastry|donut|doughnut)\b/i, "Bakery"],
  [/\b(boba|bubble tea|tea)\b/i, "Tea"],
  [/\b(sandwich|deli)\b/i, "Sandwiches"],
  [/\b(cajun|creole|gumbo|seafood)\b/i, "Seafood"],
  [/\b(vegan|plant[- ]based|salad)\b/i, "Plant-based"],
];

const MUST_HAVE_RULES: [RegExp, string][] = [
  [/\b(patio|outdoor (seating|dining)|terrace)\b/i, "patio"],
  [/\b(hood|vent(ed|ilation)?|exhaust)\b/i, "hood"],
  [/\bgrease (trap|interceptor)\b/i, "grease trap"],
  [/\bparking\b/i, "parking"],
  [/\bdrive[- ]?(thru|through)\b/i, "drive-thru"],
  [/\b(second[- ]gen(eration)?|2nd[- ]gen(eration)?|turn[- ]?key|move[- ]in ready)\b/i, "second-generation"],
  [/\bcorner\b/i, "corner"],
  [/\b(liquor|full bar|beer and wine)\b/i, "liquor"],
  [/\bwalk[- ]?in\b/i, "walk-in cooler"],
];

function parseMoney(text: string): number | undefined {
  const candidates: { value: number; weight: number }[] = [];
  const re = /(\$)\s?(\d[\d,]*(?:\.\d+)?)\s*(k|m|mm|thousand|million|grand)?\b|\b(\d[\d,]*(?:\.\d+)?)\s*(k|m|thousand|million|grand)\b/gi;
  for (const m of text.matchAll(re)) {
    const num = Number((m[2] ?? m[4]).replace(/,/g, ""));
    if (!Number.isFinite(num)) continue;
    const unit = (m[3] ?? m[5] ?? "").toLowerCase();
    const mult = unit === "k" || unit === "thousand" || unit === "grand" ? 1_000 : unit ? 1_000_000 : 1;
    const value = num * mult;
    // A per-square-foot rent ("$30/sf") is not a build-out budget.
    const after = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 12);
    if (/^\s*(\/|per)\s*(sf|sq|square|month|mo|yr|year)/i.test(after)) continue;
    const start = m.index ?? 0;
    const near = /budget|build[- ]?out|spend|invest|capital|cash/i;
    const before = text.slice(Math.max(0, start - 24), start);
    const next = text.slice(start + m[0].length, start + m[0].length + 12);
    const weight = near.test(before) || near.test(next) ? 2 : 1;
    if (value >= 5_000 && value <= 20_000_000) candidates.push({ value, weight });
  }
  candidates.sort((a, b) => b.weight - a.weight);
  return candidates[0]?.value;
}

function parseSeats(text: string): number | undefined {
  const m =
    /(\d{1,3})\s*[- ]?\s*(?:seats?|seater|seated|covers|chairs|person|people|ppl|guests)\b/i.exec(text) ??
    /\b(?:seats?|seating for|capacity(?: of)?)\s*(?:about|around|~)?\s*(\d{1,3})\b/i.exec(text);
  if (!m) return undefined;
  const n = Number(m[1]);
  return n >= 4 && n <= 400 ? n : undefined;
}

function parseCity(text: string): OwnerBrief["city"] {
  if (/\b(houston|htx|midtown houston|montrose|katy|the heights|sugar land|clear lake)\b/i.test(text)) return "Houston";
  if (/\b(los angeles|l\.a\.|dtla|hollywood|koreatown|k-?town|wilshire|santa monica|socal)\b/i.test(text)) return "Los Angeles";
  if (/(^|[\s,(])LA([\s,.)!?]|$)/.test(text)) return "Los Angeles";
  return undefined;
}

/**
 * The concept the words name, or undefined when they name none. The flow asks the owner in that case and never
 * assumes one. (`parseBriefRegex` still returns a placeholder `fast-casual` because OwnerBrief requires a concept.)
 */
export function detectConcept(text: string): Concept | undefined {
  return CONCEPT_RULES.find(([re]) => re.test(text))?.[1];
}

export function parseBriefRegex(text: string): OwnerBrief {
  const concept = detectConcept(text) ?? "fast-casual";
  const cuisine = CUISINE_RULES.find(([re]) => re.test(text))?.[1];
  const seats = parseSeats(text);
  const budgetUsd = parseMoney(text);
  const city = parseCity(text);
  const mustHaves = MUST_HAVE_RULES.filter(([re]) => re.test(text)).map(([, label]) => label);
  return {
    concept,
    ...(cuisine ? { cuisine } : {}),
    ...(seats ? { seats } : {}),
    ...(budgetUsd ? { budgetUsd } : {}),
    ...(city ? { city } : {}),
    ...(mustHaves.length ? { mustHaves } : {}),
  };
}

export const BriefSchema = z.object({
  concept: z
    .enum(["quick-service", "fast-casual", "full-service", "cafe", "bar"])
    .describe("Service style. Taquerias, pizza counters and bowls are fast-casual unless the owner says otherwise."),
  cuisine: z.string().nullable().describe("Cuisine in one or two words, e.g. Mexican. null if not stated."),
  seats: z.number().nullable().describe("Seats the owner wants. null if not stated."),
  budgetUsd: z.number().nullable().describe("Total build-out budget in US dollars. null if not stated."),
  city: z.enum(["Houston", "Los Angeles"]).nullable().describe("null unless the text names Houston or Los Angeles (or a neighbourhood in one)."),
  mustHaves: z.array(z.string()).describe("Short physical requirements the owner states, e.g. patio, hood, parking. Empty if none."),
});
export type BriefDraft = z.infer<typeof BriefSchema>;

/** Combine an LLM draft with the regex parse: explicit numbers in the text win over the model's reading. */
export function mergeBrief(draft: BriefDraft | null, fallback: OwnerBrief): OwnerBrief {
  if (!draft) return fallback;
  const seats = fallback.seats ?? (draft.seats && draft.seats >= 4 && draft.seats <= 400 ? Math.round(draft.seats) : undefined);
  const budgetUsd =
    fallback.budgetUsd ?? (draft.budgetUsd && draft.budgetUsd >= 5_000 && draft.budgetUsd <= 20_000_000 ? draft.budgetUsd : undefined);
  const city = fallback.city ?? draft.city ?? undefined;
  const cuisine = draft.cuisine?.trim() || fallback.cuisine;
  const mustHaves = [...new Set([...(fallback.mustHaves ?? []), ...draft.mustHaves.map((s) => s.trim().toLowerCase())])]
    .filter(Boolean)
    .slice(0, 6);
  return {
    concept: draft.concept,
    ...(cuisine ? { cuisine } : {}),
    ...(seats ? { seats } : {}),
    ...(budgetUsd ? { budgetUsd } : {}),
    ...(city ? { city } : {}),
    ...(mustHaves.length ? { mustHaves } : {}),
  };
}

export type BriefExtractor = (text: string, signal?: AbortSignal) => Promise<BriefDraft>;

/** Default extractor: one small Haiku structured-output call. */
export const haikuExtractor: BriefExtractor = async (text, signal) => {
  const { ChatAnthropic } = await import("@langchain/anthropic");
  const model = new ChatAnthropic({ model: "claude-haiku-5-5", maxTokens: 400, maxRetries: 0 });
  const structured = model.withStructuredOutput(BriefSchema, { name: "owner_brief" });
  return structured.invoke(
    [
      ["system", "Extract what a restaurant owner wants to open from their message. Use only what the message says; use null for anything it does not say."],
      ["human", text],
    ],
    { signal },
  );
};

export async function parseBrief(
  text: string,
  opts: { extractor?: BriefExtractor; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<{ brief: OwnerBrief; source: "llm" | "regex" }> {
  const fallback = parseBriefRegex(text);
  const extractor = opts.extractor ?? haikuExtractor;
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? 6_000);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  try {
    const draft = await Promise.race([
      extractor(text, signal),
      new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(new Error("brief timeout")), { once: true })),
    ]);
    return { brief: mergeBrief(BriefSchema.parse(draft), fallback), source: "llm" };
  } catch {
    return { brief: fallback, source: "regex" };
  }
}
