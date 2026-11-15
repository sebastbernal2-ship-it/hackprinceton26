import raw from "@/data/benchmarks.json";
import type { Site, Finding, FindingKind } from "@/lib/sites/schema";
import type { Cited, Range } from "./types";

/** Every constant the engine uses, with its source. See data/benchmarks.json. */
export const benchmarks = raw;

type Sourced = { source: { label: string; url?: string } };

/** Turn a benchmark entry into a labelled citation for the UI. */
export function cite(label: string, entry: Sourced): Cited {
  const { label: source, url } = entry.source;
  return url ? { label, source, url } : { label, source };
}

/** A low/high range with the midpoint as mid. */
export function range(low: number, high: number): Range {
  return { low, mid: (low + high) / 2, high };
}

export function scaleRange(r: Range, factor: number): Range {
  return { low: r.low * factor, mid: r.mid * factor, high: r.high * factor };
}

/**
 * Dollars for sentences (reasons, basis, assumptions, verdicts). Numeric fields are never rounded; only text is.
 *   $1M and up: two decimals of a million ("$1.95M", i.e. nearest $10k)
 *   $10k and up: nearest $1k ("$103k")
 *   $1k and up: nearest $100 ("$4,500")
 *   below: nearest $1
 */
export function usd(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const n = Math.abs(amount);
  if (n >= 999_500) return `${sign}$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${sign}$${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${sign}$${(Math.round(n / 100) * 100).toLocaleString("en-US")}`;
  return `${sign}$${Math.round(n)}`;
}

/** Yearly sales for sentences: nearest $10k ("$880k", "$1.02M"). */
export function usdSales(amount: number): string {
  return usd(Math.round(amount / 10_000) * 10_000);
}

export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** CoStar marks first-generation space as "New"; everything else (Relet) is treated as second generation. */
export type SpaceClass = "first-gen" | "former-restaurant" | "no-restaurant-history";

/**
 * What kind of space the owner would take over:
 *  - first-gen: CoStar marks the space "New" (a bare shell)
 *  - former-restaurant: a prior-use finding is present, a hood is present, or a food tenant traded in this suite
 *  - no-restaurant-history: previously leased, but nothing shows it was ever a restaurant
 * Only a former restaurant gets the cheap second-generation refresh rate and timeline.
 */
export function spaceClass(site: Site): SpaceClass {
  if (site.space.spaceType?.toLowerCase() === "new") return "first-gen";
  const present = (kind: FindingKind) => findingFor(site, kind)?.status === "present";
  const foodInSuite = site.tenantHistory.some((t) => t.isFood && t.sameSuite);
  return present("prior-use") || present("hood") || foodInSuite ? "former-restaurant" : "no-restaurant-history";
}

const STRONG_VISION = 0.7;

/**
 * The one finding to trust for a kind (or group of kinds) when sources disagree. Used for X-Ray line status,
 * reason text and findingId, for second-generation detection and for time to open.
 *
 * Order of preference:
 *  1. a decided finding (present or absent) over an unknown one;
 *  2. among decided findings, one about this suite over 3D-scan vision of a neighbouring suite
 *     (matterport.scanOfExactSuite is false): what the camera saw next door does not overrule the listing;
 *  3. a confident 3D-scan sighting (matterport-vision, present, confidence 0.7+) over listing notes;
 *  4. higher confidence; then the order in the site file.
 */
export function findingFor(site: Site, ...kinds: FindingKind[]): Finding | undefined {
  const offSuite = site.matterport !== null && !site.matterport.scanOfExactSuite;
  const rank = (f: Finding): number[] => {
    const decided = f.status !== "unknown";
    const vision = f.source === "matterport-vision" || f.source === "matterport-rooms";
    const tier = !decided ? 0 : vision && offSuite ? 1 : 2;
    const sighting = f.source === "matterport-vision" && f.status === "present" && f.confidence >= STRONG_VISION;
    return [tier, tier === 2 && sighting ? 1 : 0, f.confidence];
  };
  let best: Finding | undefined;
  for (const f of site.findings) {
    if (!kinds.includes(f.kind)) continue;
    if (!best) {
      best = f;
      continue;
    }
    const a = rank(f);
    const b = rank(best);
    const firstDiff = a.findIndex((v, i) => v !== b[i]);
    if (firstDiff !== -1 && a[firstDiff] > b[firstDiff]) best = f;
  }
  return best;
}
