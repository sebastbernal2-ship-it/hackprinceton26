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
  { id: "f1", roomId: "r1", category: "ceiling_water_damage", title: "Possible ceiling stain", description: "Discoloured patch near the ceiling in the panorama (mock).", severity: "high", modelConfidence: 0.6, evidence: { source: "panorama", ref: "mock-pano-1", region: { x: 0.2, y: 0.1, w: 0.2, h: 0.1 } }, canConfirmFromImagery: false, verificationStep: "Inspect roof and plumbing above; moisture-meter the area.", costLineItemIds: ["c1"] },
  { id: "f2", roomId: null, category: "layout_inefficiency", title: "Long corridor with little usable area", description: "Floorplan geometry suggests circulation space (mock).", severity: "low", modelConfidence: 0.4, evidence: { source: "floorplan_geometry", ref: "mock-plan", region: null }, canConfirmFromImagery: true, verificationStep: "Measure usable area against the plan.", costLineItemIds: [] },
];
const LINES = [
  { itemId: "c1", label: "Ceiling repair and repaint", category: "repair", quantity: 40, unit: "sq ft", low: 800, expected: 1600, high: 3200, currency: "USD", basis: "one_time", status: "estimated", source: "mock method", asOf: "2026-01-01", rationale: "Mock: area times a neutral per-sq-ft range." },
  { itemId: "c2", label: "Electricity", category: "utility", quantity: null, unit: "", low: 300, expected: 450, high: 700, currency: "USD", basis: "monthly", status: "estimated", source: "mock method", asOf: "2026-01-01", rationale: "Mock: area times a regional rate range." },
  { itemId: "c3", label: "Commercial HVAC unit", category: "equipment", quantity: 1, unit: "unit", low: null, expected: null, high: null, currency: "USD", basis: "one_time", status: "unknown", source: "none", asOf: "2026-01-01", rationale: "No price basis found." },
];
const sum = (basis, k) => LINES.filter((l) => l.basis === basis && l.expected !== null).reduce((a, l) => a + l[k], 0);

const send = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

const readJson = (req) => new Promise((resolve) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); } });
});

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
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
