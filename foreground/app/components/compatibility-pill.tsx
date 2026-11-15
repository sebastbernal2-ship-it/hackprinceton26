import { compatibility, COMPAT_HELP } from "../lib/alignment";
import type { Match } from "../lib/matches";

export default function CompatibilityPill({ match }: { match: Pick<Match, "alignment" | "evidenceReadiness" | "demo"> }) {
  if (match.demo) return <span className="shrink-0 rounded-full border border-dashed border-foreground/30 px-3 py-1 text-sm font-medium text-foreground/60">Demo data</span>;
  const score = compatibility(match);
  if (score === null) return null;
  return (
    <span title={COMPAT_HELP} className="shrink-0 cursor-help rounded-full bg-match-soft px-3 py-1 text-sm font-medium tabular-nums text-match">
      {score}% compatible
    </span>
  );
}
