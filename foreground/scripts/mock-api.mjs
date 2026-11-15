// Tiny mock of the /api contract for frontend testing. Not the real service; data is fake test data.
// Usage: node scripts/mock-api.mjs   (PORT=8000, MOCK_EMPTY=1 to simulate "no data loaded")
import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 8000);
const empty = process.env.MOCK_EMPTY === "1";

const card = (factorId, status, value, unit) => ({
  factorId, status, value, unit,
  source: status === "unknown" ? null : "mock-source",
  recordId: status === "unknown" ? null : `mock-${factorId}`,
  asOf: status === "unknown" ? null : "2026-01-01",
  geography: status === "unknown" ? null : "MOCK area",
  limitations: status === "unknown" ? "No record found." : "Mock value for UI testing only.",
});

const MATCHES = [
  {
    listingId: 900001, address: "1 Mock Street", detail: "Suite 1", city: "Testville, TX",
    blurb: "MOCK listing for UI testing. Not real data.", photo: "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
    squareFeet: 3000, rentPerSquareFootYear: 30, tourId: "mock-tour", evidenceReadiness: 50,
    facts: { photos: [], property: [{ label: "Space Available", value: "3,000 sq ft" }], location: [{ label: "Matterport", value: "Model mock-tour" }] },
    factors: [
      card("asking_rent", "observed", 30, "USD/sf/yr"),
      card("population_density", "derived", 1200, "people/sq mi"),
      card("foot_traffic", "unknown", null, null),
    ],
  },
  {
    listingId: 900002, address: "2 Mock Avenue", detail: "", city: "Testville, TX",
    blurb: "MOCK listing with no stated rent and no photo, like the real API returns.", photo: "",
    squareFeet: 2400, rentPerSquareFootYear: null, tourId: "mock-tour-2", evidenceReadiness: 25,
    facts: { photos: [], property: [{ label: "Space Available", value: "2,400 sq ft" }], location: [] },
    factors: [card("asking_rent", "unknown", null, null)],
  },
];

// Projection mock. MOCK_PROJ=none -> empty/unknown. Fake numbers for UI testing only.
const cite = { source: "Mock Rent Survey", recordId: "https://example.test/mock-survey", asOf: "2026-01-01", geography: "MOCK area", limitations: "Fake test data." };
const base = { horizon: "12 months", scenario: "baseline", unit: "USD/sf/yr", status: "estimated", hidden: false, hiddenReason: "" };
const PROJECTIONS = [
  { ...base, kind: "published", metric: "market_rent", point: 31, lower: 28, upper: 35, method: "Published survey median with stated range (mock).", citation: cite },
  { ...base, kind: "fitted", metric: "rent_growth", unit: "percent", point: 3, lower: 1, upper: 5, method: "Mock fitted model with conformal interval.", trainingWindow: { start: "2018", end: "2025", geography: "MOCK area" },
    validation: [{ name: "coverage", value: 0.9, threshold: 0.8, passed: true }] },
  { ...base, kind: "scenario", metric: "vacancy_rate", status: "unknown", point: null, lower: null, upper: null, unit: "percent", method: "No basis to estimate (mock)." },
  // Failed validation: must be hidden by the client even though hidden:false.
  { ...base, kind: "fitted", metric: "foot_traffic_growth", point: 9, lower: 1, upper: 20, method: "Bad model (mock).", trainingWindow: { start: "2018", end: "2025", geography: "MOCK" },
    validation: [{ name: "coverage", value: 0.4, threshold: 0.8, passed: false }] },
  // Interval does not bracket the point: client must hide it.
  { ...base, kind: "scenario", metric: "broken_interval", point: 50, lower: 60, upper: 70, method: "Invalid (mock)." },
];

// P(over budget) is a logistic of rent vs budget; the interval is +/-0.1. Fake math for UI testing only.
function assess(assumptions, listingId) {
  const get = (k) => assumptions.find((a) => a.key === k)?.value;
  const budget = get("monthly_budget");
  if (budget === undefined) return { modelsAvailable: true, status: "unknown", label: "scenario analysis, not a forecast", listingId, note: "monthly_budget is required.", assumptions, projections: [] };
  const growth = get("rent_growth") ?? 0;
  const rent = 7500 * (1 + growth / 100);
  const p = 1 / (1 + Math.exp((budget - rent) / 800));
  const point = Math.round(p * 100) / 100;
  return {
    modelsAvailable: true, status: "estimated", label: "scenario analysis, not a forecast", listingId, note: "", assumptions,
    projections: [{ ...base, kind: "scenario", metric: "p_over_budget", unit: "probability", point, lower: Math.max(0, Math.round((point - 0.1) * 100) / 100), upper: Math.min(1, Math.round((point + 0.1) * 100) / 100), method: "Mock logistic of rent vs budget; not a forecast." }],
  };
}


// Inspection and cost mocks: FIXTURE data for UI testing, not from any property.
const FINDINGS = [
  { id: "f1", roomId: "r1", category: "ceiling_water_damage", title: "Possible ceiling stain", description: "Discoloured patch near the ceiling in the panorama (mock).", severity: "high", modelConfidence: 0.6, evidence: { source: "panorama", ref: "mock-pano-1", region: { x: 0.2, y: 0.1, w: 0.2, h: 0.1 } }, anchor: { x: 1.2, y: 2.2, z: -2.0 }, canConfirmFromImagery: false, verificationStep: "Inspect roof and plumbing above; moisture-meter the area.", costLineItemIds: ["c1"] },
  { id: "f2", roomId: null, category: "layout_inefficiency", title: "Long corridor with little usable area", description: "Floorplan geometry suggests circulation space (mock).", severity: "low", modelConfidence: 0.4, evidence: { source: "floorplan_geometry", ref: "mock-plan", region: null }, canConfirmFromImagery: true, verificationStep: "Measure usable area against the plan.", costLineItemIds: [] },
];
const LINES = [
  { itemId: "c1", label: "Ceiling repair and repaint", category: "repair", quantity: 40, unit: "sq ft", low: 800, expected: 1600, high: 3200, currency: "USD", basis: "one_time", status: "estimated", source: "mock method", asOf: "2026-01-01", rationale: "Mock: area times a neutral per-sq-ft range." },
  { itemId: "c2", label: "Electricity", category: "utility", quantity: null, unit: "", low: 300, expected: 450, high: 700, currency: "USD", basis: "monthly", status: "estimated", source: "mock method", asOf: "2026-01-01", rationale: "Mock: area times a regional rate range." },
  { itemId: "equip:range_6_burner", label: "6-burner gas range with oven", category: "equipment", quantity: 1, unit: "unit", low: 1299, expected: 1299, high: 1299, currency: "USD", basis: "one_time", status: "observed", source: "mock catalog link", asOf: "2026-01-01", rationale: "Mock line so the priceRef link can be exercised." },
  { itemId: "c3", label: "Commercial HVAC unit", category: "equipment", quantity: 1, unit: "unit", low: null, expected: null, high: null, currency: "USD", basis: "one_time", status: "unknown", source: "none", asOf: "2026-01-01", rationale: "No price basis found." },
];
const sum = (basis, k) => LINES.filter((l) => l.basis === basis && l.expected !== null).reduce((a, l) => a + l[k], 0);

