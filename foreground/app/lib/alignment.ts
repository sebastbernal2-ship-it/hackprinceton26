import type { Match } from "./matches";

/** How many of the operator's stated requirements the evidence confirms, cannot confirm, or contradicts. Not a fit score. */
export type Alignment = { pass: number; unknown: number; fail: number; total: number; confirmed: string[]; unknownItems: string[] };

export type AlignmentView = Alignment & { line: string };

const count = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** Null when the service sent no usable alignment (older backend): the card then shows nothing rather than a guess. */
export function alignmentView(match: Pick<Match, "alignment">): AlignmentView | null {
  const a = match.alignment;
  if (!a || !count(a.pass) || !count(a.unknown) || !count(a.fail) || !count(a.total) || a.total === 0) return null;
  const line =
    `Requirements confirmed by evidence: ${a.pass} of ${a.total}, ${a.unknown} unknown` + (a.fail > 0 ? `, ${a.fail} contradicted` : "");
  return { pass: a.pass, unknown: a.unknown, fail: a.fail, total: a.total, confirmed: list(a.confirmed), unknownItems: list(a.unknownItems), line };
}

/** Indexes of the matches with strictly the most confirmed requirements. Empty when tied, or when nothing is confirmed. */
export function topAlignment(matches: Pick<Match, "alignment">[]): number[] {
  const passes = matches.map((m) => alignmentView(m)?.pass ?? -1);
  const max = Math.max(...passes, -1);
  if (max <= 0 || passes.every((p) => p === max)) return [];
  return passes.flatMap((p, i) => (p === max ? [i] : []));
}
