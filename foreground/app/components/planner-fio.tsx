"use client";
// Fio in the Planner: "Design my place" and the Ask Fio commands, performed by the character on the floor.
// Every change reaches the planner's own placed/kit state one piece at a time, so the cost panel, Quantify and Will-it-fill
// follow live. Deterministic and local: no model, no network.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FioActor, type FioHandle } from "./fio-character";
import FioAvatar from "./fio-avatar";
import { checkLayout, type Rect } from "../lib/asset-layout";
import type { Asset } from "../lib/assets";
import { autoDesign, designPieces, type AutoDesign, type Concept } from "../lib/auto-design";
import { designIntent, CONCEPTS } from "../lib/fio-design-inputs";
import { answerQuestion, inspectFloor, lookAroundPlan, planDesign, standSpot } from "../lib/fio-plan";
import { runFioCommand } from "../lib/fio-planner";
import { readTime, type FioItem, type FioStep } from "../lib/fio-steps";
import { doorX, route, toPlacement, toPlacements, type PlacedPiece, type Pt } from "../lib/planner";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export type FioPlannerArgs = {
  floor: Rect | null;
  assets: Asset[];
  prices: Record<string, { low: number; high: number }>;
  /** Shared build-out budget in USD (typed in the cost panel, else the brief's), or null. */
  budget: number | null;
  /** Seats to start from (the brief's). */
  seatsHint: number | null;
  /** Live pieces (read at call time, so the animation always edits the latest floor). */
  getPlaced: () => PlacedPiece[];
  /** Save one undo step. */
  begin: () => void;
  /** Replace the floor and the shared kit without an undo step. */
  apply: (next: PlacedPiece[]) => void;
  undo: () => void;
  /** Bump to ask for a design (the chat panel does this). */
  request: number;
  /** Runs before a design starts: the planner clears the scanned objects so nothing is placed on top of them. */
  prepare?: () => Promise<void> | void;
};

const itemFor = (p: PlacedPiece, color = "var(--match)"): FioItem => {
  const b = toPlacement(p).box;
  return { id: p.id, label: p.asset.name, cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, w: b.x1 - b.x0, d: b.y1 - b.y0, color };
};
const same = (a: PlacedPiece, b: PlacedPiece) => a.x === b.x && a.y === b.y && a.rot === b.rot;