const send = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(body));
};

const readJson = (req) => new Promise((resolve) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); } });
});


// Asset catalog mock (contract in docs). FIXTURE data for UI testing: sizes and clearances are made up, not SKUs.
const rect = (w, d) => [[0, 0], [w, 0], [w, d], [0, d]];
const mkAsset = (a) => ({
  source: "library", parentAssetId: null, variantKind: "base", dimsStatus: "catalog", dimRanges: null, allowedSizes: null,
  clearance: { front: 0.9, sides: 0.3, back: 0.05 }, clearanceBasis: "MOCK assumption: typical working aisle, not a code citation.",
  model: { uri: "", format: "box" }, imageRefs: [], profileId: null, tags: [], priceRef: null,
  provenance: { origin: "mock-api", retrievedAt: "2026-01-01", notes: "MOCK fixture for UI testing." }, status: "confirmed", ...a,
  footprint: a.footprint ?? rect(a.dims.w, a.dims.d),
});
const ASSETS = [
  mkAsset({ assetId: "mock-counter", name: "Service counter", category: "counter", dims: { w: 2.4, d: 0.7, h: 0.9 }, dimRanges: { w: [1.2, 4.8], d: [0.6, 0.9], h: [0.9, 0.9] }, tags: ["kitchen"] }),
  mkAsset({ assetId: "mock-prep", name: "Prep table (SKU sizes)", category: "prep_table", dims: { w: 1.5, d: 0.75, h: 0.9 }, allowedSizes: [{ w: 1.2, d: 0.75, h: 0.9, label: "48 in" }, { w: 1.5, d: 0.75, h: 0.9, label: "60 in" }, { w: 1.8, d: 0.75, h: 0.9, label: "72 in" }] }),
  mkAsset({ assetId: "mock-range", name: "6-burner range", category: "range", dims: { w: 0.9, d: 0.85, h: 1.1 }, priceRef: "range_6_burner", clearance: { front: 1.0, sides: 0.15, back: 0.05 }, clearanceBasis: "MOCK assumption: manufacturer-style side/back spacing, unverified.", allowedSizes: [{ w: 0.9, d: 0.85, h: 1.1, label: "36 in" }] }),
  mkAsset({ assetId: "mock-fridge", name: "Reach-in refrigerator", category: "fridge", dims: { w: 1.1, d: 0.8, h: 2.0 }, priceRef: "reach_in_refrigerator", allowedSizes: [{ w: 0.8, d: 0.8, h: 2.0, label: "1-door" }, { w: 1.1, d: 0.8, h: 2.0, label: "2-door" }] }),
  mkAsset({ assetId: "mock-sink", name: "Three-compartment sink", category: "sink", dims: { w: 2.1, d: 0.65, h: 0.95 }, priceRef: "three_compartment_sink", dimsStatus: "estimated" }),
  mkAsset({ assetId: "mock-hood", name: "Type I hood", category: "hood", dims: { w: 3.6, d: 1.2, h: 0.6 }, priceRef: "type_i_hood", dimRanges: { w: [1.8, 4.2], d: [1.2, 1.2], h: [0.6, 0.6] } }),
  mkAsset({ assetId: "mock-tandoor", name: "Tandoor (mock)", category: "range", dims: { w: 0.8, d: 0.8, h: 0.9 }, dimsStatus: "estimated" }),
  mkAsset({ assetId: "mock-kadhai", name: "Two-burner range (mock)", category: "range", dims: { w: 0.9, d: 0.7, h: 0.9 }, dimsStatus: "catalog" }),
  mkAsset({ assetId: "mock-table", name: "Dining table", category: "table", dims: { w: 1.6, d: 0.9, h: 0.75 }, dimRanges: { w: [0.8, 2.4], d: [0.6, 1.0], h: [0.75, 0.75] }, clearance: { front: 0.6, sides: 0.6, back: 0.6 }, clearanceBasis: "MOCK assumption: chair pull-back space." }),
  mkAsset({ assetId: "mock-chain-counter", name: "Chain counter (uploaded earlier)", category: "counter", source: "uploaded", profileId: "mock-chain", dims: { w: 2.0, d: 0.65, h: 0.92 }, dimsStatus: "measured", dimRanges: { w: [1.0, 3.0], d: [0.6, 0.8], h: [0.92, 0.92] } }),
];
const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));
let nextId = 1;
const slug = () => `mock-gen-${nextId++}`;

