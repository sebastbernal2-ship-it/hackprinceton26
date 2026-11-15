// Groups the evidence cards the API returns (one row per statistic) into one card per factor, for display.
// Only known values are kept: a factor with no value at this site is left out, never shown as zero.
import type { FactorCard, FactorStatus } from "./matches";

export type EvidenceRow = { label: string; value: string; status: FactorStatus };
export type EvidenceTable = { columns: string[]; rows: { label: string; cells: (string | null)[] }[] };
export type EvidenceGroup = {
  factorId: string;
  title: string;
  statuses: FactorStatus[];
  rows: EvidenceRow[];
  table: EvidenceTable | null;
  source: string | null;
  asOf: string | null;
  geography: string | null;
  limitations: string[];
};

const ORDER: FactorStatus[] = ["observed", "derived", "estimated"];
const num = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const title = (id: string) => id.replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase());
const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

function formatValue(value: FactorCard["value"], unit: string | null): string {
  const raw = value === null ? "" : String(value);
  const u = (unit ?? "").replace(/,? ?(Jan\.\.Dec )?JSON( array)?$/i, "").replace(/ \(JSON\)$/, "").replace(/,\s*(ahead|back) side of post mile/, "");
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return `${parsed.map((x) => (typeof x === "number" ? num.format(x) : String(x))).join(" · ")}${u ? ` ${u}` : ""}`;
    if (parsed && typeof parsed === "object") {
      const entries = Object.entries(parsed as Record<string, unknown>);
      const shown = entries.slice(-5).map(([k, v]) => `${k}: ${typeof v === "number" ? num.format(v) : String(v)}`);
      return `${entries.length > 5 ? "… " : ""}${shown.join(" · ")}`;
    }
  } catch {
    // not JSON: a plain value
  }
  const n = Number(raw);
  const v = raw !== "" && Number.isFinite(n) ? num.format(n) : raw;
  if (/^USD\/hour$/i.test(u)) return `$${v}/hr`;
  return u ? `${v} ${u}` : v;
}

const CLIMATE: Record<string, string> = {
  annual_mean_temp: "Average temperature",
  annual_precip: "Yearly rainfall",
  hot_days_per_year: "Hot days (35 °C or more)",
  freeze_days_per_year: "Freezing days",
  monthly_mean_temp: "Monthly temperature, Jan–Dec",
  monthly_precip: "Monthly rainfall, Jan–Dec",
  grid_cell_distance: "Distance to weather grid point",
};

/** A short label for one statistic, from the parts of the card that tell similar statistics apart. */
function rowLabel(c: FactorCard): string {
  const unit = c.unit ?? "";
  if (c.factorId === "climate_weather") {
    const key = (c.recordId ?? "").split(":")[1] ?? "";
    return CLIMATE[key] ?? cap(key.replace(/_/g, " ")) ?? "Value";
  }
  if (c.factorId === "traffic_access") {
    if (/meters|distance/i.test(unit)) return "Distance to count point";
    if (/by count year|JSON/i.test(unit)) return "Daily traffic by year";
    const side = unit.match(/(ahead|back) side/i)?.[1];
    return side ? `Daily traffic (${side} of count point)` : "Daily traffic";
  }
  const tail = (c.source ?? "").split(/no key:\s*/i)[1];
  if (tail) return cap(tail.replace(/\s*\((SOC|NAICS)[^)]*\)\s*$/i, ""));
  return cap(unit.replace(/\(.*\)/, "").trim()) || "Value";
}

/** Labor statistics as a job x (mean wage, median wage, jobs) table; anything else stays a row. */
function laborTable(cards: FactorCard[]): { table: EvidenceTable; rest: FactorCard[] } | null {
  const cols = ["Mean wage", "Median wage", "Jobs"];
  const jobs = new Map<string, (string | null)[]>();
  const rest: FactorCard[] = [];
  for (const c of cards) {
    const tail = ((c.source ?? "").split(/no key:\s*/i)[1] ?? "").replace(/\s*\((SOC|NAICS)[^)]*\)\s*$/i, "");
    const m = tail.match(/^(.*?)\s+(mean hourly wage|median hourly wage|employment)$/i);
    if (!m || /NAICS/i.test(c.source ?? "")) { rest.push(c); continue; }
    const col = { "mean hourly wage": 0, "median hourly wage": 1, employment: 2 }[m[2].toLowerCase() as "employment"];
    const row = jobs.get(m[1]) ?? [null, null, null];
    row[col] = formatValue(c.value, c.unit);
    jobs.set(m[1], row);
  }
  if (jobs.size === 0) return null;
  return { table: { columns: cols, rows: [...jobs].map(([label, cells]) => ({ label: cap(label), cells })) }, rest };
}

export function groupEvidence(factors: FactorCard[]): EvidenceGroup[] {
  const byFactor = new Map<string, FactorCard[]>();
  for (const f of factors) {
    if (f.status === "unknown" || f.value === null || f.value === "") continue;
    byFactor.set(f.factorId, [...(byFactor.get(f.factorId) ?? []), f]);
  }
  return [...byFactor].map(([factorId, cards]) => {
    const lab = factorId === "labor_supply" ? laborTable(cards) : null;
    const rowCards = lab ? lab.rest : cards;
    const first = cards[0];
    return {
      factorId,
      title: title(factorId),
      statuses: ORDER.filter((s) => cards.some((c) => c.status === s)),
      rows: rowCards.map((c) => {
        const label = rowLabel(c), full = formatValue(c.value, c.unit);
        // when the label already says what the unit says, show just the number
        return { label, value: full.toLowerCase().includes(label.toLowerCase()) ? formatValue(c.value, null) : full, status: c.status };
      }),
      table: lab?.table ?? null,
      source: first.source?.split(/,?\s*no key:/i)[0] ?? null,
      asOf: first.asOf,
      geography: first.geography,
      // the same caveat sentence often repeats across a factor's statistics: keep each sentence once
      limitations: [...new Set(cards.flatMap((c) => (c.limitations ?? "").split(/(?<=\.)\s+/)).map((x) => x.trim()).filter(Boolean))],
    };
  });
}
