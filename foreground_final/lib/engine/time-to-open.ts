import type { Site } from "@/lib/sites/schema";
import { benchmarks, findingFor, range, scaleRange, spaceClass } from "./benchmarks";
import type { Occupancy, TimeToOpen } from "./types";

/**
 * Months from lease to opening, and the rent paid before the first sale.
 *   former restaurant with an existing hood: 3-6 months
 *   former restaurant, hood missing or unconfirmed: 4-9 months (Foreground estimate)
 *   first-generation shell, or a space with no sign of a past restaurant: 6-12 months
 * Dead rent = monthly occupancy (midpoint) x months.
 */
export function timeToOpen(site: Site, occupancy: Occupancy): TimeToOpen {
  const T = benchmarks.timeToOpenMonths;
  const cls = spaceClass(site);
  const hasHood = findingFor(site, "hood")?.status === "present";
  const [entry, what] =
    cls === "first-gen"
      ? [T.shell, "First-generation shell"]
      : cls === "no-restaurant-history"
        ? [T.shell, "No sign of a past restaurant here, so a full kitchen build"]
        : hasHood
          ? [T.secondGenWithHood, "Second-generation space with an existing hood"]
          : [T.secondGen, "Second-generation space, hood missing or not confirmed"];

  const months = range(entry.low, entry.high);
  return {
    months,
    deadRentUsd: scaleRange(months, occupancy.annualUsd.mid / 12),
    basis: `${what}: ${entry.low}-${entry.high} months to open (${entry.source.label}); dead rent is monthly occupancy times months.`,
  };
}
