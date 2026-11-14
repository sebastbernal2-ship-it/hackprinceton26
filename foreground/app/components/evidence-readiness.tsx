import type { Match } from "../lib/matches";

export const EVIDENCE_READINESS_HELP =
  "Evidence readiness is the share of the facts we looked for that are verified for this space. " +
  "It is not a quality, fit, or ranking score. Unknown means no evidence was found, not that the answer is bad.";

export default function EvidenceReadiness({ match }: { match: Pick<Match, "evidenceReadiness" | "demo"> }) {
  if (match.demo) {
    return (
      <span
        title="Hand-typed sample data shown because NEXT_PUBLIC_DEMO_FALLBACK=1. No evidence was checked."
        className="shrink-0 rounded-full border border-dashed border-foreground/30 px-3 py-1 text-sm font-medium text-foreground/60"
      >
        Demo data
      </span>
    );
  }
  return (
    <span
      title={EVIDENCE_READINESS_HELP}
      className="shrink-0 cursor-help rounded-full bg-match-soft px-3 py-1 text-sm font-medium tabular-nums text-match"
    >
      {Math.round(match.evidenceReadiness)}% evidence ready
    </span>
  );
}
