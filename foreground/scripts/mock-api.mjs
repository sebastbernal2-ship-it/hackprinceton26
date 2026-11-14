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
