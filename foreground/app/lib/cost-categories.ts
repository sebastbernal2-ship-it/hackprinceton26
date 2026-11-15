// Groups every cost line into categories whose subtotals add up exactly to the headline total. Pure: no network, no React.
// Dollars are whole numbers everywhere here, so the category sums can match the headline to the dollar.
// An unpriced item is listed with its reason and contributes nothing to a subtotal: it is unknown, never $0.
import { MAYBE_SHARE, type XrayLine } from "./cost-side";
import type { ClimateRunningCost } from "./climate";
import type { LayoutCost } from "./layout-cost";
import type { TotalCost } from "./total-cost";

export type Money = { low: number; expected: number; high: number };
export type ItemStatus = "observed" | "estimated" | "unpriced";
export type CategoryId = "equipment" | "install" | "repairs" | "permits" | "contingency" | "rent" | "running" | "climate";

export type CostItem = {
  id: string;
  label: string;
  quantity: number | null;
  /** What `quantity` counts, e.g. "sq ft"; empty for pieces. */
  unit: string;
  /** Price of one unit (low, high), when the item has a quantity. */
  unitLow: number | null;
  unitHigh: number | null;
  /** Counted amount; all null for an unpriced item. */
  low: number | null;
  expected: number | null;
  high: number | null;
  status: ItemStatus;
  source: string;
  /** Why it is unpriced, or how it is counted. */
  note: string;
};

export type CostCategory = {
  id: CategoryId;
  label: string;
  basis: "one_time" | "monthly";
  items: CostItem[];
  /** Sum of the priced items; null when nothing in the category is priced. */
  subtotal: Money | null;
  count: number;
  observed: number;
  estimated: number;
  unpriced: number;
  /** Share of the group's expected total, 0..1; null when there is no subtotal or no total. */
  share: number | null;
};

export type CostBreakdown = {
  oneTime: CostCategory[];
  running: CostCategory[];
  /** The headline the one-time categories add up to; null while the build-out is not priced. */
  oneTimeTotal: Money | null;
  /** Monthly running total including the climate line; `runningBase` is the same without it. */
  runningTotal: Money | null;
  runningBase: Money | null;
};

export const CATEGORY_LABEL: Record<CategoryId, string> = {
  equipment: "Equipment",
  install: "Install and fit-out",
  repairs: "Repairs and hidden systems",
  permits: "Permits and fees",
  contingency: "Contingency",
  rent: "Rent",
  running: "Running costs",
  climate: "Climate-adjusted running cost (demo estimate)",
};

const r = Math.round;
const mid = (low: number, high: number) => r((low + high) / 2);
const money = (low: number, high: number): Money => ({ low, expected: mid(low, high), high });

function priced(id: string, label: string, low: number, high: number, status: "observed" | "estimated", source: string, extra: Partial<CostItem> = {}): CostItem {
  return { id, label, quantity: null, unit: "", unitLow: null, unitHigh: null, low, expected: mid(low, high), high, status, source, note: "", ...extra };
}
function unpriced(id: string, label: string, reason: string, quantity: number | null = null, unit = ""): CostItem {
  return { id, label, quantity, unit, unitLow: null, unitHigh: null, low: null, expected: null, high: null, status: "unpriced", source: "none", note: `Unpriced: ${reason}. Left out of every total, not $0.` };
}

function category(id: CategoryId, basis: CostCategory["basis"], items: CostItem[]): CostCategory {
  const p = items.filter((i) => i.low !== null);
  const subtotal: Money | null = p.length ? { low: sum(p, "low"), expected: sum(p, "expected"), high: sum(p, "high") } : null;
  return {
    id, label: CATEGORY_LABEL[id], basis, items, subtotal, count: items.length,
    observed: items.filter((i) => i.status === "observed").length, estimated: items.filter((i) => i.status === "estimated").length, unpriced: items.filter((i) => i.status === "unpriced").length, share: null,
  };
}
const sum = (items: CostItem[], k: "low" | "expected" | "high") => items.reduce((s, i) => s + (i[k] as number), 0);

/** Adds each category's share of the group's expected total. */
function withShares(cats: CostCategory[], total: Money | null): CostCategory[] {
  return cats.map((c) => ({ ...c, share: c.subtotal && total && total.expected > 0 ? c.subtotal.expected / total.expected : null }));
}