function variantOf(parent, kind, params) {
  const r = parent.dimRanges;
  const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
  let { w, d, h } = parent.dims;
  const t = parent.dims.d; // arm thickness
  let footprint;
  if (kind === "scaled") {
    w = num(params.w, w); d = num(params.d, d); h = num(params.h, h);
    if (parent.allowedSizes?.length) {
      const hit = parent.allowedSizes.find((s) => s.w === w && s.d === d && s.h === h);
      if (!hit) return { error: `Only these sizes exist: ${parent.allowedSizes.map((s) => s.label).join(", ")}.` };
    } else if (r && (w < r.w[0] || w > r.w[1] || d < r.d[0] || d > r.d[1] || h < r.h[0] || h > r.h[1])) {
      return { error: "Requested size is outside dimRanges." };
    }
    footprint = rect(w, d);
  } else if (kind === "corner_l") {
    w = clamp(num(params.w, w), r?.w ?? [w, w]); d = clamp(num(params.d, w * 0.6), [t * 2, Math.max(w, t * 2)]);
    footprint = [[0, 0], [w, 0], [w, t], [t, t], [t, d], [0, d]];
  } else if (kind === "island") {
    w = clamp(num(params.w, w), r?.w ?? [w, w]); d = clamp(num(params.d, t * 2), [t, t * 3]);
    footprint = rect(w, d);
  } else if (kind === "wall_run") {
    w = clamp(num(params.w, w * 2), r?.w ?? [w, w * 2]);
    footprint = rect(w, d);
  } else if (kind === "mirrored") {
    footprint = parent.footprint.map(([x, y]) => [w - x, y]).reverse();
  } else return { error: `Unknown kind ${kind}.` };
  return {
    asset: {
      ...parent, assetId: slug(), name: `${parent.name} (${kind})`, source: "generated", parentAssetId: parent.assetId, variantKind: kind,
      dims: { w, d, h }, dimsStatus: kind === "mirrored" ? parent.dimsStatus : "estimated", footprint, status: "draft", imageRefs: [],
      model: { uri: "", format: "box" },
      provenance: { origin: "mock-variant", retrievedAt: "2026-01-01", notes: `MOCK: ${kind} derived from ${parent.assetId}; sizes are geometry, not a manufacturer SKU.` },
    },
  };
}

const readRaw = (req) => new Promise((resolve) => { const c = []; req.on("data", (x) => c.push(x)); req.on("end", () => resolve(Buffer.concat(c).toString("latin1"))); });

