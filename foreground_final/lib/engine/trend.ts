import type { Site } from "@/lib/sites/schema";
import { plural } from "./benchmarks";
import type { BlockTrend, TrendSignal } from "./types";

export const DEFAULT_TODAY = new Date("2026-11-14");

const DAY_MS = 86_400_000;
const WINDOW_YEARS = 5;
const ESTABLISHED_YEARS = 2;
const STALE_MONTHS = 24;
const COSTAR_TENANTS = "CoStar tenant history";
const COSTAR_LISTING = "CoStar listing";

type Direction = TrendSignal["direction"];
const compare = (up: number, down: number): Direction => (up > down ? "up" : up < down ? "down" : "flat");

/**
 * Block trend: is this address getting better or worse for a food business?
 *
 * Signals (each +1 up / 0 flat / -1 down):
 *  - food openings vs closures at the address in the last 5 years (CoStar tenant history)
 *  - food tenants trading here now: up when one has lasted 2+ years, flat when all are newer, down when none
 *  - time this space has been on the market (CoStar availableOn): down over 24 months, up when not yet vacant
 *  - neighborhood fields when present: population growth (>2% up, <0 down), new housing permitted (>0 up),
 *    nearby food openings vs closures (3 years), submarket vacancy (>10% down, <5% up)
 * Score = mean of the signals (-1..1). Rating: tailwind >= 0.34, headwind <= -0.34, otherwise neutral.
 */
export function blockTrend(site: Site, today: Date = DEFAULT_TODAY): BlockTrend {
  const signals: TrendSignal[] = [];
  const food = site.tenantHistory.filter((t) => t.isFood);
  const yearsSince = (iso: string) => (today.getTime() - new Date(iso).getTime()) / DAY_MS / 365.25;
  const inWindow = (iso: string | null) => iso !== null && yearsSince(iso) >= 0 && yearsSince(iso) <= WINDOW_YEARS;

  const opened = food.filter((t) => inWindow(t.moveIn)).length;
  const left = food.filter((t) => !t.current && inWindow(t.moveOut)).length;
  signals.push({
    label: `Food openings vs closures here (${WINDOW_YEARS} years)`,
    direction: compare(opened, left),
    detail: `${opened} opened, ${left} closed or left at this address since ${today.getUTCFullYear() - WINDOW_YEARS}`,
    source: COSTAR_TENANTS,
  });

  const trading = food.filter((t) => t.current || t.moveOut === null);
  const established = trading.filter((t) => (t.years ?? (t.moveIn ? yearsSince(t.moveIn) : 0)) >= ESTABLISHED_YEARS);
  signals.push({
    label: "Food tenants trading here now",
    direction: trading.length === 0 ? "down" : established.length > 0 ? "up" : "flat",
    detail:
      trading.length === 0
        ? "No food tenant is trading at this address today"
        : `${plural(trading.length, "food tenant")} trading here, ${established.length} for ${ESTABLISHED_YEARS}+ years`,
    source: COSTAR_TENANTS,
  });

  if (site.space.availableOn) {
    const months = yearsSince(site.space.availableOn) * 12;
    const label = "Time this space has been on the market";
    if (months < 0) {
      signals.push({
        label,
        direction: "up",
        detail: `Not vacant yet; available from ${site.space.availableOn.slice(0, 10)}`,
        source: COSTAR_LISTING,
      });
    } else {
      const span = months >= STALE_MONTHS ? `${(months / 12).toFixed(1)} years` : plural(Math.round(months), "month");
      signals.push({
        label,
        direction: months > STALE_MONTHS ? "down" : "flat",
        detail: `Available for ${span} (since ${site.space.availableOn.slice(0, 10)})`,
        source: COSTAR_LISTING,
      });
    }
  }

  const n = site.neighborhood;
  const nSource = n.sources[0]?.label ?? "Neighborhood data";
  if (n.populationGrowth5yPct != null) {
    const g = n.populationGrowth5yPct;
    signals.push({
      label: "Population growth (5 years)",
      direction: g > 2 ? "up" : g < 0 ? "down" : "flat",
      detail: `${g > 0 ? "+" : ""}${g}% over 5 years`,
      source: nSource,
    });
  }
  if (n.newUnitsPermitted12mo != null) {
    signals.push({
      label: "New housing permitted nearby (12 months)",
      direction: n.newUnitsPermitted12mo > 0 ? "up" : "flat",
      detail: `${plural(n.newUnitsPermitted12mo, "new unit")} permitted`,
      source: nSource,
    });
  }
  if (n.foodOpenings3y != null && n.foodClosures3y != null) {
    signals.push({
      label: "Nearby food openings vs closures (3 years)",
      direction: compare(n.foodOpenings3y, n.foodClosures3y),
      detail: `${n.foodOpenings3y} opened, ${n.foodClosures3y} closed nearby`,
      source: nSource,
    });
  }
  if (n.submarketVacancyPct != null) {
    const v = n.submarketVacancyPct;
    signals.push({
      label: "Submarket retail vacancy",
      direction: v > 10 ? "down" : v < 5 ? "up" : "flat",
      detail: `${v}% vacant`,
      source: nSource,
    });
  }

  const points = signals.reduce((t, s) => t + (s.direction === "up" ? 1 : s.direction === "down" ? -1 : 0), 0);
  const score = points / signals.length;
  return { rating: score >= 0.34 ? "tailwind" : score <= -0.34 ? "headwind" : "neutral", score, signals };
}
