// The Act checklist: one real checklist, grouped by discipline. Pure: no network, no React.
// Every item is a thing to ask for or verify. Nothing here claims a fact about the space is verified; live values are labelled as estimates or as unknown.
import type { ActItem } from "./act";
import type { Issue } from "./asset-layout";
import type { Asset } from "./assets";
import type { CostBreakdown } from "./cost-categories";
import { budgetStatus, type Range } from "./cost-side";
import type { LegalItem } from "./discipline";
import { CATEGORY_LABEL, type DefectFinding } from "./inspection";
import type { Flag } from "./structure";

export type GroupId = "financial" | "legal" | "inspection" | "layout" | "market";
export type Priority = "blocker" | "should" | "nice";
export type CheckItem = {
  id: string; group: GroupId; title: string;
  /** One line: why this matters. */
  why: string;
  /** Who to ask. */
  owner: string;
  priority: Priority;
  /** A figure from the app, labelled (estimate, unknown). Absent when the item has none. */
  live?: string;
};
export type CheckGroup = { id: GroupId; label: string; items: CheckItem[] };

export const GROUPS: { id: GroupId; label: string }[] = [
  { id: "financial", label: "Financial" },
  { id: "legal", label: "Legal and permits" },
  { id: "inspection", label: "Inspection and structural" },
  { id: "layout", label: "Layout and operations" },
  { id: "market", label: "Market and timing" },
];
export const PRIORITY_LABEL: Record<Priority, string> = { blocker: "Blocker", should: "Should do", nice: "Nice to have" };
const RANK: Record<Priority, number> = { blocker: 0, should: 1, nice: 2 };

export type ActChecklistInput = {
  concept: string;
  budget: number | null;
  /** All-in one-time range (estimated) and monthly running range; null while unpriced. */
  allIn: Range | null;
  monthly: Range | null;
  breakdown: CostBreakdown | null;
  legal: LegalItem[];
  findings: DefectFinding[];
  /** Structure screening for this building; null when no record is linked. */
  structure: { tier: string | null; flags: Flag[]; yearBuilt: number | null } | null;
  kit: Asset[];
  seats: number | null;
  /** Planner clearance and overlap problems; null when the layout was not checked. */
  issues: Issue[] | null;
  /** Items from lib/act.ts (buildChecklist for a listing, buildDiligence for a scan), folded into the groups by id. */
  reused: ActItem[];
  /** Evidence cards whose status is unknown. */
  unknownFactors: string[];
};

