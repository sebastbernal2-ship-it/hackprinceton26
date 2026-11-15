"use client";
import { useMemo, useRef, useState } from "react";
import { FioActor, FioOverlay, type FioHandle } from "../../components/fio-character";
import { toPlacement, findSpot, newId, route, type PlacedPiece } from "../../lib/planner";
import { autoDesign, type AutoDesign, type Concept, type WindowWall } from "../../lib/auto-design";
import { answerQuestion, inspectFloor, lookAroundPlan, planDesign, standSpot } from "../../lib/fio-plan";
import type { FioItem } from "../../lib/fio-steps";
import { checkLayout } from "../../lib/asset-layout";
import type { Asset } from "../../lib/assets";
import { toPlacements } from "../../lib/planner";

const FILL: Record<string, string> = { seating: "var(--match-soft)", table: "var(--panel)", counter: "#f1d9bd" };
const field = "rounded border border-foreground/25 bg-background px-2 py-1 text-sm";

export function FioDemo({ assets, prices }: { assets: Asset[]; prices: Record<string, number> }) {
  const [w, setW] = useState(11);
  const [d, setD] = useState(7.5);
  const [concept, setConcept] = useState<Concept>("cafe");
  const [seats, setSeats] = useState(20);
  const [budget, setBudget] = useState("");
  const [wall, setWall] = useState<WindowWall>("front");
  const [patio, setPatio] = useState(false);
  const [fast, setFast] = useState(false);
  const [placed, setPlaced] = useState<PlacedPiece[]>([]);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [question, setQuestion] = useState("any problems?");
  const [design, setDesign] = useState<AutoDesign | null>(null);
  const [done, setDone] = useState(false);
  const fio = useRef<FioHandle>(null);
  const pending = useRef(new Map<string, PlacedPiece>());
  const floor = useMemo(() => ({ width: w, depth: d }), [w, d]);
  const priceOf = (a: Asset) => (a.priceRef ? (prices[a.priceRef] ?? null) : null);
  const patioDepth = patio ? 2.6 : 0;
  const door: [number, number] = design?.door ?? [Math.min(w - 1, Math.max(0.4, w * 0.18)) + 0.5, d - 0.5];

  const inside = (p: PlacedPiece) => {
    const b = toPlacement(p).box;
    return b.x0 >= -1e-6 && b.y0 >= -1e-6 && b.x1 <= w + 1e-6 && b.y1 <= d + 1e-6;
  };
  const interior = placed.filter(inside);
  const info = inspectFloor(floor, interior, priceOf);
  const patioPieces = placed.filter((p) => !inside(p));

  async function perform(label: string, run: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setDone(false);
    setLog((l) => [...l, `> ${label}`]);
    await run();
    setBusy(false);
    setDone(true);
  }

  const designMyPlace = () => perform("Design my place", async () => {
    setPlaced([]);
    pending.current.clear();
    const result = autoDesign({
      floor, seatsTarget: seats, concept, assets, priceOf, windowWall: wall,
      ...(budget ? { budget: Number(budget) } : {}),
      ...(patio ? { patio: { seats: 4 } } : {}),
    });
    setDesign(result);
    const plan = planDesign(result, floor, { fast });
    for (const s of result.steps) pending.current.set(s.id, { id: s.id, asset: s.asset, rot: s.rot, x: s.x, y: s.y });
    fio.current?.walkTo(result.door[0], result.door[1]);
    await fio.current?.act(plan.steps);
  });

  const lookAround = () => perform(`Ask: ${question}`, async () => {
    const answer = answerQuestion(question, info);
    const at = fio.current?.position() ?? door;
    await fio.current?.act(lookAroundPlan(floor, interior, at, answer, { fast }));
  });

  const addTwoTop = () => perform("Add a two-top", async () => {
    const table = assets.find((a) => a.assetId === "table_2top_30");
    const chair = assets.find((a) => a.assetId === "chair_dining");
    if (!table || !chair) return;
    const spot = findSpot(floor, interior, table);
    if (!spot) { await fio.current?.say("No free spot for a two-top."); return; }
    const piece: PlacedPiece = { id: newId(table), asset: table, rot: spot.rot, x: spot.x, y: spot.y };
    pending.current.set(piece.id, piece);
    const item: FioItem = { id: piece.id, label: table.name, cx: spot.x + 0.38, cy: spot.y + 0.38, w: 0.76, d: 0.76, color: "var(--match)" };
    const from = fio.current?.position() ?? door;
    const stand = standSpot(floor, toPlacements(interior), toPlacement(piece), from);
    await fio.current?.act([
      { kind: "pick", item },
      { kind: "walk", path: route(floor, toPlacements(interior), from, stand).slice(1), say: "A two-top in the first free spot." },
      { kind: "place", item, dur: 1.4 },
    ]);
    void chair;
  });

  const reset = () => { setPlaced([]); setDesign(null); setLog([]); setDone(false); pending.current.clear(); };

  const onSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const m = svg.getScreenCTM();
    if (!m || busy) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    void fio.current?.walkTo(pt.x, pt.y);
  };

  const issues = design ? design.issues.length : checkLayout(floor, toPlacements(interior)).length;
  const margin = 0.8;
  const pd = patioDepth - 0.3;
  const patioRect = wall === "front" ? { x: 0, y: d + 0.3, width: w, height: pd } : wall === "back" ? { x: 0, y: -patioDepth, width: w, height: pd }
    : wall === "left" ? { x: -patioDepth, y: 0, width: pd, height: d } : { x: w + 0.3, y: 0, width: pd, height: d };
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6" data-testid="fio-demo" data-done={done ? "1" : "0"} data-busy={busy ? "1" : "0"}>
      <h1 className="text-2xl font-semibold">Fio, the inspector</h1>
      <p className="mt-1 text-sm text-foreground/65">Dev-only. Ask him to design your place, or to look around and answer. Click the floor to send him somewhere. Layouts are ESTIMATED on an assumed floor.</p>

      <div className="mt-4 flex flex-wrap items-end gap-3 text-sm">
        <label className="grid gap-1">Concept
          <select className={field} value={concept} onChange={(e) => setConcept(e.target.value as Concept)} data-testid="concept">
            {(["cafe", "grab-and-go", "full-service", "frozen-yogurt"] as Concept[]).map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="grid gap-1">Seats<input className={`${field} w-20`} type="number" value={seats} onChange={(e) => setSeats(Number(e.target.value))} data-testid="seats" /></label>
        <label className="grid gap-1">Budget $<input className={`${field} w-28`} placeholder="none" value={budget} onChange={(e) => setBudget(e.target.value)} data-testid="budget" /></label>
        <label className="grid gap-1">Width m<input className={`${field} w-20`} type="number" step="0.5" value={w} onChange={(e) => setW(Number(e.target.value))} /></label>
        <label className="grid gap-1">Depth m<input className={`${field} w-20`} type="number" step="0.5" value={d} onChange={(e) => setD(Number(e.target.value))} /></label>
        <label className="grid gap-1">Window wall
          <select className={field} value={wall} onChange={(e) => setWall(e.target.value as WindowWall)}>{["front", "back", "left", "right"].map((x) => <option key={x}>{x}</option>)}</select>
        </label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={patio} onChange={(e) => setPatio(e.target.checked)} /> Patio</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={fast} onChange={(e) => setFast(e.target.checked)} data-testid="fast" /> Fast</label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <button type="button" disabled={busy} onClick={designMyPlace} data-testid="design-btn" className="rounded-full bg-foreground px-4 py-1.5 text-background disabled:opacity-40">Design my place</button>
        <button type="button" disabled={busy} onClick={addTwoTop} className="rounded-full border border-foreground/25 px-3 py-1.5 disabled:opacity-40">Add a two-top</button>
        <input className={`${field} w-56`} value={question} onChange={(e) => setQuestion(e.target.value)} aria-label="Ask Fio" data-testid="question" />
        <button type="button" disabled={busy} onClick={lookAround} data-testid="look-btn" className="rounded-full border border-foreground/25 px-3 py-1.5 disabled:opacity-40">Look around and answer</button>
        <button type="button" disabled={busy} onClick={() => perform("Celebrate", async () => { await fio.current?.celebrate(); })} className="rounded-full border border-foreground/25 px-3 py-1.5 disabled:opacity-40">Celebrate</button>
        <button type="button" onClick={reset} className="rounded-full border border-foreground/25 px-3 py-1.5">Clear floor</button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_18rem]">
        <svg viewBox={`${-margin - (wall === "left" ? patioDepth : 0)} ${-margin - (wall === "back" ? patioDepth : 0)} ${w + 2 * margin + (wall === "left" || wall === "right" ? patioDepth : 0)} ${d + 2 * margin + (wall === "front" || wall === "back" ? patioDepth : 0)}`} className="w-full rounded-lg border border-foreground/15 bg-panel" onClick={onSvgClick} data-testid="fio-floor" role="img" aria-label="Floor plan">
          <rect x={0} y={0} width={w} height={d} fill="var(--background)" stroke="var(--foreground)" strokeWidth={0.07} />
          {patio && <rect {...patioRect} fill="var(--match-soft)" opacity={0.5} stroke="var(--foreground)" strokeOpacity={0.3} strokeDasharray="0.12 0.08" strokeWidth={0.03} />}
          {design?.zones.map((z) => (
            <rect key={z.zone} x={z.x0} y={z.y0} width={z.x1 - z.x0} height={z.y1 - z.y0} fill={z.zone === "queue lane" ? "var(--accent)" : "none"} fillOpacity={0.07} stroke="var(--foreground)" strokeOpacity={0.18} strokeDasharray="0.1 0.1" strokeWidth={0.025} />
          ))}
          {design?.zones.map((z) => <text key={`t${z.zone}`} x={z.x0 + 0.1} y={z.y0 + 0.28} fontSize={0.22} className="fill-foreground/45">{z.zone}</text>)}
          <circle cx={door[0]} cy={door[1]} r={0.08} fill="var(--accent)" />
          <rect x={door[0] - 0.4} y={door[1] + 0.3} width={0.8} height={0.5} rx={0.06} fill="#b08d57" opacity={0.55} stroke="var(--foreground)" strokeWidth={0.02} />
          <text x={door[0]} y={door[1] + 0.62} fontSize={0.2} textAnchor="middle" className="fill-foreground/70">crate</text>
          {placed.map((p) => {
            const pl = toPlacement(p);
            const pts = pl.poly.map(([x, y]) => `${x},${y}`).join(" ");
            const b = pl.box;
            return (
              <g key={p.id} className="animate-pop" style={{ transformBox: "fill-box", transformOrigin: "center" }} data-testid="placed" data-asset={p.asset.assetId}>
                <polygon points={pts} fill={FILL[p.asset.category] ?? "#e3e7da"} stroke="var(--foreground)" strokeOpacity={0.55} strokeWidth={0.03} />
                {(b.x1 - b.x0) * (b.y1 - b.y0) > 0.5 && <text x={(b.x0 + b.x1) / 2} y={(b.y0 + b.y1) / 2} fontSize={0.17} textAnchor="middle" dominantBaseline="middle" className="fill-foreground/70">{p.asset.name.replace(/ \d.*$/, "").slice(0, 18)}</text>}
              </g>
            );
          })}
          <FioActor ref={fio} home={[door[0], door[1] + 0.1]} heightM={1.5} speed={fast ? 4 : 2.2}
            onPlace={(item) => { const p = pending.current.get(item.id); if (p) setPlaced((cur) => (cur.some((c) => c.id === p.id) ? cur : [...cur, p])); }}
            onSay={(t) => setLog((l) => [...l.slice(-40), `Fio: ${t}`])} />
        </svg>

        <aside className="grid content-start gap-3 text-sm" data-testid="fio-status">
          <div className="rounded-lg border border-foreground/15 p-3">
            <div><b data-testid="status-seats">{info.seats}</b> seats inside{design ? ` (target ${design.seatsTarget}, ${design.seatsWithinTolerance ? "within 10%" : "outside 10%"})` : ""}{patioPieces.length ? `, ${patioPieces.reduce((s, p) => s + (p.asset.category === "seating" ? 1 : 0), 0)} patio` : ""}</div>
            <div>Layout problems: <b data-testid="status-problems">{issues}</b></div>
            {design && <div>Wheelchair path to every table: <b data-testid="status-access">{design.access.ok ? "yes" : `no (${design.access.unreachable.join(", ")})`}</b></div>}
            <div>Priced cost: ${Math.round(info.cost ?? 0).toLocaleString("en-US")}{info.unpriced ? ` (+${info.unpriced} unpriced)` : ""}</div>
            {design?.dropped.length ? <div className="mt-1 text-foreground/70">Left out: {design.dropped.map((x) => `${x.count} ${x.name} (${x.reason})`).join(", ")}</div> : null}
            {design?.notes.map((n) => <div key={n} className="mt-1 text-foreground/60">{n}</div>)}
          </div>
          <div className="max-h-72 overflow-auto rounded-lg border border-foreground/15 p-3 text-xs" data-testid="fio-log">
            {log.length ? log.map((l, i) => <p key={i} className="mb-1">{l}</p>) : <p className="text-foreground/50">Nothing said yet.</p>}
          </div>
        </aside>
      </div>
      <details className="mt-6 text-sm"><summary>Overlay mascot (non-floor screens)</summary><OverlayDemo /></details>
    </main>
  );
}

function OverlayDemo() {
  const ref = useRef<FioHandle>(null);
  const [on, setOn] = useState(false);
  return (
    <div className="mt-2 flex gap-2">
      <button type="button" className="rounded-full border border-foreground/25 px-3 py-1" onClick={() => setOn(!on)}>{on ? "Hide Fio" : "Show Fio in the corner"}</button>
      {on && <button type="button" className="rounded-full border border-foreground/25 px-3 py-1" onClick={() => { void ref.current?.walkTo(200, 300).then(() => ref.current?.say("Hello from the corner of the screen.")); }}>Walk and talk</button>}
      {on && <FioOverlay ref={ref} />}
    </div>
  );
}