/** Rounds parts so they add up to `total`: the largest part absorbs the difference (at most a dollar or two). */
function roundToTotal(parts: number[], total: number): number[] {
  const out = parts.map(r);
  const gap = r(total) - out.reduce((s, n) => s + n, 0);
  if (gap !== 0 && out.length) out[out.indexOf(Math.max(...out))] += gap;
  return out;
}

export type ClimateInput = { kind: "ready"; cost: ClimateRunningCost } | { kind: "unavailable"; reason: string };

export type BreakdownInput = {
  /** True when build-out is priced from placed pieces (then `lc` and `xray` apply); false uses the generic per-sq-ft part of the total cost. */
  fromLayout: boolean;
  lc: LayoutCost | null;
  nameFor: (assetId: string) => string;
  xray: XrayLine[];
  tc: TotalCost | null;
  climate: ClimateInput | null;
};

/** The all-in build-out headline: priced pieces and fit-out (P5 to P95) plus the hidden systems at their counted share. Whole dollars. */
export function allInTotal(buildout: { p5: number; p50: number; p95: number }, xray: XrayLine[]): Money {
  const hidden = xray.map((l) => ({ low: r(l.range.low * (l.id === "permits" ? 1 : MAYBE_SHARE)), high: r(l.range.high * (l.id === "permits" ? 1 : MAYBE_SHARE)) }));
  const hl = hidden.reduce((s, h) => s + h.low, 0), hh = hidden.reduce((s, h) => s + h.high, 0);
  return { low: r(buildout.p5) + hl, expected: r(buildout.p50) + mid(hl, hh), high: r(buildout.p95) + hh };
}

function oneTimeFromLayout(lc: LayoutCost, nameFor: (id: string) => string, xray: XrayLine[]): { cats: CostCategory[]; total: Money } {
  const equipment = [
    ...lc.lines.map((l) => {
      const low = r(l.low), high = r(l.high), q = l.quantity;
      return priced(l.assetId, nameFor(l.assetId), low, high, l.status, l.source, { quantity: q, unitLow: q > 0 ? r(l.low / q) : null, unitHigh: q > 0 ? r(l.high / q) : null });
    }),
    ...lc.unpriced.map((u) => unpriced(u.assetId, nameFor(u.assetId), u.reason, u.quantity)),
  ];
  const f = lc.fitout;
  const install = [f
    ? priced("fitout", "Interior fit-out", r(f.low), r(f.high), "estimated", f.source, { quantity: r(f.squareFeet), unit: "sq ft", unitLow: f.squareFeet > 0 ? r(f.low / f.squareFeet) : null, unitHigh: f.squareFeet > 0 ? r(f.high / f.squareFeet) : null })
    : unpriced("fitout", "Interior fit-out", "no floor area entered", null, "sq ft")];
  const hiddenItem = (l: XrayLine) => {
    const w = l.id === "permits" ? 1 : MAYBE_SHARE;
    return priced(l.id, l.label, r(l.range.low * w), r(l.range.high * w), "estimated", l.source, {
      quantity: 1, unitLow: l.range.low, unitHigh: l.range.high,
      note: w === 1 ? `${l.why} Counted in full.` : `${l.why} Listed ${l.range.low.toLocaleString("en-US")} to ${l.range.high.toLocaleString("en-US")} dollars, counted at ${Math.round(w * 100)}% until inspected.`,
    });
  };
  const repairs = xray.filter((l) => l.id !== "permits").map(hiddenItem);
  const permits = xray.filter((l) => l.id === "permits").map(hiddenItem);
  const base = [category("equipment", "one_time", equipment), category("install", "one_time", install), category("repairs", "one_time", repairs), category("permits", "one_time", permits)];
  const total = lc.buildout ? allInTotal(lc.buildout, xray) : null;
  if (!total) return { cats: base, total: { low: 0, expected: 0, high: 0 } };
  const rest = (k: keyof Money) => base.reduce((s, c) => s + (c.subtotal?.[k] ?? 0), 0);
  // Contingency is what the simulated P5 to P95 build-out holds beyond the itemised lows and highs: the remainder, so everything adds up.
  const spread = { low: total.low - rest("low"), expected: total.expected - rest("expected"), high: total.high - rest("high") };
  const cont = priced("spread", "Pricing spread and contingency", spread.low, spread.high, "estimated", "estimate://neutral-band-v1", {
    expected: spread.expected, note: "What the simulated P5 to P95 build-out holds beyond the itemised lines. Estimated.",
  });
  return { cats: [...base, category("contingency", "one_time", [cont])], total };
}

