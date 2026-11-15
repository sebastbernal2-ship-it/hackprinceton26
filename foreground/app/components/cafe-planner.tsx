"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AssetGenerator from "./asset-generator";
import { checkLayout, frontZone, type Placement, type Rot } from "../lib/asset-layout";
import { assetImageUrl, GENERATED_PROFILE, listAssets, type Asset } from "../lib/assets";
import { buildCafeKit, cafeKitArea, CAFE_KIT_NOTE, dedupeAssets } from "../lib/cafe-demo";
import { conceptFootprint, SQFT_TO_M2 } from "../lib/concept-layout";
import { fetchLayoutCost, freshResponse, layoutCostItems, scenarioKey, type LayoutCost } from "../lib/layout-cost";
import type { Match } from "../lib/matches";
import PlannerFill from "./planner-fill";
import {
  autoLayout, buildVisitors, DOOR_WIDTH, doorX, findSpot, isSeating, newId, reconcile, rotated, sameKit, seatsOf, sizeFor, snapPosition,
  toPlacements, visitorAt, type PlacedPiece, type Pt,
} from "../lib/planner";

const CAFE_IDS = new Set([
  "espresso_machine_2group", "coffee_grinder_on_demand", "drip_brewer_station", "bakery_display_case_48", "bakery_work_table_72",
  "convection_oven_full", "bake_rack_speed_rack", "fridge_reachin_2door", "sink_hand_17", "sink_three_comp_84", "display_gelato_49",
  "pie_display_case_36", "bar_counter_run_120", "counter_prep_72", "host_stand", "table_2top_30", "table_4top_30x48", "table_hightop_30",
  "communal_table_96", "chair_dining", "bar_stool", "counter_stool", "booth_60", "banquette_90",
]);
const FILTERS = [
  { key: "cafe", label: "Cafe kit", test: (a: Asset) => CAFE_IDS.has(a.assetId) },
  { key: "dining", label: "Dining", test: (a: Asset) => a.category === "table" || a.category === "seating" },
  { key: "kitchen", label: "Kitchen", test: (a: Asset) => a.category !== "table" && a.category !== "seating" },
  { key: "generated", label: "Generated", test: (a: Asset) => a.source === "generated" },
  { key: "all", label: "All", test: () => true },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const range = (lo: number, hi: number) => `${usd.format(lo)} to ${usd.format(hi)}`;
const VISITOR_COLORS = ["#d9512c", "#5f6d4e", "#b08d57", "#6d7f8f", "#8a5a6b"];

type Drag =
  | { kind: "move"; id: string; x: number; y: number }
  | { kind: "tray"; asset: Asset; rot: Rot; cx: number; cy: number; over: Pt | null; moved: boolean };

type Props = {
  match: Match;
  /** Pieces for Quantify (the same state the Layout tab edits). */
  kit: Asset[];
  onKit: (items: Asset[]) => void;
  /** Where each piece sits on this planner's floor, owned by the parent so it survives tab changes. */
  placed: PlacedPiece[];
  onPlaced: (next: PlacedPiece[]) => void;
  area: string;
  onArea: (v: string) => void;
  onContinue: () => void;
};

const categoryStyle = (a: Asset) =>
  a.category === "table" ? "fill-[#efe6d2] stroke-[#a08a63]"
    : a.category === "seating" ? "fill-[#e2d6c0] stroke-[#a08a63]"
      : "fill-match-soft stroke-match";

function frontEdge(rot: Rot, b: Placement["box"]): [Pt, Pt] {
  return rot === 0 ? [[b.x0, b.y1], [b.x1, b.y1]] : rot === 90 ? [[b.x0, b.y0], [b.x0, b.y1]] : rot === 180 ? [[b.x1, b.y0], [b.x0, b.y0]] : [[b.x1, b.y0], [b.x1, b.y1]];
}

export default function CafePlanner({ match, kit, onKit, placed, onPlaced, area, onArea, onContinue }: Props) {
  const sqft = Number(area) || 0;
  const floor = useMemo(() => conceptFootprint(sqft), [sqft]);
  const svgRef = useRef<SVGSVGElement>(null);
  const [catalog, setCatalog] = useState<{ status: "loading" | "ok" | "error"; assets: Asset[] }>({ status: "loading", assets: [] });
  const [prices, setPrices] = useState<Record<string, { low: number; high: number }>>({});
  const [filter, setFilter] = useState<FilterKey>("cafe");
  const [sel, setSel] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [history, setHistory] = useState<PlacedPiece[][]>([]);
  const [zones, setZones] = useState(true);
  const [people, setPeople] = useState(false);
  const [note, setNote] = useState("");
  const [cost, setCost] = useState<{ key: string; data: LayoutCost } | null>(null);
  const [costError, setCostError] = useState(false);
  const placedRef = useRef(placed);
  useEffect(() => { placedRef.current = placed; }, [placed]);
  const dragRef = useRef<Drag | null>(null);
  const historyRef = useRef(history);
  const floorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { historyRef.current = history; }, [history]);

  // Catalog and per-piece price bands (estimated demo prices from the cost service).
  const [reloadCatalog, setReloadCatalog] = useState(0);
  useEffect(() => {
    let live = true;
    listAssets({ profileId: GENERATED_PROFILE })
      .then(async (list) => {
        const assets = [...dedupeAssets(list).values()];
        if (!live) return;
        setCatalog({ status: "ok", assets });
        const ids = [...new Set(assets.map((a) => a.priceRef ?? a.assetId))];
        const cost = await fetchLayoutCost(ids.map((assetId) => ({ assetId, quantity: 1 })), null, null).catch(() => null);
        if (live && cost) setPrices(Object.fromEntries(cost.lines.map((l) => [l.assetId, { low: l.low, high: l.high }])));
      })
      .catch(() => live && setCatalog({ status: "error", assets: [] }));
    return () => { live = false; };
  }, [reloadCatalog]);

  // A demo scan has no listed area: start from the reference kit's estimated area so the floor exists.
  useEffect(() => {
    if (!Number(area)) onArea(cafeKitArea(match.tourId) || String(match.squareFeet > 0 ? Math.min(match.squareFeet, 1200) : 1000));
  }, [match.tourId, match.squareFeet, area, onArea]);

  // Keep the placed pieces in step with the shared kit (the Layout tab and Quantify edit the same list).
  useEffect(() => {
    if (floor && !sameKit(placed.map((p) => p.asset), kit)) onPlaced(reconcile(floor, placed, kit));
  }, [kit, floor, placed, onPlaced]);

  const commit = useCallback((next: PlacedPiece[]) => {
    setHistory([...historyRef.current.slice(-49), placedRef.current]);
    historyRef.current = [...historyRef.current.slice(-49), placedRef.current];
    onPlaced(next);
    onKit(next.map((p) => p.asset));
  }, [onPlaced, onKit]);

  const undo = useCallback(() => {
    const prev = historyRef.current[historyRef.current.length - 1];
    if (!prev) return;
    setHistory(historyRef.current.slice(0, -1));
    onPlaced(prev);
    onKit(prev.map((p) => p.asset));
    setSel(null);
  }, [onPlaced, onKit]);

  const toFloor = useCallback((cx: number, cy: number): Pt | null => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const pt = new DOMPoint(cx, cy).matrixTransform(m.inverse());
    return [pt.x, pt.y];
  }, []);

  function track(onMove: (e: PointerEvent) => void, onUp: (e: PointerEvent) => void) {
    const move = (e: PointerEvent) => onMove(e);
    const up = (e: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      onUp(e);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  function startMove(e: React.PointerEvent, piece: PlacedPiece) {
    if (!floor || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setSel(piece.id);
    floorRef.current?.focus();
    const start = toFloor(e.clientX, e.clientY);
    if (!start) return;
    const off: Pt = [start[0] - piece.x, start[1] - piece.y];
    const others = toPlacements(placedRef.current.filter((p) => p.id !== piece.id));
    let last: Pt = [piece.x, piece.y];
    let moved = false;
    track((ev) => {
      const pt = toFloor(ev.clientX, ev.clientY);
      if (!pt) return;
      const cur = placedRef.current.find((p) => p.id === piece.id) ?? piece;
      const [x, y] = snapPosition(floor, cur.asset, cur.rot, pt[0] - off[0], pt[1] - off[1], others);
      if (!moved && Math.hypot(pt[0] - start[0], pt[1] - start[1]) < 0.05) return;
      moved = true;
      last = [x, y];
      const d: Drag = { kind: "move", id: piece.id, x, y };
      dragRef.current = d;
      setDrag(d);
    }, () => {
      dragRef.current = null;
      setDrag(null);
      if (moved) commit(placedRef.current.map((p) => (p.id === piece.id ? { ...p, x: last[0], y: last[1] } : p)));
    });
  }

  function startTray(e: React.PointerEvent, asset: Asset) {
    if (!floor || e.button !== 0) return;
    const sx = e.clientX;
    const sy = e.clientY;
    let rot: Rot = 0;
    let moved = false;
    const state = (cx: number, cy: number): Extract<Drag, { kind: "tray" }> => {
      const svg = svgRef.current;
      const r = svg?.getBoundingClientRect();
      const inside = !!r && cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
      const pt = inside ? toFloor(cx, cy) : null;
      let over: Pt | null = null;
      if (pt) {
        const { w, d } = sizeFor(asset, rot);
        over = snapPosition(floor, asset, rot, pt[0] - w / 2, pt[1] - d / 2, toPlacements(placedRef.current));
      }
      return { kind: "tray", asset, rot, cx, cy, over, moved };
    };
    const keys = (ev: KeyboardEvent) => {
      if (ev.key.toLowerCase() === "r") { rot = ((rot + 90) % 360) as Rot; const d = dragRef.current; if (d?.kind === "tray") { const n = state(d.cx, d.cy); dragRef.current = n; setDrag(n); } }
    };
    window.addEventListener("keydown", keys);
    track((ev) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      moved = true;
      const d = state(ev.clientX, ev.clientY);
      dragRef.current = d;
      setDrag(d);
    }, (ev) => {
      window.removeEventListener("keydown", keys);
      const final = moved ? state(ev.clientX, ev.clientY) : null;
      dragRef.current = null;
      setDrag(null);
      if (!moved) { addAt(asset, null); return; }
      if (final?.over) addAt(asset, { x: final.over[0], y: final.over[1], rot });
    });
  }

  function addAt(asset: Asset, at: { x: number; y: number; rot: Rot } | null) {
    if (!floor) return;
    const spot = at ?? findSpot(floor, placedRef.current, asset);
    if (!spot) { setNote(`No free spot left for ${asset.name} on this floor. Enlarge the area or remove something.`); return; }
    setNote("");
    const piece: PlacedPiece = { id: newId(asset), asset, rot: spot.rot, x: spot.x, y: spot.y };
    commit([...placedRef.current, piece]);
    setSel(piece.id);
  }

  const remove = (id: string) => { commit(placedRef.current.filter((p) => p.id !== id)); setSel(null); };
  const rotate = (id: string) => commit(placedRef.current.map((p) => (p.id === id ? rotated(p) : p)));
  const nudge = (id: string, dx: number, dy: number) => commit(placedRef.current.map((p) => (p.id === id ? { ...p, x: p.x + dx, y: p.y + dy } : p)));

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); undo(); return; }
    if (k === "escape") { setSel(null); return; }
    if (!sel) return;
    if (k === "r") { e.preventDefault(); rotate(sel); }
    else if (k === "delete" || k === "backspace") { e.preventDefault(); remove(sel); }
    else if (k.startsWith("arrow")) {
      e.preventDefault();
      nudge(sel, k === "arrowleft" ? -0.1 : k === "arrowright" ? 0.1 : 0, k === "arrowup" ? -0.1 : k === "arrowdown" ? 0.1 : 0);
    }
  }

  async function loadKit() {
    setNote("");
    try {
      const { kit: ref, missing } = buildCafeKit(match.tourId, await listAssets());
      const a = Number(area) || Number(cafeKitArea(match.tourId)) || 1000;
      if (!Number(area)) onArea(String(a));
      const fp = conceptFootprint(a);
      if (!fp) return;
      commit(autoLayout(fp, ref));
      setSel(null);
      if (missing.length) setNote(`Cafe reference kit is incomplete: missing ${missing.join(", ")}.`);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Could not load the cafe reference kit.");
    }
  }

  // ---- derived -------------------------------------------------------------------------------------------------
  const live: PlacedPiece[] = useMemo(() => placed.map((p) => (drag?.kind === "move" && drag.id === p.id ? { ...p, x: drag.x, y: drag.y } : p)), [placed, drag]);
  const preview = useMemo<PlacedPiece | null>(() => {
    if (drag?.kind !== "tray" || !drag.over) return null;
    return { id: "__preview", asset: drag.asset, rot: drag.rot, x: drag.over[0], y: drag.over[1] };
  }, [drag]);
  const placements = useMemo(() => toPlacements(preview ? [...live, preview] : live), [live, preview]);
  const allIssues = useMemo(() => (floor ? checkLayout(floor, placements) : []), [floor, placements]);
  const issues = useMemo(() => allIssues.filter((i) => !i.keys.includes("__preview")), [allIssues]);
  const bad = useMemo(() => {
    const hard = new Set<string>();
    const soft = new Set<string>();
    for (const i of allIssues) for (const k of i.keys) (i.kind === "overlap" || i.kind === "outside_floor" ? hard : soft).add(k);
    return { hard, soft };
  }, [allIssues]);
  const seats = placed.reduce((n, p) => n + seatsOf(p.asset), 0);
  const useAreaPct = floor ? Math.round((placed.reduce((s, p) => { const z = sizeFor(p.asset, p.rot); return s + z.w * z.d; }, 0) / (floor.width * floor.depth)) * 100) : 0;
  const items = useMemo(() => layoutCostItems(kit), [kit]);
  const key = scenarioKey(items, sqft || null, null);
  useEffect(() => {
    if (!items.length) return;
    let live = true;
    const t = setTimeout(() => {
      fetchLayoutCost(items, sqft || null, null).then(
        (data) => { if (live) { setCost({ key, data }); setCostError(false); } },
        () => live && setCostError(true),
      );
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [items, sqft, key]);
  const fresh = items.length ? freshResponse(cost, key) : null;
  const selected = placed.find((p) => p.id === sel) ?? null;

  // ---- visitors ------------------------------------------------------------------------------------------------
  const visitors = useMemo(() => (floor && people ? buildVisitors(floor, placed) : []), [floor, placed, people]);
  const personRefs = useRef<(SVGGElement | null)[]>([]);
  useEffect(() => {
    if (!visitors.length) return;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const frame = (now: number) => {
      const t = still ? 30 : now / 1000;
      visitors.forEach((v, i) => {
        const el = personRefs.current[i];
        if (!el) return;
        const s = visitorAt(v, t);
        const bob = s.moving ? Math.sin(t * 9 + i) * 0.025 : 0;
        el.setAttribute("transform", `translate(${s.p[0].toFixed(3)} ${(s.p[1] + bob).toFixed(3)})`);
        el.setAttribute("opacity", s.hidden ? "0" : "1");
        el.dataset.moving = s.moving ? "1" : "0";
        const body = el.firstElementChild?.nextElementSibling as SVGElement | null;
        body?.setAttribute("transform", `rotate(${((s.heading * 180) / Math.PI + 90).toFixed(0)})`);
      });
      if (!still) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [visitors]);

  const cafeOrder = [...CAFE_IDS];
  const rank = (a: Asset) => { const i = cafeOrder.indexOf(a.assetId); return i < 0 ? 999 : i; };
  const shown = catalog.assets.filter(FILTERS.find((f) => f.key === filter)!.test).sort((a, b) => rank(a) - rank(b));
  const priceOf = (a: Asset) => prices[a.priceRef ?? a.assetId];
  const widthFt = floor ? floor.width * 3.28084 : 0;
  const depthFt = floor ? floor.depth * 3.28084 : 0;

  return (
    <section className="mt-8 border-t border-foreground/10 pt-6" aria-labelledby="planner-title" data-testid="planner">
      <p className="text-xs text-foreground/50">Step 4 · Cafe planner</p>
      <h2 id="planner-title" className="text-lg font-medium tracking-tight">Place the shop, see it fill up</h2>
      <p role="note" className="mt-2 max-w-3xl text-sm text-foreground/70">
        A top-down sketch on an assumed rectangle, not the scanned walls. Drag pieces from the tray onto the floor; they snap to a 10 cm grid, walls and each other&apos;s edges.
        Prices are estimated demo bands. Fit, code and utilities are not checked.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <button type="button" onClick={() => void loadKit()} className="rounded-full bg-foreground px-4 py-1.5 text-background" data-testid="planner-load-kit">Load cafe reference kit</button>
        <button type="button" onClick={undo} disabled={!history.length} className="rounded-full border border-foreground/25 px-3 py-1.5 disabled:opacity-40" data-testid="planner-undo">Undo</button>
        <button type="button" onClick={() => commit([])} disabled={!placed.length} className="rounded-full border border-foreground/25 px-3 py-1.5 disabled:opacity-40">Clear</button>
        <label className="ml-2 flex items-center gap-1.5"><input type="checkbox" checked={zones} onChange={(e) => setZones(e.target.checked)} /> Clearance zones</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={people} onChange={(e) => setPeople(e.target.checked)} data-testid="planner-people" /> Visitors (illustrative)</label>
        <label className="ml-auto flex items-center gap-1.5 text-foreground/70">Floor (sq ft, assumed)
          <input type="number" min={1} value={area} onChange={(e) => onArea(e.target.value)} className="w-24 rounded-lg border border-foreground/20 bg-background px-2 py-1 tabular-nums" data-testid="planner-area" />
        </label>
      </div>
      <p className="mt-1 text-xs text-foreground/55" data-testid="planner-kit-note">
        {CAFE_KIT_NOTE}{match.squareFeet > 0 ? ` This listing shows ${Math.round(match.squareFeet).toLocaleString("en-US")} sq ft; the planner uses the cafe bay size you set.` : ""}
      </p>
      {note && <p role="status" className="mt-2 text-sm text-accent">{note}</p>}

      {!floor ? (
        <p className="mt-4 text-sm text-foreground/60">Cannot say: no area on file. Enter the area to plan for above.</p>
      ) : (
        <div className="mt-4 grid gap-5 lg:grid-cols-[15rem_1fr]">
          <aside aria-label="Catalog tray" className="rounded-xl border border-foreground/15 bg-panel p-3">
            <div className="flex flex-wrap gap-1" role="tablist">
              {FILTERS.map((f) => (
                <button key={f.key} type="button" onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}
                  className={`rounded-full px-2.5 py-1 text-xs ${filter === f.key ? "bg-foreground text-background" : "border border-foreground/20"}`}>{f.label}</button>
              ))}
            </div>
            <div className="mt-2"><AssetGenerator compact onCreated={() => { setFilter("generated"); setReloadCatalog((n) => n + 1); }} /></div>
            <p className="mt-2 text-xs text-foreground/55">Drag onto the floor (R rotates while dragging), or click to drop in the first free spot.</p>
            {catalog.status === "loading" && <p className="mt-3 text-sm text-foreground/60">Loading catalog.</p>}
            {catalog.status === "error" && <p role="alert" className="mt-3 text-sm">The asset catalog is unreachable (the local API is not running).</p>}
            <ul className="mt-2 grid max-h-[34rem] grid-cols-2 gap-2 overflow-y-auto pr-1 lg:grid-cols-1">
              {shown.map((a) => {
                const pr = priceOf(a);
                return (
                  <li key={a.assetId}>
                    <button type="button" onPointerDown={(e) => startTray(e, a)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); addAt(a, null); } }}
                      data-testid={`tile-${a.assetId}`} aria-label={`Add ${a.name}`}
                      className="flex w-full cursor-grab touch-none select-none items-center gap-2 rounded-lg border border-foreground/15 bg-background p-2 text-left transition-colors hover:border-foreground/40 active:cursor-grabbing">
                      <Glyph asset={a} />
                      <span className="min-w-0 text-xs leading-snug">
                        <span className="block truncate font-medium" title={a.name}>{a.name}</span>
                        <span className="block text-foreground/55">{a.dims.w.toFixed(2)} x {a.dims.d.toFixed(2)} m</span>
                        <span className="block tabular-nums text-foreground/70">{pr ? `${range(pr.low, pr.high)} est.` : "No price"}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <div ref={floorRef} className="min-w-0 outline-none" tabIndex={0} onKeyDown={onKeyDown} aria-label="Planner floor" data-testid="planner-floor">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl border border-foreground/15 bg-background px-4 py-3 text-sm sm:grid-cols-5" data-testid="planner-stats">
              <Stat label="Pieces" value={String(placed.length)} id="pieces" />
              <Stat label="Seats (est.)" value={String(seats)} id="seats" />
              <Stat label="Equipment, est." value={!items.length ? "$0" : fresh?.equipment ? range(fresh.equipment.low, fresh.equipment.high) : costError ? "Unavailable" : "..."} id="cost" />
              <Stat label="Floor used" value={`${useAreaPct}%`} id="used" />
              <Stat label="Problems" value={String(issues.length)} id="problems" warn={issues.length > 0} />
            </dl>
            {fresh && fresh.unpriced.length > 0 && <p className="mt-1 text-xs text-foreground/55">{fresh.unpriced.reduce((n, u) => n + u.quantity, 0)} placed pieces have no catalog price and are left out of the total, not counted as $0.</p>}

            <div className="mt-3 overflow-hidden rounded-xl border border-foreground/15 bg-panel">
              <svg ref={svgRef} viewBox={`-0.9 -0.9 ${floor.width + 1.8} ${floor.depth + 2.1}`} className="block w-full touch-none select-none" data-testid="planner-svg"
                role="group" aria-label={`Cafe floor, ${floor.width.toFixed(1)} by ${floor.depth.toFixed(1)} meters, ${placed.length} pieces`}
                onPointerDown={() => setSel(null)}>
                <defs>
                  <pattern id="pl-grid" width={1} height={1} patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" stroke="currentColor" strokeWidth={0.015} opacity={0.12} /></pattern>
                </defs>
                <rect x={0} y={0} width={floor.width} height={floor.depth} fill="var(--background)" />
                <rect x={0} y={0} width={floor.width} height={floor.depth} fill="url(#pl-grid)" />
                <rect x={0} y={0} width={floor.width} height={floor.depth} fill="none" stroke="currentColor" strokeWidth={0.14} opacity={0.75} />
                {/* door: a gap in the front wall with its swing */}
                <line x1={doorX(floor) - DOOR_WIDTH / 2} x2={doorX(floor) + DOOR_WIDTH / 2} y1={floor.depth} y2={floor.depth} stroke="var(--panel)" strokeWidth={0.2} />
                <path d={`M ${doorX(floor) - DOOR_WIDTH / 2} ${floor.depth} A ${DOOR_WIDTH} ${DOOR_WIDTH} 0 0 1 ${doorX(floor) - DOOR_WIDTH / 2 + DOOR_WIDTH * 0.7} ${floor.depth - DOOR_WIDTH * 0.7}`} fill="none" stroke="currentColor" strokeWidth={0.03} strokeDasharray="0.08 0.06" opacity={0.4} />
                <text x={doorX(floor)} y={floor.depth + 0.5} fontSize={0.22} textAnchor="middle" className="fill-foreground/55">Door (assumed)</text>
                <text x={floor.width / 2} y={-0.35} fontSize={0.26} textAnchor="middle" className="fill-foreground/60">{floor.width.toFixed(1)} m ({widthFt.toFixed(0)} ft)</text>
                <text x={-0.35} y={floor.depth / 2} fontSize={0.26} textAnchor="middle" transform={`rotate(-90 -0.35 ${floor.depth / 2})`} className="fill-foreground/60">{floor.depth.toFixed(1)} m ({depthFt.toFixed(0)} ft)</text>

                {visitors.map((v, i) => (
                  <polyline key={`trail-${i}`} fill="none" stroke={VISITOR_COLORS[i % VISITOR_COLORS.length]} strokeWidth={0.035} strokeDasharray="0.06 0.1" opacity={0.35}
                    points={v.legs.flatMap((l) => l.path).map(([x, y]) => `${x},${y}`).join(" ")} />
                ))}

                {placements.map((pl, i) => {
                  const isPreview = pl.key === "__preview";
                  const hard = bad.hard.has(pl.key);
                  const soft = bad.soft.has(pl.key);
                  const piece = placed.find((p) => p.id === pl.key);
                  const dragging = drag?.kind === "move" && drag.id === pl.key;
                  const z = zones && pl.asset.clearance.front > 0 ? frontZone(pl) : null;
                  const [e0, e1] = frontEdge(pl.rot, pl.box);
                  const w = pl.box.x1 - pl.box.x0;
                  const h = pl.box.y1 - pl.box.y0;
                  const label = !isSeating(pl.asset) && (w > 0.55 || h > 0.55) ? pl.asset.name.replace(/,.*$/, "").replace(/\s+\d+.*$/, "") : "";
                  const fs = Math.min(0.17, (w - 0.06) / Math.max(1, label.length * 0.56));
                  return (
                    <g key={pl.key} data-piece={pl.asset.assetId} data-testid={isPreview ? "piece-preview" : "piece"} data-problem={hard ? "hard" : soft ? "soft" : "none"}
                      onPointerDown={isPreview || !piece ? undefined : (e) => startMove(e, piece)}
                      className={isPreview ? "pointer-events-none" : "cursor-grab"} opacity={isPreview ? 0.7 : 1}>
                      {z && <polygon points={z.map(([x, y]) => `${x},${y}`).join(" ")} className={soft ? "fill-accent/15 stroke-accent" : "fill-match/10 stroke-match"} strokeWidth={0.025} strokeDasharray="0.1 0.07" opacity={0.7} />}
                      <g className={isPreview || dragging ? "" : "animate-pop [transform-box:fill-box] [transform-origin:center]"} style={isPreview || dragging ? undefined : { animationDelay: `${Math.min(i, 24) * 40}ms` }}>
                        <polygon points={pl.poly.map(([x, y]) => `${x},${y}`).join(" ")} strokeWidth={hard ? 0.07 : 0.045}
                          className={hard ? "fill-accent/25 stroke-accent" : `${categoryStyle(pl.asset)} ${soft ? "!stroke-accent" : ""}`}
                          strokeDasharray={soft && !hard ? "0.12 0.06" : undefined} />
                        <line x1={e0[0]} y1={e0[1]} x2={e1[0]} y2={e1[1]} strokeWidth={0.1} strokeLinecap="round" className="stroke-foreground/40" />
                        {label && fs >= 0.09 && (
                          <text x={(pl.box.x0 + pl.box.x1) / 2} y={(pl.box.y0 + pl.box.y1) / 2} fontSize={fs} textAnchor="middle" dominantBaseline="middle" className="pointer-events-none fill-foreground/80">
                            {label}
                          </text>
                        )}
                        {sel === pl.key && <rect x={pl.box.x0 - 0.06} y={pl.box.y0 - 0.06} width={w + 0.12} height={h + 0.12} fill="none" stroke="currentColor" strokeWidth={0.04} strokeDasharray="0.1 0.06" rx={0.05} data-testid="selection" />}
                      </g>
                    </g>
                  );
                })}

                {visitors.map((v, i) => (
                  <g key={`v-${i}`} ref={(el) => { personRefs.current[i] = el; }} data-testid="visitor" className="pointer-events-none" opacity={0}>
                    <ellipse cx={0.02} cy={0.04} rx={0.2} ry={0.16} fill="#000" opacity={0.12} />
                    <ellipse rx={0.2} ry={0.12} fill={VISITOR_COLORS[i % VISITOR_COLORS.length]} />
                    <circle r={0.11} fill="#f1d9bd" stroke="#1b1a17" strokeOpacity={0.35} strokeWidth={0.02} />
                  </g>
                ))}
              </svg>
            </div>

            <div className="mt-2 flex min-h-8 flex-wrap items-center gap-2 text-sm" data-testid="planner-selection">
              {selected ? (
                <>
                  <span className="font-medium">{selected.asset.name}</span>
                  <button type="button" onClick={() => rotate(selected.id)} className="rounded-full border border-foreground/25 px-3 py-1">Rotate (R)</button>
                  <button type="button" onClick={() => remove(selected.id)} className="rounded-full border border-foreground/25 px-3 py-1">Remove (Del)</button>
                  <span className="text-xs text-foreground/50">Arrow keys nudge 10 cm. Thick edge marks the piece&apos;s front.</span>
                </>
              ) : (
                <span className="text-foreground/55">{placed.length ? "Click a piece to rotate or remove it. Ctrl+Z undoes." : "The floor is empty. Drag a piece in, or load the cafe reference kit."}</span>
              )}
            </div>

            {floor && <PlannerFill floor={floor} placed={placed} assets={catalog.assets} onPlaced={commit} />}

            {issues.length > 0 && (
              <ul role="alert" className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-foreground/75" data-testid="planner-issues">
                {issues.slice(0, 6).map((i, n) => <li key={n}>{i.message}</li>)}
                {issues.length > 6 && <li>and {issues.length - 6} more.</li>}
              </ul>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" onClick={onContinue} disabled={!placed.length} className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background disabled:opacity-40" data-testid="planner-continue">Continue to Quantify</button>
              <span className="text-xs text-foreground/55">Quantify prices exactly these {placed.length} pieces on the {Math.round(sqft).toLocaleString("en-US")} sq ft floor ({Math.round(sqft * SQFT_TO_M2)} m2).</span>
            </div>
          </div>
        </div>
      )}

      {drag?.kind === "tray" && drag.moved && !preview && (
        <div className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-foreground/30 bg-background px-3 py-1.5 text-xs shadow-md" style={{ left: drag.cx, top: drag.cy }}>{drag.asset.name}</div>
      )}
    </section>
  );
}

function Stat({ label, value, id, warn }: { label: string; value: string; id: string; warn?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-foreground/55">{label}</dt>
      <dd className={`font-medium tabular-nums ${warn ? "text-accent" : ""}`} data-testid={`stat-${id}`}>{value}</dd>
    </div>
  );
}

function Glyph({ asset }: { asset: Asset }) {
  const img = assetImageUrl(asset);
  if (img) return /* eslint-disable-next-line @next/next/no-img-element */ <img src={img} alt="" draggable={false} className="h-11 w-11 shrink-0 rounded border border-foreground/15 object-cover" />;
  const { w, d } = sizeFor(asset, 0);
  const k = 40 / Math.max(w, d, 0.01);
  return (
    <svg width={44} height={44} viewBox="-2 -2 44 44" aria-hidden className="shrink-0">
      <g transform={`translate(${(40 - w * k) / 2} ${(40 - d * k) / 2})`}>
        <rect width={w * k} height={d * k} rx={2} className={categoryStyle(asset)} strokeWidth={1.2} />
        <line x1={0} x2={w * k} y1={d * k} y2={d * k} strokeWidth={2.5} strokeLinecap="round" className="stroke-foreground/40" />
      </g>
    </svg>
  );
}
