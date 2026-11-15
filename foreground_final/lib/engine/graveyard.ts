import type { Site, Tenancy } from "@/lib/sites/schema";
import { plural } from "./benchmarks";
import type { Graveyard } from "./types";

const departed = (t: Tenancy) => !t.current && t.outcome !== "current" && t.moveOut !== null;
/** closed for certain, or gone with no record of a move; a tenant CoStar says "moved" is not counted as a failure */
const closed = (t: Tenancy) => departed(t) && (t.outcome === "closed" || t.outcome === "unknown");

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Address history for food tenants (CoStar tenant history).
 * closedHere = food tenants that closed here (outcome closed, or left with no recorded move).
 * sameSuiteFailures = food tenants that have left the suite now for lease, closed or moved out: either way
 *   the suite did not hold them. The summary and flags say "left", not "failed", because CoStar's "moved"
 *   does not prove a closure.
 * medianYears = median stay of every food tenant that has left (closed or moved).
 */
export function graveyard(site: Site): Graveyard {
  const food = site.tenantHistory.filter((t) => t.isFood);
  const gone = food.filter(departed);
  const closedHere = food.filter(closed);
  const sameSuiteFailures = gone.filter((t) => t.sameSuite).length;
  const moved = gone.length - closedHere.length;
  const medianYears = median(gone.map((t) => t.years).filter((y): y is number => y !== null));

  let summary: string;
  if (food.length === 0) {
    summary = "No past food tenants on record at this address.";
  } else {
    const parts = [
      closedHere.length === 0
        ? `${plural(food.length, "food tenant")} on record here; none recorded as closed`
        : `${closedHere.length} of ${plural(food.length, "food tenant")} here closed`,
    ];
    if (moved > 0) parts.push(`${moved} more moved out`);
    if (medianYears !== null) parts.push(`those that left stayed a median ${+medianYears.toFixed(1)} years`);
    if (sameSuiteFailures > 0) parts.push(`${sameSuiteFailures} left this same suite`);
    summary = `${parts.join("; ")}.`;
  }

  return { foodTenants: food.length, closedHere: closedHere.length, sameSuiteFailures, medianYears, summary };
}