function oneTimeGeneric(tc: TotalCost): { cats: CostCategory[]; total: Money } | null {
  const parts = tc.parts.filter((p) => p.basis === "one_time");
  if (!tc.oneTime || parts.length === 0) return null;
  const lows = roundToTotal(parts.map((p) => p.low), tc.oneTime.low), highs = roundToTotal(parts.map((p) => p.high), tc.oneTime.high);
  const items = parts.map((p, i) => priced(p.id, `${p.label} (generic estimate: bundles equipment, install and contingency; place pieces to split it)`, lows[i], highs[i], p.status === "observed" ? "observed" : "estimated", p.source));
  const cats = (["equipment", "install", "repairs", "permits", "contingency"] as const).map((id) => category(id, "one_time", id === "install" ? items : []));
  return { cats, total: money(r(tc.oneTime.low), r(tc.oneTime.high)) };
}

function running(tc: TotalCost | null, climate: ClimateInput | null): { cats: CostCategory[]; base: Money | null; total: Money | null } {
  const parts = tc?.parts.filter((p) => p.basis === "monthly") ?? [];
  const lows = tc?.monthly ? roundToTotal(parts.map((p) => p.low), tc.monthly.low) : parts.map((p) => r(p.low));
  const highs = tc?.monthly ? roundToTotal(parts.map((p) => p.high), tc.monthly.high) : parts.map((p) => r(p.high));
  const item = (p: TotalCost["parts"][number], i: number) => priced(p.id, p.label, lows[i], highs[i], p.status === "observed" ? "observed" : "estimated", p.source);
  const rentItems = parts.flatMap((p, i) => (p.id === "rent" ? [item(p, i)] : []));
  const otherItems = parts.flatMap((p, i) => (p.id !== "rent" && p.id !== "buildout" ? [item(p, i)] : []));
  for (const e of tc?.excluded ?? []) {
    if (e.id === "rent") rentItems.push(unpriced("rent", "Rent", e.reason));
    else if (e.id !== "buildout") otherItems.push(unpriced(e.id, e.id === "operating" ? "Utilities and maintenance" : e.id, e.reason));
  }
  const cats = [category("rent", "monthly", rentItems), category("running", "monthly", otherItems)];
  const base: Money | null = tc?.monthly ? money(r(tc.monthly.low), r(tc.monthly.high)) : null;
  const climateItem = !climate ? null
    : climate.kind === "ready"
      ? (() => { const m = r(climate.cost.usdPerYear / 12); return priced("climate", `Extra cooling and flood insurance, ${climate.cost.scenario} ${climate.cost.horizon}`, m, m, "estimated", "NOAA scenario series (demo estimate)", {
          quantity: 12, unit: "months", unitLow: m, unitHigh: m, note: `${climate.cost.label}. About ${climate.cost.usdPerYear.toLocaleString("en-US")} dollars a year, shown per month.` }); })()
      : unpriced("climate", "Extra cooling and flood insurance", climate.reason);
  const climateCat = category("climate", "monthly", climateItem ? [climateItem] : []);
  const all = [...cats, climateCat];
  const total: Money | null = base ? { low: base.low + (climateCat.subtotal?.low ?? 0), expected: base.expected + (climateCat.subtotal?.expected ?? 0), high: base.high + (climateCat.subtotal?.high ?? 0) } : null;
  return { cats: all, base, total };
}

/** Everything the Costs step and the live cost panel list, grouped. Subtotals add up exactly to `oneTimeTotal` and `runningTotal`. */
export function buildCostBreakdown(inp: BreakdownInput): CostBreakdown {
  const one = inp.fromLayout ? (inp.lc ? oneTimeFromLayout(inp.lc, inp.nameFor, inp.xray) : null) : inp.tc ? oneTimeGeneric(inp.tc) : null;
  const run = running(inp.tc, inp.climate);
  const oneTimeTotal = one && (inp.fromLayout ? inp.lc?.buildout : true) ? one.total : null;
  return {
    oneTime: withShares(one?.cats ?? [], oneTimeTotal), running: withShares(run.cats, run.total),
    oneTimeTotal, runningTotal: run.total, runningBase: run.base,
  };
}

/** Subtotals of a group, summed: what the tests and the page compare with the headline. */
export const sumSubtotals = (cats: CostCategory[]): Money => ({
  low: cats.reduce((s, c) => s + (c.subtotal?.low ?? 0), 0), expected: cats.reduce((s, c) => s + (c.subtotal?.expected ?? 0), 0), high: cats.reduce((s, c) => s + (c.subtotal?.high ?? 0), 0),
});
