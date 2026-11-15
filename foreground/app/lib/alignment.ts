import type { Match } from "./matches";

/** How many of the operator's stated requirements the evidence confirms, cannot confirm, or contradicts. Not a fit score. */
export type Alignment = { pass: number; unknown: number; fail: number; total: number; confirmed: string[]; unknownItems: string[]; estimatedItems?: string[] };

export type AlignmentView = Alignment & { line: string };

const count = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** Null when the service sent no usable alignment (older backend): the card then shows nothing rather than a guess. */
export function alignmentView(match: Pick<Match, "alignment">): AlignmentView | null {
  const a = match.alignment;
  if (!a || !count(a.pass) || !count(a.unknown) || !count(a.fail) || !count(a.total) || a.total === 0) return null;
  const estimatedItems = list(a.estimatedItems);
  const line =
    `Requirements met: ${a.pass} of ${a.total}` + (estimatedItems.length > 0 ? ` (${estimatedItems.length} on estimates)` : "") +
    (a.unknown > 0 ? `, ${a.unknown} unknown` : "") + (a.fail > 0 ? `, ${a.fail} contradicted` : "");
  return { pass: a.pass, unknown: a.unknown, fail: a.fail, total: a.total, confirmed: list(a.confirmed), unknownItems: list(a.unknownItems), estimatedItems, line };
}

/** Indexes of the matches with strictly the most confirmed requirements. Empty when tied, or when nothing is confirmed. */
export function topAlignment(matches: Pick<Match, "alignment">[]): number[] {
  const passes = matches.map((m) => alignmentView(m)?.pass ?? -1);
  const max = Math.max(...passes, -1);
  if (max <= 0 || passes.every((p) => p === max)) return [];
  return passes.flatMap((p, i) => (p === max ? [i] : []));
}

export const COMPAT_WEIGHTS = { requirements: 0.7, evidence: 0.3 } as const;

export const COMPAT_HELP =
  "Compatibility is a blend, not a prediction: 70% share of your stated requirements met (estimates count as met, unknown and contradicted do not) " +
  "plus 30% evidence readiness (share of the facts we looked for that are observed for this space).";

/** Whole-number blend of requirements met and evidence readiness. Null when the service sent no alignment, so nothing is invented. */
export function compatibility(match: Pick<Match, "alignment" | "evidenceReadiness">): number | null {
  const view = alignmentView(match);
  if (!view || typeof match.evidenceReadiness !== "number") return null;
  const met = view.pass / view.total;
  const evidence = Math.min(100, Math.max(0, match.evidenceReadiness)) / 100;
  return Math.round(100 * (COMPAT_WEIGHTS.requirements * met + COMPAT_WEIGHTS.evidence * evidence));
}