export function useFioPlanner(a: FioPlannerArgs) {
  const { floor, assets, prices, budget, seatsHint, getPlaced, begin, apply, undo, request, prepare } = a;
  const ref = useRef<FioHandle>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const run = useRef(0);
  const finish = useRef<(() => void) | null>(null);
  const placeActs = useRef(new Map<string, () => void>());
  const pickActs = useRef(new Map<string, () => void>());
  const [concept, setConcept] = useState<Concept>("cafe");
  const [seatsText, setSeatsText] = useState(seatsHint ? String(seatsHint) : "");
  const [design, setDesign] = useState<AutoDesign | null>(null);
  const [said, setSaid] = useState("");
  const [timedOut, setTimedOut] = useState(false);
  const live = useRef({ floor, assets, prices, budget, concept, seatsText, getPlaced, begin, apply, undo });
  useEffect(() => { live.current = { floor, assets, prices, budget, concept, seatsText, getPlaced, begin, apply, undo }; });
  useEffect(() => { const t = setTimeout(() => setTimedOut(true), 4000); return () => clearTimeout(t); }, []);

  const home: Pt = useMemo(() => (floor ? [doorX(floor), floor.depth - 0.35] : [0.5, 0.5]), [floor]);
  const priceOf = useCallback((x: Asset) => { const p = live.current.prices[x.priceRef ?? x.assetId]; return p ? (p.low + p.high) / 2 : null; }, []);

  const start = () => { busyRef.current = true; setBusy(true); const id = ++run.current; return id; };
  const stop = (id: number) => { if (run.current === id) { busyRef.current = false; finish.current = null; setBusy(false); } };
  const mutate = (fn: (cur: PlacedPiece[]) => PlacedPiece[]) => live.current.apply(fn(live.current.getPlaced()));

  const events = {
    onPlace: (item: FioItem) => { const f = placeActs.current.get(item.id); if (f) { placeActs.current.delete(item.id); f(); } },
    onPick: (item: FioItem) => { const f = pickActs.current.get(item.id); if (f) { pickActs.current.delete(item.id); f(); } },
    onSay: (t: string) => setSaid(t),
  };

  /** Run steps, then make sure the floor ends in `final` even when the animation was skipped. */
  async function perform(steps: FioStep[], final: () => PlacedPiece[]) {
    const id = run.current;
    const done = () => { live.current.apply(final()); placeActs.current.clear(); pickActs.current.clear(); };
    finish.current = () => { ref.current?.clear(); done(); void ref.current?.act([{ kind: "celebrate", dur: 1.2 }]); };
    await ref.current?.act(steps);
    if (run.current === id) done();
  }

  const goHome = (from: Pt, placed: PlacedPiece[]): FioStep[] => (floor ? [{ kind: "walk", path: route(floor, toPlacements(placed), from, home).slice(1) }] : []);

  async function designMyPlace(conceptOverride?: Concept): Promise<string> {
    const L = live.current;
    if (!L.floor || busyRef.current || !L.assets.length) return "I cannot start yet: the catalog is still loading.";
    const f = L.floor;
    const c = conceptOverride ?? L.concept;
    if (conceptOverride) setConcept(conceptOverride);
    const target = Math.max(1, Math.round(Number(L.seatsText) || seatsHint || 24));
    if (!Number(L.seatsText)) setSeatsText(String(target));
    const result = autoDesign({ floor: f, seatsTarget: target, concept: c, assets: L.assets, priceOf, windowWall: "front", ...(L.budget ? { budget: L.budget } : {}) });
    const id = start();
    setDesign(result);
    await prepare?.(); // clear the scanned objects (the brown squares) first so the design goes on an empty floor
    L.begin();
    L.apply([]);
    placeActs.current.clear();
    pickActs.current.clear();
    const pieces = designPieces(result);
    const byId = new Map(pieces.map((p) => [p.id, p]));
    for (const s of result.steps) {
      const p = byId.get(s.id);
      if (p) placeActs.current.set(s.id, () => mutate((cur) => (cur.some((x) => x.id === p.id) ? cur : [...cur, p])));
    }
    const plan = planDesign(result, f, { fast: true });
    await perform([{ kind: "walk", path: [result.door] }, ...plan.steps, ...goHome(result.door, pieces)], () => pieces);
    stop(id);
    return `Designed a ${c} for ${result.seats} seats (target ${result.seatsTarget}): ${result.issues.length} layout problems.`;
  }

  /** Fio carries one piece away or in. Returns the steps and the stand spot he ends on. */
  function opSteps(op: { kind: "add" | "remove" | "move"; piece: PlacedPiece; to?: PlacedPiece; group?: PlacedPiece[] }, sim: PlacedPiece[], at: Pt, lead?: string): { steps: FioStep[]; at: Pt; sim: PlacedPiece[] } {
    const f = live.current.floor!;
    const steps: FioStep[] = [];
    const crate: Pt = [doorX(f), f.depth - 0.5];
    const walk = (to: Pt, say?: string) => { const path = route(f, toPlacements(sim), at, to).slice(1); if (path.length) steps.push({ kind: "walk", path, ...(say ? { say } : {}) }); at = to; };
    const near = (p: Pt, q: Pt) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1.4;
    if (op.kind === "add") {
      const p = op.piece;
      const item = itemFor(p);
      const stand = standSpot(f, toPlacements(sim), toPlacement(p), at);
      if (!near(at, stand)) walk(crate, lead);
      steps.push({ kind: "pick", item });
      walk(stand);
      steps.push({ kind: "place", item, dur: 0.6 });
      placeActs.current.set(p.id, () => mutate((cur) => (cur.some((x) => x.id === p.id) ? cur : [...cur, p])));
      return { steps, at, sim: [...sim, p] };
    }
    if (op.kind === "remove") {
      const pcs = op.group ?? [op.piece];
      const item = itemFor(op.piece, "var(--accent)");
      const stand = standSpot(f, toPlacements(sim), toPlacement(op.piece), at);
      walk(stand, lead);
      steps.push({ kind: "pick", item });
      pickActs.current.set(op.piece.id, () => mutate((cur) => cur.filter((x) => !pcs.some((q) => q.id === x.id))));
      const left = sim.filter((x) => !pcs.some((q) => q.id === x.id));
      const dump = { ...item, id: `${item.id}:crate`, cx: crate[0], cy: crate[1] + 0.2 };
      const back = route(f, toPlacements(left), at, [crate[0], crate[1] - 0.4]).slice(1);
      if (back.length) steps.push({ kind: "walk", path: back });
      steps.push({ kind: "place", item: dump, dur: 0.5 });
      return { steps, at: [crate[0], crate[1] - 0.4], sim: left };
    }
    // move or rotate: pick it up where it is, set it down where it goes
    const to = op.to!;
    const item = itemFor(op.piece);
    const standA = standSpot(f, toPlacements(sim), toPlacement(op.piece), at);
    walk(standA, lead);
    steps.push({ kind: "pick", item });
    const without = sim.filter((x) => x.id !== op.piece.id);
    pickActs.current.set(op.piece.id, () => mutate((cur) => cur.filter((x) => x.id !== op.piece.id)));
    at = standA;
    const dest = itemFor(to);
    const standB = standSpot(f, toPlacements(without), toPlacement(to), at);
    const path = route(f, toPlacements(without), at, standB).slice(1);
    if (path.length) steps.push({ kind: "walk", path });
    steps.push({ kind: "place", item: dest, dur: 0.6 });
    placeActs.current.set(to.id, () => mutate((cur) => (cur.some((x) => x.id === to.id) ? cur.map((x) => (x.id === to.id ? to : x)) : [...cur, to])));
    return { steps, at: standB, sim: [...without, to] };
  }

  async function lookAndAnswer(answer: string): Promise<string> {
    const f = live.current.floor!;
    const id = start();
    const placed = live.current.getPlaced();
    const from = ref.current?.position() ?? home;
    const steps = [{ kind: "say", text: "Let me take a look around.", dur: 1.1 } as FioStep, ...lookAroundPlan(f, placed, from, answer), ...goHome(from, placed)];
    finish.current = () => { ref.current?.clear(); };
    await ref.current?.act(steps);
    stop(id);
    return answer;
  }

  async function reply(note: string, mood: "sorry" | "ok"): Promise<string> {
    const id = start();
    const f = live.current.floor!;
    const from = ref.current?.position() ?? home;
    finish.current = () => ref.current?.clear();
    await ref.current?.act([mood === "sorry" ? { kind: "think", dur: 0.9 } : { kind: "celebrate", dur: 0.9 }, { kind: "say", text: note, dur: Math.min(5, readTime(note)) }, ...(f ? goHome(from, live.current.getPlaced()) : [])]);
    stop(id);
    return note;
  }

  async function ask(text: string): Promise<string> {
    const L = live.current;
    if (!L.floor) return "";
    if (busyRef.current) return "Fio is still working. Skip the animation or wait a moment.";
    const di = designIntent(text);
    if (di) return designMyPlace(di.concept);
    const placed = L.getPlaced();
    const s = text.toLowerCase().trim();
    const imperative = /^(add|put|place|remove|delete|move|rotate|clear|empty|wipe|undo|take|get rid|push|turn|spin|flip|bring|set up|\d+|a |an |one|two|three|four|five|six|seven|eight|ten|twelve)\b/.test(s);
    if (!imperative) {
      const info = inspectFloor(L.floor, placed, priceOf);
      if (/\b(what|which)\b.*\b(in|on)\b.*\b(room|floor|space|here)\b|\b(describe|list|inventory)\b/.test(s)) return lookAndAnswer(runFioCommand("what is in this room", L.floor, placed, L.assets).note);
      if (/problem|issue|wrong|how many|seat|cost|price|how much|\bada\b|wheelchair|aisle|access|\bok\b|okay|fine|inspect|check|clearance/.test(s)) return lookAndAnswer(answerQuestion(s, info));
    }
    const r = runFioCommand(text, L.floor, placed, L.assets);
    if (r.undo) { L.undo(); return reply("Undone.", "ok"); }
    if (!r.changed) return reply(r.note, "sorry");

    const before = new Map(placed.map((p) => [p.id, p]));
    const after = new Map(r.placed.map((p) => [p.id, p]));
    const removed = placed.filter((p) => !after.has(p.id));
    const added = r.placed.filter((p) => !before.has(p.id));
    const moved = r.placed.filter((p) => before.has(p.id) && !same(before.get(p.id)!, p));
    const id = start();
    L.begin();
    const f = L.floor;
    let sim = placed;
    let at: Pt = ref.current?.position() ?? home;
    const steps: FioStep[] = [];
    const push = (res: ReturnType<typeof opSteps>) => { steps.push(...res.steps); at = res.at; sim = res.sim; };
    let lead: string | undefined = "On it.";
    const next = () => { const l = lead; lead = undefined; return l; };
    if (removed.length > 6) {
      // a whole-room clear: he sweeps in a few stops and takes a section at a time
      const sorted = [...removed].sort((p, q) => p.y - q.y || p.x - q.x);
      const n = 4;
      const size = Math.ceil(sorted.length / n);
      for (let i = 0; i < sorted.length; i += size) { const group = sorted.slice(i, i + size); push(opSteps({ kind: "remove", piece: group[0], group }, sim, at, next())); }
    } else for (const p of removed) push(opSteps({ kind: "remove", piece: p }, sim, at, next()));
    for (const p of moved) push(opSteps({ kind: "move", piece: before.get(p.id)!, to: p }, sim, at, next()));
    for (const p of added) push(opSteps({ kind: "add", piece: p }, sim, at, next()));
    steps.push({ kind: "celebrate", dur: 0.8, say: r.note }, { kind: "say", text: r.note, dur: Math.min(4.5, readTime(r.note)) }, ...goHome(at, r.placed));
    void f;
    await perform(steps, () => r.placed);
    stop(id);
    return r.note;
  }

  function skip() {
    if (!busyRef.current) return;
    const f = finish.current;
    run.current++;
    busyRef.current = false;
    setBusy(false);
    f?.();
  }

  // The chat panel asks for a design by bumping `request`; wait for the catalog and prices first.
  const handled = useRef(request);
  const ready = !!floor && assets.length > 0 && (Object.keys(prices).length > 0 || timedOut);
  useEffect(() => {
    if (request === handled.current || !ready || busyRef.current) return;
    handled.current = request;
    void designMyPlace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, ready]);

  const actor = floor ? (
    <FioActor ref={ref} home={home} heightM={1.5} speed={2.6} data-testid="planner-fio" {...events} />
  ) : null;
  return { actor, busy, concept, setConcept, seatsText, setSeatsText, design, said, designMyPlace, skip, ask, ready };
}

