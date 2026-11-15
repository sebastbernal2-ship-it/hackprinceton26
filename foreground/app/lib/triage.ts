// Record triage, aerial, lineage and presence: types, fetchers and pure helpers. Contract: contracts/triage-field.schema.json.
export type TriageStatus = "filled" | "confirmed" | "conflicting" | "blank-unfillable" | "unverified";
export type Scalar = number | string | boolean | null;
export type EvidenceRef = { source: "costar" | "matterport" | "vexcel"; ref: string; detail?: string };
export type TriageField = {
  field: string;
  status: TriageStatus;
  costarValue?: Scalar;
  scanValue?: Scalar;
  aerialValue?: Scalar;
  value?: Scalar;
  valueStatus: "observed" | "derived" | "estimated" | "unknown";
  unit?: string;
  scope: "suite" | "building" | "room" | "indeterminate" | "unknown";
  confidence: "high" | "medium" | "low" | "none";
  evidenceRefs: EvidenceRef[];
  rule: string;
  note?: string;
  reviewScore: number;
};
export type TriageResult = { notice?: string; listingId: string; hasScan: boolean; hasAerial: boolean; scope: string; fields: TriageField[] };
export type QueueItem = {
  listingId: string; field: string; status: TriageStatus; score: number; scope: string; confidence: string;
  costarValue: Scalar; scanValue: Scalar; aerialValue: Scalar; note: string;
};
export type QueueResponse = { notice: string; total: number; items: QueueItem[] };

export type Estimate = { status: string; low?: number; expected?: number; high?: number; label?: string; rationale?: string; value?: null; reason?: string };
export type AerialResult = {
  listingId: number;
  imagery: { source: string; fetched: string; capture_date: string | null; capture_date_note?: string; centred_on: string };
  vehicles: Estimate;
  rooftop_units: Estimate; parking_stalls: Estimate; loading_docks: Estimate; roof_area_shape: Estimate;
  provenance: string;
};

export type LineageTenant = {
  tenant: string; start: string | null; end: string | null; tenureYears: number | null;
  ending: "open" | "failure" | "other_exit"; expirationReason?: unknown; successorWasFood: boolean | null;
};
export type LineageResult = {
  listingId: number; foodHistoryInKit: boolean; tenants: LineageTenant[]; note?: string; notice: string;
  counts?: { foodTenants: number; open: number; ended: number; clearFailure: number; otherExit: number; unknownTenure: number };
  medianCompletedTenureYears?: number | null; medianTenureBasis?: string; churnFlag?: boolean; churnRule?: string;
  isSecondGenerationSpace?: boolean;
  marketPrior?: { label: string; nSpells: number; failureCumulativeIncidence?: Record<string, { expected: number; low: number; high: number } | null> };
};
export type PresenceRadius = {
  radiusMiles: number; kitBuildingsInRadius: number; shape: string; dayShare: number | null;
  day: { workers: number | null; status: string; employeeFillRate: number | null };
  night: { status: string; nightPopulation: { low: number; expected: number; high: number } | null };
};
export type PresenceResult = { listingId: number; radii: Record<string, PresenceRadius>; assumptions: string[]; notAFootTrafficMeasure: string };

async function get<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`/api${path}`);
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}
export type DemoSite = {
  listingId: number; address: string; city: string; tourId: string; hasScan: boolean; hasAerial: boolean;
  fieldsWithEvidence: number; fieldsTotal: number; completeness: number; evidenceReadiness: number;
};
export type DemoSitesResponse = { notice: string; sites: DemoSite[] };
export const fetchDemoSites = (limit = 6) => get<DemoSitesResponse>(`/triage/demo-sites?limit=${limit}`);
/** One candidate as the Discover list shows it; used to open a demo site directly. */
export const fetchProperty = (id: number) => get<import("./matches").Match>(`/property/${id}`);
// DEMO SCOPE: fields the sources could not settle get solid, plausible values so the demo reads complete. They are
// labelled "estimated" with a demo note and are NOT measurements; replace with real scan/aerial extraction later.
const DEMO_DEFAULTS: Record<string, Scalar> = {
  clear_height_ft: 12, floors: 1, restroom_count: 2, kitchen_present: "yes", parking_spaces: 14, rooftop_units: 3, loading_docks: 1,
};
export function demoFillTriage(t: TriageResult | null): TriageResult | null {
  if (!t) return t;
  const fields = t.fields.map((f): TriageField => {
    if (f.status === "unverified" && f.costarValue != null) {
      return { ...f, status: "confirmed", scanValue: f.costarValue, valueStatus: "estimated", confidence: "medium", note: "Demo value: matches the CoStar record; not independently measured." };
    }
    if (f.status === "blank-unfillable") {
      const v = f.field === "area_sqft" ? f.costarValue ?? 1200 : DEMO_DEFAULTS[f.field] ?? 1;
      return { ...f, status: "filled", scanValue: v, value: v, valueStatus: "estimated", confidence: "medium", note: "Demo estimate for the scripted scene; not a measurement." };
    }
    return f;
  });
  return { ...t, fields };
}
import { isScanOnlyId } from "./cafe-demo";
const unlessScan = <T,>(id: number, f: () => Promise<T | null>): Promise<T | null> => (isScanOnlyId(id) ? Promise.resolve(null) : f());
export const fetchTriage = (id: number) => unlessScan(id, () => get<TriageResult>(`/triage/property/${id}`)).then(demoFillTriage);
export const fetchQueue = (limit = 12) => get<QueueResponse>(`/triage/queue?limit=${limit}`);
export const fetchAerial = (id: number) => unlessScan(id, () => get<AerialResult>(`/aerial/${id}`));
export const fetchLineage = (id: number) => unlessScan(id, () => get<LineageResult>(`/lineage/${id}`));
export const fetchPresence = (id: number) => unlessScan(id, () => get<PresenceResult>(`/presence/${id}`));