async function assetRoutes(req, res, url) {
  const path = url.pathname;
  if (path === "/api/assets" && req.method === "GET") {
    const profile = url.searchParams.get("profileId");
    const cat = url.searchParams.get("category");
    const rows = ASSETS.filter((a) => !cat || a.category === cat);
    const mine = rows.filter((a) => profile && a.profileId === profile);
    return send(res, 200, [...mine, ...rows.filter((a) => !mine.includes(a) && (!a.profileId || a.profileId === profile))]);
  }
  if (path === "/api/assets" && req.method === "POST") {
    const body = await readJson(req);
    const asset = mkAsset({ ...body, assetId: body.assetId ?? slug() });
    ASSETS.push(asset);
    return send(res, 200, asset);
  }
  if (path === "/api/assets/ingest" && req.method === "POST") {
    const raw = await readRaw(req);
    const n = Math.min(3, (raw.match(/filename="/g) ?? []).length || 1);
    const profileId = raw.match(/name="profileId"\r\n\r\n([^\r]+)/)?.[1] ?? null;
    const scale = raw.match(/name="referenceScale"\r\n\r\n([^\r]+)/)?.[1];
    const sample = [["Prep counter", "counter", { w: 1.8, d: 0.7, h: 0.9 }], ["Hand sink", "sink", { w: 0.45, d: 0.4, h: 0.3 }], ["Wire shelving", "storage", { w: 1.2, d: 0.45, h: 1.8 }]];
    const proposals = sample.slice(0, n).map(([name, category, dims]) => mkAsset({
      assetId: slug(), name, category, source: "uploaded", dims, dimsStatus: "estimated", profileId, status: "draft",
      provenance: { origin: "mock-ingest", retrievedAt: "2026-01-01", notes: `FIXTURE proposal, not read from the image.${scale ? ` Reference scale given: ${scale}.` : " No reference scale given."}` },
    }));
    return send(res, 200, { proposals, mode: "fixture", notice: "Fixture mode: these proposals are canned and were NOT identified from your images. Dimensions are estimated." });
  }
  const variant = path.match(/^\/api\/assets\/([^/]+)\/variants$/);
  if (variant && req.method === "POST") {
    const parent = ASSETS.find((a) => a.assetId === variant[1]);
    if (!parent) return send(res, 404, { detail: "asset not found" });
    const { kind, params = {} } = await readJson(req);
    const out = variantOf(parent, kind, params);
    return out.error ? send(res, 422, { detail: out.error }) : send(res, 200, out.asset);
  }
  const one = path.match(/^\/api\/assets\/([^/]+)$/);
  if (one) {
    const i = ASSETS.findIndex((a) => a.assetId === one[1]);
    if (i < 0) return send(res, 404, { detail: "asset not found" });
    if (req.method === "PATCH") { ASSETS[i] = { ...ASSETS[i], ...(await readJson(req)), assetId: ASSETS[i].assetId }; }
    return send(res, 200, ASSETS[i]);
  }
  return false;
}


// ---- triage / aerial / lineage / presence / agent / finance mocks (FAKE numbers, shapes follow rt/* routers) ----
const tf = (field, status, o = {}) => ({ field, status, costarValue: null, scanValue: null, aerialValue: null, value: null, valueStatus: "unknown", scope: "unknown", confidence: "none", evidenceRefs: [], rule: "MOCK rule text.", reviewScore: 1, ...o });
const TRIAGE = [
  tf("clear_height_ft", "filled", { scanValue: 14, value: 14, valueStatus: "derived", unit: "ft", scope: "suite", confidence: "medium", reviewScore: 6, evidenceRefs: [{ source: "matterport", ref: "mock-tour/mesh", detail: "ceiling plane from mesh (mock)" }] }),
  tf("floors", "confirmed", { costarValue: 2, scanValue: 2, value: 2, valueStatus: "observed", scope: "building", confidence: "high", evidenceRefs: [{ source: "costar", ref: "numberOfFloors" }, { source: "matterport", ref: "floors" }] }),
  tf("area_sqft", "conflicting", { costarValue: 12000, scanValue: 2900, scope: "indeterminate", confidence: "low", reviewScore: 14, note: "Scan covers one suite; CoStar number is the building. Different scopes, so no verdict.", evidenceRefs: [{ source: "costar", ref: "buildingArea" }, { source: "matterport", ref: "floor area" }] }),
  tf("restroom_count", "filled", { scanValue: 2, value: 2, valueStatus: "derived", scope: "suite", confidence: "medium", reviewScore: 5, note: "Count within the scanned space only (lower bound for the building)." }),
  tf("kitchen_present", "blank-unfillable", { rule: "No matching room label is NOT zero: stays unknown.", note: "No matching room label; absence of a label is not evidence of absence.", reviewScore: 9 }),
  tf("use_hint", "conflicting", { costarValue: "office", scanValue: "retail_food", scope: "suite", confidence: "low", reviewScore: 12, note: "Scanned room labels suggest a different use bucket than CoStar's type." }),
  tf("parking_spaces", "conflicting", { costarValue: 40, aerialValue: 12, scope: "building", confidence: "low", reviewScore: 11, evidenceRefs: [{ source: "vexcel", ref: "vehicles", detail: "vehicle count, not stalls (mock)" }] }),
  tf("rooftop_units", "blank-unfillable", { reviewScore: 4 }),
  tf("loading_docks", "unverified", { costarValue: 1, value: 1, valueStatus: "observed", scope: "building", reviewScore: 3 }),
];
const AERIAL = { listingId: 900001, imagery: { source: "Vexcel ortho/extract (mock)", fetched: "2026-11-13", capture_date: null, centred_on: "CoStar lat/long" },
  vehicles: { status: "estimated", low: 8, expected: 14, high: 20, label: "vehicles visible in the crop", rationale: "Mock count; range is +/- a cross-validated MAE." },
  rooftop_units: { status: "unknown", value: null, reason: "validated count error too high to expose" }, parking_stalls: { status: "unknown", value: null, reason: "no stall-level validation set" },
  loading_docks: { status: "unknown", value: null, reason: "facade feature, not visible from above" }, roof_area_shape: { status: "unknown", value: null, reason: "no footprint in kit" },
  provenance: "MOCK. Screening estimate, not an engineering or survey assessment." };
const LINEAGE = { listingId: 900001, foodHistoryInKit: true, anonymized: true, notice: "MOCK notice: observed CoStar tenancy spells; screening prior.",
  tenants: [
    { tenant: "Tenant 1", start: "2009-03-01", end: "2012-06-30", tenureYears: 3.33, ending: "failure", expirationReason: 4, successorWasFood: true },
    { tenant: "Tenant 2", start: "2012-08-01", end: "2014-02-28", tenureYears: 1.58, ending: "other_exit", expirationReason: 1, successorWasFood: true },
    { tenant: "Tenant 3", start: "2014-04-01", end: "2019-12-31", tenureYears: 5.75, ending: "failure", expirationReason: 4, successorWasFood: false },
    { tenant: "Tenant 4", start: null, end: null, tenureYears: null, ending: "open", expirationReason: null, successorWasFood: null },
    { tenant: "Tenant 5", start: "2022-01-15", end: null, tenureYears: 4.82, ending: "open", expirationReason: null, successorWasFood: null }],
  counts: { foodTenants: 5, open: 2, ended: 3, clearFailure: 2, otherExit: 1, unknownTenure: 1 }, medianCompletedTenureYears: 3.33,
  medianTenureBasis: "tenants whose tenancy has ended (n=3); open tenancies excluded, so this is biased short", churnFlag: false, isSecondGenerationSpace: true,
  marketPrior: { label: "exploratory market prior, not a per-site prediction", nSpells: 400, failureCumulativeIncidence: { "1": null, "2": { expected: 0.12, low: 0.09, high: 0.16 }, "3": null } } };
const radius = (r, day, night) => ({ radiusMiles: r, kitBuildingsInRadius: 6, shape: day == null ? "unknown" : "day-heavy", dayShare: day,
  day: { workers: day == null ? null : 5200, status: "observed (kit-listed lower bound)", employeeFillRate: 0.41 },
  night: { status: "derived", nightPopulation: night ? { low: 1500, expected: 2000, high: 2500 } : null } });
const PRESENCE = { listingId: 900001, radii: { "0.25mi": radius(0.25, 0.72, true), "0.5mi": radius(0.5, null, false) },
  assumptions: ["Residents per apartment unit 1.5 / 2.0 / 2.5 (assumption).", "Hotel occupancy 0.5 / 0.65 / 0.8 where the kit has none (assumption).", "Kit buildings are only the Matterport list: every count is a lower bound."],
  notAFootTrafficMeasure: "Presence index of kit-listed buildings; not foot traffic and not a 24-hour clock." };

const sse = (res, events, delay = 0) => {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  let i = 0;
  const tick = () => { if (i >= events.length) return res.end(); const e = events[i++]; res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`); if (delay) setTimeout(tick, delay); else tick(); };
  tick();
};
const agentEvents = (mode) => {
  const m = { mode, provider: mode === "SCRIPTED" ? "scripted" : "mock", runId: "mock0001", syntheticFixture: true };
  const r = (id, agent, tool, summary) => ({ type: "tool_result", ...m, agent, tool, resultId: id, ok: true, summary: JSON.stringify(summary) });
  return [
    { type: "plan", ...m, items: [`${mode} plan: shortlist, inspect in parallel, re-run with a changed assumption, save a cited brief.`] },
    { type: "tool_call", ...m, agent: "planner", tool: "shortlist", args: { listingIds: [900001, 900002] } },
    r("r1", "planner", "shortlist", { pass: 1, unknown: 1 }),
    { type: "subagent_start", ...m, agent: "inspector-900001", listingId: 900001 },
    { type: "tool_call", ...m, agent: "inspector-900001", tool: "assess", args: { listingId: 900001 } },
    r("r2", "inspector-900001", "assess", { listingId: 900001, pOverBudget: 0.18, interval: [0.1, 0.27] }),
    { type: "finding", ...m, kind: "unknown", listingId: 900001, text: "kitchen presence cannot be determined from the scan (unknown, not zero)", cites: ["r2"] },
    { type: "subagent_finish", ...m, agent: "inspector-900001", listingId: 900001, verdict: { listingId: 900001, verdict: "workable", headline: "P(over budget) 0.18", cites: ["r2"], verified: true } },
    { type: "action", ...m, action: "rerun_plan", args: { profileChange: { budget: 300000 } }, resultId: "r3", ok: true, summary: JSON.stringify({ pass: 2, label: "scenario analysis, not a forecast" }) },
    { type: "final", ...m, brief: { runId: "mock0001", mode, goal: "MOCK goal", label: "scenario analysis, not a forecast", recommendation: "Verify listing 900001 first (workable); a screening ranking, not a fit score.",
      claims: [{ text: "Listing 900001 has P(over budget) 0.18.", cites: ["r2"] }, { text: "After raising the budget, 2 sites pass.", cites: ["r3"] }, { text: "A 99 percent claim with no source.", cites: ["r1"] }],
      rejectedClaims: [], verdicts: [{ listingId: 900001, verdict: "workable", headline: "x", topRisk: "kitchen unknown", cites: ["r2"], verified: true }],
      unknowns: [{ listingId: 900001, unknowns: ["kitchen presence cannot be determined (unknown, not zero)"], cites: ["r2"] }], note: "MOCK trace, fake values." } },
  ];
};
function financeSim(listingId) {
  const rent = MATCHES.find((m) => m.listingId === listingId)?.rentPerSquareFootYear;
  if (!rent) return { status: "blocked", label: "scenario analysis, not a forecast", unknownInputs: ["rent_monthly"], note: "Required inputs are unknown; nothing was assumed as zero." };
  const cash = Array.from({ length: 36 }, (_, i) => Math.round(-60000 + i * 4200 - (i < 6 ? i * 3000 : 0)));
  const out = { status: "simulated", label: "scenario analysis, not a forecast", seed: 0, nDraws: 10000, months: 36, runId: "mockrun1", notice: "Scenario analysis, not a forecast (MOCK numbers). Ledger records are SIMULATED in a LOCAL SANDBOX.",
    loan: { name: "sba", principal: 120000, monthlyPayment: 1400 }, pCashShortfall: 0.34, runwayMonths: { pNoShortfall: 0.66, p5: 5, p50: 9, p95: 16 },
    breakEven: { definition: "first month operating cash flow after debt service >= 0", pReached: 0.81, monthDist: { p5: 4, p50: 9, p95: 21 }, histogram: Object.fromEntries(Array.from({ length: 36 }, (_, k) => [String(k + 1), Math.round(900 * Math.exp(-((k - 8) ** 2) / 40))])) },
    dscr: { definition: "year-2 EBITDA / annual debt service", p5: 0.7, p50: 1.4, p95: 2.3, "pBelow1.25": 0.41, "pBelow1.0": 0.22 },
    minCash: { p5: -80000, p50: -52000, p95: -10000 }, endCash: { p5: -40000, p50: 90000, p95: 210000 }, monthly: { cash }, assumptions: {}, limits: ["Taxes, depreciation and owner draws not modelled.", "Build-out covers equipment + install allowance only; repairs unknown, excluded (not zero)."],
    ledger: { backend: "local-sandbox", tag: "SIMULATED", counts: { deposits: 900 } } };
  if (process.env.MOCK_BANDS === "1") out.monthlyBands = { cash: { p10: cash.map((c, i) => c - 15000 - i * 1500), p50: cash, p90: cash.map((c, i) => c + 15000 + i * 2500) } };
  return out;
}
const ledgerRows = (table) => Array.from({ length: 12 }, (_, i) => table === "deposits"
  ? { _id: `local-d-${i}`, transaction_date: `2027-01-${String(i + 2).padStart(2, "0")}`, amount: 1000 + i * 37, description: "SIMULATED: daily sales", simulated: true }
  : { _id: `local-p-${i}`, purchase_date: `2027-01-${String(i + 2).padStart(2, "0")}`, amount: 300 + i * 11, description: `SIMULATED: ${table} ${i}`, simulated: true });

function layerRoutes(req, res, url) {
  const p = url.pathname;
  let m;
  if (req.method === "GET" && (m = p.match(/^\/api\/triage\/property\/(\d+)$/))) return m[1] === "900001" ? send(res, 200, { notice: "MOCK screening triage.", listingId: m[1], hasScan: true, hasAerial: true, scope: "suite", fields: TRIAGE }) : send(res, 404, { detail: "no triage result for this listing" });
  if (req.method === "GET" && p === "/api/triage/queue") return send(res, 200, { notice: "MOCK queue. Screening triage.", total: 3, items: TRIAGE.filter((f) => f.status === "conflicting").map((f) => ({ listingId: "900001", field: f.field, status: f.status, score: f.reviewScore, scope: f.scope, confidence: f.confidence, costarValue: f.costarValue, scanValue: f.scanValue, aerialValue: f.aerialValue, note: f.note ?? f.rule })) });
  if (req.method === "GET" && (m = p.match(/^\/api\/aerial\/(\d+)$/))) return m[1] === "900001" ? send(res, 200, AERIAL) : send(res, 404, { detail: "no aerial analysis for this listing (unknown, not zero)" });
  if (req.method === "GET" && (m = p.match(/^\/api\/lineage\/(\d+)$/))) return m[1] === "900001" ? send(res, 200, LINEAGE) : send(res, 200, { listingId: Number(m[1]), foodHistoryInKit: false, tenants: [], note: "No food-service tenancy recorded in the CoStar kit for this building. Unknown, not proof of no restaurant history.", notice: "MOCK" });
  if (req.method === "GET" && (m = p.match(/^\/api\/presence\/(\d+)$/))) return m[1] === "900001" ? send(res, 200, PRESENCE) : send(res, 404, { detail: "listing not found or no coordinates" });
  if (req.method === "GET" && p === "/api/agent/replay") return sse(res, [{ type: "replay_info", mode: "REPLAY", source: "SYNTHETIC-fixture", note: "Recorded trace replayed; not a live run." }, ...agentEvents("SCRIPTED").map((e) => ({ ...e, mode: "REPLAY", recordedMode: "SCRIPTED" }))], Number(url.searchParams.get("delay") ?? 0) * 1000);
  if (req.method === "POST" && p === "/api/agent/run") return readJson(req).then(() => process.env.MOCK_AGENT === "error" ? sse(res, [{ type: "error", mode: "NONE", message: "CoStar data unavailable (COSTAR_NORMALIZED_DIR); use GET /api/agent/replay" }]) : sse(res, agentEvents("SCRIPTED"), 150));
  if (req.method === "POST" && p === "/api/finance/simulate") return readJson(req).then((b) => send(res, 200, financeSim(b.listingId)));
  if (req.method === "GET" && (m = p.match(/^\/api\/finance\/ledger\/(\w+)$/))) { const t = url.searchParams.get("table") ?? "deposits"; return send(res, 200, { runId: m[1], backend: "local-sandbox", table: t, total: 900, notice: "SIMULATED", records: ledgerRows(t) }); }
  return false;
}

// ---- Reskin / agent / structure mocks (rt/reskin, rt/agent, rt/structure contracts). FAKE data for UI testing only. ----
const CONCEPTS = [
  { id: "coffee_bakery", name: "Cafe (coffee and bakery reference)", equipmentCount: 7, status: "assumption" },
  { id: "italian", name: "Italian restaurant", equipmentCount: 7, status: "assumption" },
  { id: "indian", name: "Indian restaurant", equipmentCount: 9, status: "assumption" },
  { id: "japanese", name: "Japanese izakaya", equipmentCount: 8, status: "assumption" },
  { id: "mexican", name: "Mexican taqueria", equipmentCount: 8, status: "assumption" },
];
const mkLine = (id, label, status, lo, ex, hi) => ({ itemId: `reskin:${id}`, label, category: "equipment", quantity: 1, unit: "each", currency: "USD", basis: "one_time", asOf: "2026-01-01", low: lo, expected: ex, high: hi, status, source: status === "unknown" ? "none" : "mock catalog", rationale: status === "unknown" ? "No sourced price for this asset; unknown, not zero (mock)." : "Mock priced line." });
const PAL = { wall: "#D99A1E", floor: "#7A3B2E", ceiling: "#4E1F26", accent: "#1F6F6B" };
function reskinMock(to) {
  const t = CONCEPTS.find((c) => c.id === to)?.name ?? to;
  const fromPal = { wall: { name: "soft cream tile", hex: "#F3E7D3" }, floor: { name: "warm terrazzo", hex: "#D2C3A8" }, ceiling: { name: "bright white", hex: "#F8F6F0" }, accent: { name: "cherry red", hex: "#C83B48" } };
  const toPal = { wall: { name: "saffron paint (mock)", hex: PAL.wall }, floor: { name: "encaustic-look tile (mock)", hex: PAL.floor }, ceiling: { name: "deep maroon (mock)", hex: PAL.ceiling }, accent: { name: "teal accent (mock)", hex: PAL.accent } };
  return {
    fromConcept: "coffee_bakery", toConcept: to, seats: null, seatsAssumed: true, syntheticSource: true,
    layoutNote: "The listing's real layout is not known. A reference layout was generated from the fromConcept profile (assumptions) and then reskinned. MOCK.",
    removed: [{ assetId: "mock-espresso-machine", name: "Espresso machine (mock reference)", dimsStatus: "estimated", x: 0.2, y: 0.2 }, { assetId: "mock-pastry-case", name: "Pastry case (mock reference)", dimsStatus: "estimated", x: 1.8, y: 0.2 }],
    added: [{ assetId: "mock-target-display", name: `${t} display (mock)`, dimsStatus: "estimated", x: 0.2, y: 0.2, placement: "took the footprint vacated by removed equipment" }, { assetId: "mock-target-counter", name: "Service counter (mock)", dimsStatus: "catalog", x: 1.8, y: 0.2, placement: "free space" }],
    unplaced: [], keptCount: 2,
    placements: [{ assetId: "mock-tandoor", x: 0.2, y: 0.2, rot: 0 }, { assetId: "mock-kadhai", x: 1.8, y: 0.2, rot: 0 }, { assetId: "mock-range", x: 4.0, y: 0.2, rot: 0 }, { assetId: "mock-prep", x: 1.0, y: 2.6, rot: 0 }, { assetId: "mock-table", x: 3.0, y: 3.2, rot: 90 }, { assetId: "unknown-size-item", x: 4.6, y: 3.0, rot: 0 }],
    adjacency: [{ a: "mock-tandoor", b: "mock-kadhai", maxGapM: 3.0, why: "mock", status: "assumption", basis: "analyst workflow assumption, not a code requirement", result: "satisfied", gapM: 0.49 }],
    costDelta: { lines: [mkLine("add:display", `Add: ${t} display (mock)`, "unknown", null, null, null), mkLine("add:counter", "Add: service counter (mock)", "unknown", null, null, null), mkLine("rm:display", "Remove: pastry case proxy (mock)", "unknown", null, null, null), mkLine("finish", "Change finishes (mock)", "estimated", 3000, 5500, 9000)], totals: { low: 3000, expected: 5500, high: 9000 }, totalsStatus: "estimated (mock priced lines only)", excludedLineIds: ["reskin:add:display", "reskin:add:counter", "reskin:rm:display"] },
    feasibility: [{ id: "load:cold", topic: "cold storage", status: "verify with operator and inspector", from: "Display freezer and back-stock needs are unconfirmed.", to: "Confirm selected product, refrigeration loads, freezer capacity, and heat rejection.", basis: "operator intake is incomplete (mock)", labelledAs: "unknown" }, { id: "load:electrical", topic: "electrical", status: "verify with engineer", from: "", to: "Confirm panel capacity against selected equipment nameplates.", basis: "equipment specifications not selected (mock)", labelledAs: "unknown" }],
    materials: { from: fromPal, to: toPal, glbPalette: PAL, decor: ["carved screens", "brass lamps"], signage: "dual wordmark (assumption)", note: "Visual restyle spec (mock)." },
    notice: "MOCK. Scenario analysis, not a forecast or a quote. Unknown prices stay unknown and are excluded from totals (not zero).",
  };
}
const STRUCT = {
  kit: { yearBuilt: 1960, renovatedYear: null, material: null, buildingClass: null, stories: 1, grossSqFt: 4000, heightFt: null, hasSprinklers: null },
  hazards: { fema: { zone: "AE" }, usgs: { sdc: "B" }, elevationFt: 47, retrieved: "2026-01-01", subsidence: "unknown: no reachable public subsidence layer found" },
  screening: {
    region: "HOU", tier: "elevated", tierByLens: { seismic: "low", flood: "elevated", geotechnical: "moderate" },
    flags: [
      { id: "fema_zone", lens: "flood", severity: "elevated", text: "FEMA flood zone AE (mock)", status: "observed", threshold: { id: "flood_sfha", value: "A*/V*", source: "observed-source", note: "FEMA zone prefix A or V = Special Flood Hazard Area" } },
      { id: "usgs_sdc", lens: "seismic", severity: "low", text: "Seismic Design Category B (mock)", status: "observed" },
      { id: "hou_era", lens: "flood_wind", severity: null, text: "Construction material unknown; era check not evaluated", status: "unknown" },
    ],
    inputsPresent: { yearBuilt: true, material: false }, unknowns: ["material", "buildingClass"],
    tierRule: "tier = highest severity among evaluated flags; unknown flags never lower it",
    notice: "Screening prior from public kit fields and hazard layers; NOT an engineering assessment. Verify with a licensed structural engineer. Unknown inputs stay unknown. (mock)",
  },
  fillRates: {}, label: "screening prior, not an engineering assessment",
};
const sr = (h, scenario, lo, v, hi) => ({ horizon: h, scenario, metric: "relative sea level rise vs 2000 (cm)", low: lo, value: v, high: hi, unit: "cm", station: "Mock gauge (nearest coastal reference)", citation: "https://example.test/mock-noaa", retrieved: "2026-01-01", note: "MOCK values; low/high = published confidence interval" });
const SCEN = {
  region: "HOU",
  table: { rows: [sr(2030, "NOAA Intermediate", 10, 14, 19), sr(2050, "NOAA Intermediate", 22, 30, 41), sr(2070, "NOAA Intermediate", 38, 52, 70), sr(2030, "NOAA High", 12, 17, 23), sr(2050, "NOAA High", 30, 46, 64)],
    noSourced: [{ metric: "annual mean daily max temperature change (Houston)", result: "no sourced projection", qualitative: "qualitative only in state summary", citation: "https://example.test/mock-summary" }, { metric: "design wind speed change", result: "no sourced projection" }, { metric: "extreme rainfall / pluvial flood depth", result: "no sourced projection" }],
    notice: "Scenario analysis, not a forecast. 'no sourced projection' means nothing citable was retrieved. (mock)" },
  exposure: { horizons: [2030, 2050, 2070].map((h) => ({ horizon: h, seaLevel: { upperBoundFt: h === 2070 ? 2.3 : 0.7, siteElevationFt: 47, headroomFt: h === 2070 ? 44.7 : 46.3, reading: "static rise alone does not reach site elevation; says nothing about rainfall/surge flooding" }, femaZoneToday: "AE", femaZoneNote: "Zone is today's map; no sourced projection of future flood zones", heat: "no sourced projection", hvacCapacity: "unknown (not in kit)", wind: "no sourced projection" })), notice: "Scenario analysis, not a forecast." },
  label: "scenario analysis, not a forecast",
};
const EXPANSION = {
  expansion: { baseRoomIds: ["a"], candidates: [
    { roomId: "b", label: "Suite B (sample)", areaM2: 16, areaSqFtGained: 172.2, sharedWalls: [{ sharedWallLengthM: 4, wallThicknessM: 0.3, hint: "thick", text: "thick wall: treat as possibly load-bearing" }], openingDifficultyHint: "possible structural wall: engineer review before opening", verifyWithEngineer: ["Is the shared wall load-bearing?", "Header or beam needed for an opening?"] },
    { roomId: "c", label: "Suite C (sample)", areaM2: 15, areaSqFtGained: 161.5, sharedWalls: [{ sharedWallLengthM: 5, wallThicknessM: 0.1, hint: "thin", text: "thin partition: may be non-structural" }], openingDifficultyHint: "thin partition; still confirm before demolition", verifyWithEngineer: ["Confirm the wall is non-structural."] }],
    baseAreaSqFt: 215.3,
    graph: { rooms: { a: { label: "Dining (sample)", areaM2: 20 }, b: { label: "Suite B (sample)", areaM2: 16 }, c: { label: "Suite C (sample)", areaM2: 15 } }, edges: [{ a: "a", b: "b", sharedWallLengthM: 4, wallThicknessM: 0.3, hint: "thick", text: "thick", hintStatus: "estimated (thickness hint only)" }, { a: "a", b: "c", sharedWallLengthM: 5, wallThicknessM: 0.1, hint: "thin", text: "thin", hintStatus: "estimated (thickness hint only)" }] },
    notice: "Scenario analysis, not a forecast. Wall thickness is a hint, not a structural determination. (mock)" },
  timeline: { phases: [
    { phase: "open", label: "Open (core kitchen)", monthOffset: 0, monthOffsetStatus: "assumption (adjustable)", capex: { low: 44645, expected: 53417, high: 75347 }, capexNote: null, unknownCostItems: [], cumulativeCapexKnown: { low: 44645, expected: 53417, high: 75347 }, verifyWithEngineer: [] },
    { phase: "expand1", label: "Expand into Suite C", monthOffset: 12, monthOffsetStatus: "assumption (adjustable)", capex: { low: 12000, expected: 18000, high: 27000 }, capexNote: null, unknownCostItems: ["hood extension"], cumulativeCapexKnown: { low: 56645, expected: 71417, high: 102347 }, verifyWithEngineer: [] },
    { phase: "expand2", label: "Expand into Suite B", monthOffset: 24, monthOffsetStatus: "assumption (adjustable)", capex: { low: null, expected: null, high: null }, capexNote: "no sourced price", unknownCostItems: ["structural opening"], cumulativeCapexKnown: { low: 56645, expected: 71417, high: 102347 }, verifyWithEngineer: [] }],
    cumulativeStatus: "partial: unknown cost items excluded, not zero", label: "scenario analysis, not a forecast", notice: "Scenario analysis, not a forecast." },
  label: "scenario analysis, not a forecast",
};
const sseHead = { "content-type": "text/event-stream", "cache-control": "no-cache" };
const AGENT_EVENTS = (mode, goal) => [
  { type: "plan", mode, items: ["MOCK: check the change against the space", "list what to verify"] },
  { type: "tool_call", mode, agent: "planner", tool: "property_facts", args: {} },
  { type: "tool_result", mode, agent: "planner", tool: "property_facts", ok: true, summary: "{}" },
  { type: "final", mode, brief: { note: `MOCK brief for: ${String(goal).slice(0, 60)}` } },
];
async function sseSlow(res, events) {
  res.writeHead(200, sseHead);
  for (const e of events) { res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`); await new Promise((r) => setTimeout(r, 120)); }
  res.end();
}
async function extraRoutes(req, res, url) {
  const p = url.pathname;
  if (req.method === "GET" && p === "/api/concepts") return send(res, 200, CONCEPTS), true;
  if (req.method === "POST" && p === "/api/reskin") {
    const b = await readJson(req);
    if (!CONCEPTS.some((c) => c.id === b.toConcept)) return send(res, 404, { detail: `concept '${b.toConcept}' not found` }), true;
    return send(res, 200, reskinMock(b.toConcept)), true;
  }
  if (req.method === "POST" && p === "/api/agent/run") {
    const b = await readJson(req);
    if (process.env.MOCK_AGENT === "none") return await sseSlow(res, [{ type: "error", mode: "NONE", message: "CoStar data unavailable (mock)" }]), true;
    return await sseSlow(res, AGENT_EVENTS("SCRIPTED", b.goal)), true;
  }
  if (req.method === "GET" && p === "/api/agent/replay") {
    if (process.env.MOCK_AGENT === "dead") return send(res, 500, { detail: "down" }), true;
    return await sseSlow(res, [{ type: "replay_info", mode: "REPLAY", source: "SYNTHETIC-fixture" }, ...AGENT_EVENTS("REPLAY", "")]), true;
  }
  const st = p.match(/^\/api\/structure\/(\d+)$/);
  if (req.method === "GET" && st) return process.env.MOCK_STRUCTURE === "none" ? send(res, 404, { detail: "structure snapshot unavailable" }) : send(res, 200, { listingId: Number(st[1]), ...STRUCT }), true;
  const sc = p.match(/^\/api\/structure\/(\d+)\/scenarios$/);
  if (req.method === "GET" && sc) return process.env.MOCK_STRUCTURE === "none" ? send(res, 404, { detail: "structure snapshot unavailable" }) : send(res, 200, { listingId: Number(sc[1]), ...SCEN }), true;
  if (req.method === "POST" && p === "/api/structure/expansion") { await readJson(req); return send(res, 200, EXPANSION), true; }
  return false;
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (/^\/api\/(triage|aerial|lineage|presence|agent|finance)/.test(url.pathname)) { const h = layerRoutes(req, res, url); if (h !== false) return; }
  if (url.pathname.startsWith("/api/concepts") || url.pathname.startsWith("/api/reskin") || url.pathname.startsWith("/api/agent") || url.pathname.startsWith("/api/structure")) { if (await extraRoutes(req, res, url)) return; }
  if (url.pathname.startsWith("/api/assets")) { const handled = await assetRoutes(req, res, url); if (handled !== false) return; }
  if (req.method === "GET" && url.pathname === "/api/health") return send(res, 200, { ok: true, mock: true });
  if (req.method === "POST" && url.pathname === "/api/matches") {
    await readJson(req);
    return send(res, 200, empty ? { matches: [], dataAvailable: false } : { matches: MATCHES, dataAvailable: true });
  }
  const property = url.pathname.match(/^\/api\/property\/(\d+)$/);
  if (req.method === "GET" && property) {
    const found = MATCHES.find((m) => String(m.listingId) === property[1]);
    return found ? send(res, 200, found) : send(res, 404, { detail: "not found" });
  }
  const proj = url.pathname.match(/^\/api\/property\/(\d+)\/projections$/);
  if (req.method === "GET" && proj) {
    const none = process.env.MOCK_PROJ === "none";
    return send(res, 200, { listingId: Number(proj[1]), modelsAvailable: !none, projections: none ? [] : PROJECTIONS, note: none ? "Models are not available." : "" });
  }
  const insp = url.pathname.match(/^\/api\/property\/(\d+)\/inspection$/);
  if (req.method === "GET" && insp) {
    if (process.env.MOCK_INSPECTION === "none") return send(res, 200, { findings: [], mode: "none", notice: "No panorama was available." });
    return send(res, 200, { findings: FINDINGS, mode: "fixture", notice: "Fixture findings for UI testing." });
  }
  const cost = url.pathname.match(/^\/api\/property\/(\d+)\/costs$/);
  if (req.method === "GET" && cost) {
    return send(res, 200, { lines: LINES, totals: { oneTime: { low: sum("one_time", "low"), expected: sum("one_time", "expected"), high: sum("one_time", "high") }, monthly: { low: sum("monthly", "low"), expected: sum("monthly", "expected"), high: sum("monthly", "high") } }, notice: "Fixture estimates for UI testing." });
  }
  if (req.method === "POST" && url.pathname === "/api/assess") {
    const { listingId = null, assumptions = [] } = await readJson(req);
    return send(res, 200, assess(assumptions, listingId));
  }
  if (req.method === "POST" && url.pathname === "/api/next-question") {
    const { history = [] } = await readJson(req);
    return send(res, 200, { question: history.length >= 2 ? null : "Which city?", stub: true });
  }
  if (req.method === "POST" && url.pathname === "/api/tour-agent") {
    const { placedCount = 0 } = await readJson(req);
    return send(res, 200, {
      reply: "Placed a table (mock).",
      action: placedCount > 9 ? { type: "none", note: "mock" } : { type: "add", kind: "table", label: "Dining table" },
      stub: true,
    });
  }
  send(res, 404, { detail: "not found" });
}).listen(port, "127.0.0.1", () => console.log(`mock api on http://127.0.0.1:${port}${empty ? " (empty)" : ""}`));
