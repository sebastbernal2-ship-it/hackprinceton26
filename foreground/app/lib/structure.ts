export type Flag = {
  id: string; lens: string; severity: "low" | "moderate" | "elevated" | null; text: string; status: string;
  threshold?: { id: string; value: string | number; source: string; note: string };
};
export type Screening = {
  region: string | null; tier: string; tierByLens: Record<string, string>; flags: Flag[];
  inputsPresent: Record<string, boolean>; unknowns: string[]; tierRule: string; notice: string;
};
export type StructureResponse = {
  listingId: number; kit: Record<string, string | number | boolean | null>;
  hazards: { fema: { zone?: string } | null; usgs: { sdc?: string } | null; elevationFt: number | null; retrieved: string | null; subsidence: string };
  screening: Screening; fillRates: Record<string, number>; label: string;
  demo?: boolean; demoNote?: string;
};
export type ScenarioRow = {
  horizon: number; scenario: string; metric: string; low: number; value: number; high: number; unit: string;
  station: string; citation: string | null; retrieved: string | null; note: string;
};
export type ClimateMetric = {
  id: "slr" | "days" | "depth" | "wind" | "cool" | "ins"; label: string; unit: string; kind: "sourced" | "demo"; today: number | null;
  series: Record<string, Record<string, number>>; note: string;
};
export type ClimateModel = { scenarios: string[]; horizons: number[]; metrics: ClimateMetric[]; assumptions: Record<string, number>; notice: string };
export type ScenarioResponse = {
  listingId: number; region: string | null; climate?: ClimateModel;
  table: { rows: ScenarioRow[]; noSourced: { metric: string; result: string; qualitative?: string; citation?: string }[]; notice: string };
  exposure: { horizons: { horizon: number; seaLevel: { upperBoundFt: number | null; siteElevationFt: number | null; headroomFt: number | null; reading: string }; femaZoneToday: string | null; femaZoneNote: string; hvacCapacity: string; wind: string }[]; notice: string };
  label: string;
};
export type Plan = { rooms: { id: string; floor: string; label: string; polygon: [number, number][]; area_m2: number }[]; walls: { a: [number, number]; b: [number, number]; thickness: number; physical: boolean }[] };
export type Candidate = { roomId: string; label: string; areaM2: number; areaSqFtGained: number; openingDifficultyHint: string; verifyWithEngineer: string[]; sharedWalls: { sharedWallLengthM: number; wallThicknessM: number; hint: string; text: string }[] };
export type ExpansionResponse = {
  expansion: { candidates: Candidate[]; baseAreaSqFt: number; graph: { rooms: Record<string, { label: string; areaM2: number }>; edges: { a: string; b: string; sharedWallLengthM: number; wallThicknessM: number; hint: string; text: string; hintStatus: string }[] }; notice: string };
  timeline: { phases: { phase: string; label: string; monthOffset: number; monthOffsetStatus: string; capex: { low: number | null; expected: number | null; high: number | null }; capexNote: string | null; unknownCostItems: string[]; cumulativeCapexKnown: { low: number | null; expected: number | null; high: number | null }; verifyWithEngineer: string[] }[]; cumulativeStatus: string; label: string };
  label: string;
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`/api${path}`, { ...init, headers: { "content-type": "application/json" } });
  } catch {
    throw new Error("The API is unreachable.");
  }
  if (!r.ok) throw new Error(`The API answered ${r.status} for ${path}.`);
  return (await r.json()) as T;
}
export const fetchStructure = (id: number) => call<StructureResponse>(`/structure/${id}`);
export const fetchScenarios = (id: number) => call<ScenarioResponse>(`/structure/${id}/scenarios`);
export const postExpansion = (listingId: number, plan: Plan, baseRoomIds: string[]) =>
  call<ExpansionResponse>("/structure/expansion", { method: "POST", body: JSON.stringify({ listingId, plan, baseRoomIds }) });

const bundles = new Map<number, Promise<{ s: StructureResponse | null; c: ScenarioResponse | null }>>();
/**
 * One structure fetch per listing, shared across remounts (React strict mode double-runs effects) and evicted if it failed. Scenarios are only
 * requested when the structure snapshot answered, so a missing snapshot (503/404) costs one request, not four.
 */
export function loadStructure(id: number): Promise<{ s: StructureResponse | null; c: ScenarioResponse | null }> {
  let p = bundles.get(id);
  if (!p) {
    p = fetchStructure(id).then(
      async (s) => ({ s, c: await fetchScenarios(id).catch(() => null) }),
      () => ({ s: null, c: null }),
    );
    bundles.set(id, p);
    // Share only while the request is in flight or when it fully succeeded: a transient failure must not hide evidence
    // for the rest of the session, so evict it and let the next mount retry.
    p.then((r) => { if ((r.s === null || r.c === null) && bundles.get(id) === p) bundles.delete(id); });
  }
  return p;
}

export const HORIZONS = [2030, 2050, 2070] as const;

/** Distinct scenario names in the table, e.g. "NOAA High". Order of first appearance. */
export const scenarioNames = (rows: ScenarioRow[]) => [...new Set(rows.map((r) => r.scenario))];

/** The sourced rows for one horizon + scenario. Empty means "no sourced projection"; nothing is interpolated. */
export const rowsFor = (rows: ScenarioRow[], horizon: number, scenario: string) => rows.filter((r) => r.horizon === horizon && r.scenario === scenario);

const sq = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
/** ILLUSTRATIVE plan for trying the simulator. It is NOT this property's floor plan. */
export const SAMPLE_PLAN: Plan = {
  rooms: [
    { id: "a", floor: "f", label: "Dining (sample)", polygon: sq(0, 0, 5, 4), area_m2: 20 },
    { id: "b", floor: "f", label: "Suite B (sample)", polygon: sq(5, 0, 9, 4), area_m2: 16 },
    { id: "c", floor: "f", label: "Suite C (sample)", polygon: sq(0, 4, 5, 7), area_m2: 15 },
  ],
  walls: [
    { a: [5, 0], b: [5, 4], thickness: 0.3, physical: true },
    { a: [0, 4], b: [5, 4], thickness: 0.1, physical: true },
  ],
};