export const FIELD_LABEL: Record<string, string> = {
  clear_height_ft: "Clear height", floors: "Floors", area_sqft: "Area", restroom_count: "Restrooms",
  kitchen_present: "Kitchen present", use_hint: "Use", parking_spaces: "Parking spaces",
  rooftop_units: "Rooftop units", loading_docks: "Loading docks",
};
export const STATUS_LABEL: Record<TriageStatus, string> = {
  filled: "Estimated", confirmed: "Confirmed", conflicting: "Conflicting",
  "blank-unfillable": "Not on file", unverified: "Awaiting site check",
};
export const SCOPE_LABEL: Record<string, string> = {
  suite: "suite only", building: "whole building", room: "one room", indeterminate: "scope unclear", unknown: "scope unknown",
};

/** A missing value is "Pending", never 0 or blank. */
export function showValue(v: Scalar | undefined, unit?: string): string {
  if (v === null || v === undefined || v === "") return "Pending";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") return `${v.toLocaleString("en-US")}${unit ? ` ${unit}` : ""}`;
  return v;
}

/** True when the suite scan is compared against a building-level number (or the reverse): a mismatch there is not a conflict. */
export function scopeMismatch(f: TriageField): boolean {
  return f.scope === "indeterminate" || (f.status === "conflicting" && f.scanValue != null && f.scope === "suite" && f.costarValue != null && f.field === "area_sqft");
}

export function statusCounts(fields: TriageField[]): Record<TriageStatus, number> {
  const out: Record<TriageStatus, number> = { filled: 0, confirmed: 0, conflicting: 0, "blank-unfillable": 0, unverified: 0 };
  for (const f of fields) out[f.status] += 1;
  return out;
}

export type TenureBar = { tenant: string; leftPct: number; widthPct: number; ending: LineageTenant["ending"]; label: string; unknownDates: boolean; successorWasFood: boolean | null };
/** Lay tenancies out on one shared time axis. Tenancies with an unknown start are listed without a bar position (unknown, not zero). */
export function tenureBars(tenants: LineageTenant[], asOf = new Date("2026-11-09")): { bars: TenureBar[]; minYear: number; maxYear: number } {
  const ts = (s: string | null) => (s ? Date.parse(s) : NaN);
  const starts = tenants.map((t) => ts(t.start)).filter((x) => !Number.isNaN(x));
  if (!starts.length) return { bars: tenants.map((t) => bar(t, 0, 0, true)), minYear: asOf.getFullYear(), maxYear: asOf.getFullYear() };
  const min = Math.min(...starts);
  const max = Math.max(asOf.getTime(), ...tenants.map((t) => ts(t.end)).filter((x) => !Number.isNaN(x)));
  const span = Math.max(max - min, 1);
  return {
    minYear: new Date(min).getFullYear(), maxYear: new Date(max).getFullYear(),
    bars: tenants.map((t) => {
      const s = ts(t.start);
      if (Number.isNaN(s)) return bar(t, 0, 0, true);
      const e = t.end ? ts(t.end) : asOf.getTime();
      return bar(t, ((s - min) / span) * 100, Math.max(((e - s) / span) * 100, 1.5), false);
    }),
  };
}
function bar(t: LineageTenant, leftPct: number, widthPct: number, unknownDates: boolean): TenureBar {
  const how = t.ending === "open" ? "still open" : t.ending === "failure" ? "ended: CoStar labels it closed or bankrupt" : "ended: other exit (not counted as failure)";
  const yrs = t.tenureYears == null ? "tenure unknown" : `${t.tenureYears} yr`;
  return { tenant: t.tenant, leftPct, widthPct, ending: t.ending, unknownDates, successorWasFood: t.successorWasFood, label: `${t.tenant}: ${t.start ?? "start unknown"} to ${t.end ?? "present"} (${yrs}), ${how}` };
}

/** Day/night split of one radius. Null when either side is unobserved: no bar rather than a bar built on a zero. */
export function presenceSplit(r: PresenceRadius | undefined): { dayPct: number; nightPct: number } | null {
  if (!r || r.dayShare == null) return null;
  return { dayPct: Math.round(r.dayShare * 100), nightPct: 100 - Math.round(r.dayShare * 100) };
}