export type FioPlanner = ReturnType<typeof useFioPlanner>;

/** The prominent "Design my place" card above the floor. */
export function FioDesignPanel({ fio, budget, budgetFromBrief, floor, getPlaced }: { fio: FioPlanner; budget: number | null; budgetFromBrief: boolean; floor: Rect | null; getPlaced: () => PlacedPiece[] }) {
  const d = fio.design;
  const field = "rounded-lg border border-foreground/25 bg-background px-2 py-1 text-sm";
  const live = floor ? checkLayout(floor, toPlacements(getPlaced())).length : 0;
  return (
    <section className="mb-3 rounded-xl border border-match/40 bg-match-soft p-3" aria-label="Design my place" data-testid="fio-design" data-busy={fio.busy ? "1" : "0"}>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <FioAvatar size={44} />
        <button type="button" onClick={() => void fio.designMyPlace()} disabled={fio.busy || !fio.ready} data-testid="design-my-place"
          className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background disabled:opacity-40">Design my place</button>
        <label className="flex items-center gap-1.5">Concept
          <select value={fio.concept} onChange={(e) => fio.setConcept(e.target.value as Concept)} className={field} data-testid="design-concept" disabled={fio.busy}>
            {CONCEPTS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5">Seats
          <input type="number" min={1} max={200} value={fio.seatsText} onChange={(e) => fio.setSeatsText(e.target.value)} className={`${field} w-20 tabular-nums`} data-testid="design-seats" disabled={fio.busy} />
        </label>
        <span className="text-foreground/70" data-testid="design-budget">Budget {budget ? usd.format(budget) : "none set"}{budget && budgetFromBrief ? " (from your brief)" : ""}</span>
        {fio.busy && <button type="button" onClick={fio.skip} className="rounded-full border border-foreground/30 px-3 py-1.5" data-testid="design-skip">Skip animation</button>}
        <span role="status" className="min-w-0 flex-1 text-xs text-foreground/60" data-testid="design-status">{fio.busy ? (fio.said ? `Fio: ${fio.said}` : "Fio is working...") : d ? "Fio finished." : "Fio walks the room and places each piece, then checks it."}</span>
      </div>
      {d && !fio.busy && (
        <div className="mt-2 text-sm" data-testid="design-result">
          <p><b className="tabular-nums" data-testid="design-seats-result">{d.seats}</b> seats (target {d.seatsTarget}{d.seatsWithinTolerance ? "" : ", outside 10%"}) · <b className="tabular-nums" data-testid="design-problems">{d.issues.length}</b> layout problems · wheelchair path to every table: {d.access.ok ? "yes" : `no (${d.access.unreachable.join(", ")})`} · priced pieces about {usd.format(d.cost.total)}{d.cost.unpriced.length ? ` (+${d.cost.unpriced.length} unpriced)` : ""}. Layouts are ESTIMATED on an assumed floor.{live !== d.issues.length ? ` Now ${live} after your edits.` : ""}</p>
          {d.dropped.length > 0 && <p className="mt-1 text-foreground/70" data-testid="design-dropped">Left out: {d.dropped.map((x) => `${x.count} ${x.name} (${x.reason})`).join("; ")}</p>}
          {d.notes.map((n) => <p key={n} className="mt-1 text-xs text-foreground/60" data-testid="design-note">{n}</p>)}
          {d.issues.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-accent" data-testid="design-issues">{d.issues.slice(0, 5).map((i, n) => <li key={n}>{i.message}</li>)}</ul>}
        </div>
      )}
    </section>
  );
}
