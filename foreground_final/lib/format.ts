import type { Range } from "@/lib/engine/types";

/** $1,234 under 10k, $12k under 1M, $1.2M above. */
export function usd(n: number, opts: { exact?: boolean } = {}): string {
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  if (opts.exact || a < 10_000) return `${sign}$${Math.round(a).toLocaleString("en-US")}`;
  if (a < 1_000_000) return `${sign}$${Math.round(a / 1000).toLocaleString("en-US")}k`;
  const m = a / 1_000_000;
  return `${sign}$${m >= 10 ? m.toFixed(0) : m.toFixed(1)}M`;
}

export function usdRange(r: Pick<Range, "low" | "high">): string {
  if (Math.round(r.low) === Math.round(r.high)) return usd(r.low);
  return `${usd(r.low)} – ${usd(r.high)}`;
}

export function num(n: number, digits = 0): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function sf(n: number): string {
  return `${num(Math.round(n))} SF`;
}

export function pct(n: number, digits = 0): string {
  return `${n.toFixed(digits)}%`;
}

export function year(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const y = Number(iso.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

export function monthYear(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

const FLOORS: Record<string, string> = {
  FirstFloor: "Ground floor",
  SecondFloor: "2nd floor",
  ThirdFloor: "3rd floor",
  Basement: "Basement",
};

export function floorLabel(floor: string | null): string | null {
  if (!floor) return null;
  return FLOORS[floor] ?? floor.replace(/([a-z])([A-Z])/g, "$1 $2");
}

/** Repairs UTF-8 read as Windows-1252 (e.g. "Houstonâ€™s") in CoStar notes. */
export function fixText(s: string): string {
  if (!/[âÃ]/.test(s)) return s;
  return s
    .replace(/â€™/g, "’")
    .replace(/â€˜/g, "‘")
    .replace(/â€œ/g, "“")
    .replace(/â€\u009d|â€\x9d/g, "”")
    .replace(/â€”/g, "—")
    .replace(/â€“/g, "–")
    .replace(/â€¦/g, "…")
    .replace(/Ã©/g, "é")
    .replace(/Ã¨/g, "è")
    .replace(/Ã±/g, "ñ");
}

const SERVICE: Record<string, string> = {
  NNN: "triple net",
  FSG: "full service",
  MG: "modified gross",
  IG: "industrial gross",
};

export function serviceLabel(t: string | null): string | null {
  if (!t) return null;
  return SERVICE[t] ? `${t} (${SERVICE[t]})` : t;
}