const usd = (n: number) => (Math.abs(n) >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`);
const span = (r: Range) => `${usd(r.low)} to ${usd(r.high)}`;
const names = (kit: Asset[]) => [...new Set(kit.map((a) => a.name))];
const hasPiece = (kit: Asset[], re: RegExp) => kit.some((a) => re.test(`${a.name} ${a.category}`.toLowerCase()));

function financial(i: ActChecklistInput): CheckItem[] {
  const out: CheckItem[] = [];
  out.push({ id: "fin:rent", group: "financial", title: "Confirm asking rent and NNN charges in writing", priority: "blocker", owner: "Landlord or broker",
    why: "Base rent, NNN, escalations and who pays for what change the monthly figure more than any other input.",
    live: i.monthly ? `Running cost estimate ${span(i.monthly)} per month (estimated)` : "Rent is unknown here, not zero" });
  const status = i.allIn && i.budget ? budgetStatus(i.allIn, i.budget) : null;
  out.push({ id: "fin:budget", group: "financial", title: "Check your budget against the all-in range", owner: "You, then your lender or partner",
    priority: status && status.tone !== "under" ? "blocker" : "should",
    why: "A budget below the high end of the range means a plan for the overrun before signing.",
    live: !i.allIn ? "All-in range not priced yet (needs placed equipment or an area)" : `Budget ${i.budget ? usd(i.budget) : "not set"} · all-in ${span(i.allIn)} (estimated)${status ? ` · ${status.tone}` : ""}` });
  const cats = (i.breakdown?.oneTime ?? []).filter((c) => c.subtotal && c.id !== "contingency" && c.id !== "permits").sort((a, b) => b.subtotal!.expected - a.subtotal!.expected).slice(0, 3);
  if (cats.length === 0) out.push({ id: "fin:bids", group: "financial", title: "Get 3 contractor bids for the biggest cost categories", priority: "should", owner: "Licensed contractors",
    why: "Bids replace estimates, but no category is priced yet to say which are biggest.", live: "No priced category yet" });
  for (const c of cats) out.push({ id: `fin:bids:${c.id}`, group: "financial", title: `Get 3 bids: ${c.label}`, priority: "should", owner: c.id === "equipment" ? "Equipment dealers" : "Licensed contractors",
    why: "One of the three largest estimated costs; three bids show whether the estimate holds.", live: `${span(c.subtotal!)} (estimated)` });
  out.push(
    { id: "fin:deposit", group: "financial", title: "Negotiate the security deposit and any personal guarantee", priority: "should", owner: "Landlord, then your lawyer", why: "A personal guarantee puts your own assets behind the lease." },
    { id: "fin:ti", group: "financial", title: "Ask for a tenant-improvement (TI) allowance", priority: "should", owner: "Landlord or broker", why: "An allowance per square foot offsets build-out cost; none is assumed in the estimate." },
    { id: "fin:free-rent", group: "financial", title: "Ask for a rent-free period during build-out", priority: "nice", owner: "Landlord or broker", why: "Build-out and permits can run months with no revenue." },
  );
  return out;
}

const LEGAL_PRIORITY: Record<string, Priority> = { zoning: "blocker", "change-of-use": "blocker", health: "blocker", grease: "should", ada: "should", fire: "should", "pre-ada": "should", signage: "nice", lease: "should" };
const LEGAL_TITLE: Record<string, string> = { zoning: "Zoning and permitted use: ask for a zoning verification letter", health: "Health permit: submit the plan review" };

function legal(i: ActChecklistInput): CheckItem[] {
  const out: CheckItem[] = i.legal.map((l) => ({ id: `legal:${l.id}`, group: "legal" as const, title: LEGAL_TITLE[l.id] ?? l.title, why: l.text, owner: l.ask, priority: LEGAL_PRIORITY[l.id] ?? "should", live: `Status in this app: ${l.status}` }));
  const lease = (id: string, title: string, why: string, priority: Priority = "should"): CheckItem => ({ id: `legal:lease-${id}`, group: "legal", title: `Lease clause: ${title}`, why, owner: "Your lawyer, then the landlord", priority });
  out.push(
    lease("use", "permitted use", "The use clause must name your concept, or the lease can bar it.", "blocker"),
    lease("exclusive", "exclusive use", "An exclusive stops the landlord leasing next door to a competing coffee or food tenant."),
    lease("assignment", "assignment and subletting", "Lets you sell the business or exit without being stuck on the lease."),
    lease("delivery", "delivery condition", "States what shape the space is handed over in (as-is, vanilla shell, hood and grease in place or not)."),
    lease("landlord-work", "landlord work", "Anything the landlord promises to build or fix should be listed with dates.", "nice"),
  );
  for (const r of i.reused.filter((x) => /^(rec:|q:link)/.test(x.id))) out.push({ id: `legal:${r.id}`, group: "legal", title: r.text.split(/[.?:]/)[0], why: r.text, owner: "Landlord or the city", priority: "should" });
  return out;
}

function inspection(i: ActChecklistInput): CheckItem[] {
  const out: CheckItem[] = [];
  const act = i.findings.filter((f) => f.severity === "high" || f.severity === "medium" || !f.canConfirmFromImagery);
  for (const f of act) out.push({ id: `insp:finding:${f.id}`, group: "inspection", title: f.title, priority: f.severity === "high" ? "blocker" : "should", owner: "Licensed inspector or contractor",
    why: `${f.verificationStep}${f.canConfirmFromImagery ? "" : " Imagery cannot confirm this."}`, live: `${CATEGORY_LABEL[f.category]} finding, ${f.severity} priority${f.status === "estimated" ? " (demo estimate)" : ""}` });
  const kit = i.kit;
  out.push(
    { id: "insp:hood", group: "inspection", title: "Hood and grease line: is there a Type I hood, duct path and interceptor?", owner: "Landlord (as-builts) and a mechanical contractor", priority: hasPiece(kit, /oven|range|fryer|griddle|grill/) ? "blocker" : "should",
      why: "Cooking gear needs a hood and fire suppression; a scan cannot show whether one exists.", live: hasPiece(kit, /oven|range|fryer|griddle|grill/) ? "Cooking gear is placed in your layout" : undefined },
    { id: "insp:electrical", group: "inspection", title: "Electrical capacity for the espresso machine and equipment", owner: "Electrician", priority: "should",
      why: "Espresso machines, ovens and refrigeration may need more service than the panel has.", live: kit.length ? `${kit.length} powered-equipment pieces placed (estimated upgrade $10k to $40k)` : undefined },
    { id: "insp:plumbing", group: "inspection", title: "Plumbing and floor drains", owner: "Plumber", priority: "should", why: "Sinks, dish machines and espresso need supply, drains and a floor drain where the layout puts them." },
    { id: "insp:hvac", group: "inspection", title: "HVAC age and capacity", owner: "HVAC contractor", priority: "should", why: "Kitchen heat and a full room need more capacity than a retail unit usually has." },
    { id: "insp:roof", group: "inspection", title: "Roof and aerial condition", owner: "Inspector or landlord roof records", priority: "should", why: "Hood and exhaust penetrate the roof, and leaks end up in the ceiling." },
  );
  const s = i.structure;
  if (!s) out.push({ id: "insp:screening", group: "inspection", title: "Seismic, flood and wind: no building record is linked", owner: "Landlord and the city", priority: "should", why: "Hazards and year built are not on file, so they are unknown, not low.", live: "Screening not available" });
  else {
    const flagged = s.flags.filter((f) => f.severity === "elevated" || f.severity === "moderate");
    for (const f of flagged) out.push({ id: `insp:flag:${f.id}`, group: "inspection", title: `${f.lens} screening flag: ${f.text}`, owner: "Structural engineer", priority: f.severity === "elevated" ? "blocker" : "should",
      why: "A screening lens on where to look first; it is not an engineering opinion.", live: `${f.severity} (screening)` });
    if (flagged.length === 0) out.push({ id: "insp:screening", group: "inspection", title: "Seismic, flood and wind screening: confirm with the landlord", owner: "Structural engineer", priority: "nice",
      why: "No lens was flagged in the screening, which is not an inspection.", live: `Screening tier ${s.tier ?? "unknown"}${s.yearBuilt ? ` · built ${s.yearBuilt}` : ""}` });
  }
  out.push({ id: "insp:climate", group: "inspection", title: "Climate exposure: ask about flood history, insurance cost and cooling load", owner: "Insurance broker and landlord", priority: "nice", why: "Climate-adjusted running cost in Quantify is a demo estimate, not a quote." });
  return out;
}

function layout(i: ActChecklistInput): CheckItem[] {
  const out: CheckItem[] = [];
  const kit = i.kit;
  out.push({ id: "lay:lead", group: "layout", title: "Equipment lead times for the pieces you placed", owner: "Equipment dealers", priority: kit.length ? "should" : "nice",
    why: "Lead times are not in this app; long ones push the opening date.", live: kit.length ? `${kit.length} pieces: ${names(kit).slice(0, 6).join(", ")}${names(kit).length > 6 ? "..." : ""}` : "Nothing placed yet" });
  const hard = i.issues?.filter((x) => x.kind === "overlap" || x.kind === "outside_floor" || x.kind === "blocked_front" || x.kind === "narrow_aisle") ?? null;
  out.push({ id: "lay:clear", group: "layout", title: "Clearances and ADA routes: resolve what the Planner flags, then measure on site", owner: "Designer, then the plan reviewer", priority: hard && hard.length ? "blocker" : "should",
    why: "Placed equipment is illustrative until clearances and the accessible route are checked on the real floor.",
    live: hard === null ? "Layout not checked yet" : hard.length ? `${hard.length} Planner issue${hard.length === 1 ? "" : "s"}: ${hard.slice(0, 2).map((x) => x.message).join("; ")}` : "No Planner issues flagged (not an ADA review)" });
  out.push({ id: "lay:occupancy", group: "layout", title: "Seats against the occupant load limit", owner: "Fire marshal and plan reviewer", priority: "blocker",
    why: "The occupant load limit is not on file here; it can cap seats below your plan.", live: i.seats ? `${i.seats} seats planned (estimated); limit unknown` : "Seat count not set; limit unknown" });
  const need: string[] = [];
  if (hasPiece(kit, /oven|range|fryer|griddle|grill|gas/)) need.push("gas");
  if (hasPiece(kit, /oven|dishwash|dish|mixer/)) need.push("possible 3-phase power");
  if (hasPiece(kit, /sink|dish|espresso|ice|coffee/)) need.push("water and drain");
  out.push({ id: "lay:utilities", group: "layout", title: "Utilities for the placed equipment: gas, 3-phase power, water", owner: "Landlord's engineer and the utility", priority: "should",
    why: "Which utilities are in place and who pays for new service is not known from a scan.", live: need.length ? `Your pieces suggest: ${need.join(", ")}` : "Nothing placed to infer needs from" });
  out.push({ id: "lay:delivery", group: "layout", title: "Delivery and loading: where do trucks and deliveries unload?", owner: "Landlord and your suppliers", priority: "nice", why: "Daily deliveries and large equipment need a door, route and time window." });
  for (const r of i.reused.filter((x) => x.id === "insp:measure" || x.id === "q:area")) out.push({ id: `lay:${r.id}`, group: "layout", title: r.id === "q:area" ? "Confirm the area you would lease" : "Measure the real floor against your layout", why: r.text, owner: r.id === "q:area" ? "Landlord or broker" : "You or a surveyor", priority: "should" });
  return out;
}

function market(i: ActChecklistInput): CheckItem[] {
  const out: CheckItem[] = [
    { id: "mkt:history", group: "market", title: "Restaurant history: why did earlier tenants leave?", owner: "Broker, neighbouring tenants, public records", priority: "should",
      why: "Tenancy history shows how long food businesses lasted here; survival odds are a caveat, not a verdict." },
    { id: "mkt:forecast", group: "market", title: "Validate the forecast assumptions", owner: "You, against your own sales test", priority: "should",
      why: "Turns, average check, margin and ramp in the break-even outlook are assumptions, not measurements.", live: i.seats ? `Outlook uses ${i.seats} seats (estimated)` : undefined },
    { id: "mkt:traffic", group: "market", title: "Visit at the lunch rush and count foot traffic and hours", owner: "You, in person", priority: "should", why: "Counts at the real hours beat any model of foot traffic." },
  ];
  for (const f of i.unknownFactors) out.push({ id: `mkt:factor:${f}`, group: "market", title: `Confirm ${f.replace(/[_-]+/g, " ")}`, owner: "Broker or public records", priority: "nice", why: "No evidence was found for this in the review." });
  for (const r of i.reused.filter((x) => x.id === "q:avail")) out.push({ id: "mkt:avail", group: "market", title: "Confirm this space is actually available", why: r.text, owner: "Landlord or broker", priority: "blocker" });
  return out;
}

/** The whole checklist: groups in fixed order, blockers first inside each group. Ids are stable so ticks persist. */
export function buildActChecklist(i: ActChecklistInput): CheckGroup[] {
  const by: Record<GroupId, CheckItem[]> = { financial: financial(i), legal: legal(i), inspection: inspection(i), layout: layout(i), market: market(i) };
  // Reused cost lines and unpriced-piece quotes join Financial.
  for (const r of i.reused.filter((x) => /^(cost:|quote:)/.test(x.id) && x.id !== "quote:buildout")) by.financial.push({ id: `fin:${r.id}`, group: "financial", title: r.text.split(/[.:]/)[0], why: r.text, owner: "Supplier or contractor", priority: "should" });
  const seen = new Set<string>();
  return GROUPS.map((g) => ({ ...g, items: by[g.id].filter((x) => !seen.has(x.id) && seen.add(x.id)).map((x, n) => ({ x, n })).sort((a, b) => RANK[a.x.priority] - RANK[b.x.priority] || a.n - b.n).map(({ x }) => x) }));
}

export type Progress = { done: number; total: number; pct: number };
export function progress(items: CheckItem[], done: ReadonlySet<string>): Progress {
  const d = items.filter((x) => done.has(x.id)).length;
  return { done: d, total: items.length, pct: items.length ? Math.round((d / items.length) * 100) : 0 };
}
export const overall = (groups: CheckGroup[], done: ReadonlySet<string>): Progress => progress(groups.flatMap((g) => g.items), done);

/** Plain text for pasting into an email or notes. */
export function checklistText(groups: CheckGroup[], done: ReadonlySet<string>, title: string): string {
  const lines = [`Act checklist: ${title}`, ""];
  for (const g of groups) {
    const p = progress(g.items, done);
    lines.push(`${g.label} (${p.done}/${p.total})`);
    for (const x of g.items) lines.push(`[${done.has(x.id) ? "x" : " "}] ${x.title} (${PRIORITY_LABEL[x.priority]}; ask: ${x.owner})${x.live ? ` - ${x.live}` : ""}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

// ---- Persistence per listing (localStorage, which can be blocked) ----
const key = (listing: string) => `foreground.act-checklist.${listing}`;
export function loadDone(listing: string): Set<string> {
  try { const v = JSON.parse(localStorage.getItem(key(listing)) ?? "[]"); return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []); } catch { return new Set(); }
}
export function saveDone(listing: string, done: ReadonlySet<string>): void {
  try { localStorage.setItem(key(listing), JSON.stringify([...done])); } catch { /* blocked: ticks last for this tab only */ }
}
