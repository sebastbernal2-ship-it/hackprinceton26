"use client";

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Box, Minus, Plus, Redo2, RotateCw, Trash2, Undo2 } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Estimate } from "@/components/site/primitives";
import type { OwnerBrief } from "@/lib/engine/types";
import {
  CONCEPTS,
  GRID_M,
  ITEM_SPECS,
  LayoutSchema,
  OpsSchema,
  applyOps,
  autoLayout,
  conflicts,
  layoutImpact,
  simulateDay,
  validate,
  type ItemType,
  type Layout,
  type Op,
} from "@/lib/layout";
import type { Site } from "@/lib/sites/schema";
import { ImpactPanel, type SimState } from "./impact";
import { Plan, type PlanHandle, type SimTick } from "./plan";

const CONCEPT_LABEL: Record<(typeof CONCEPTS)[number], string> = {
  "quick-service": "Quick service",
  "fast-casual": "Fast casual",
  "full-service": "Full service",
  cafe: "Cafe",
  bar: "Bar",
};
const PALETTE: ItemType[] = ["two-top", "four-top", "six-top", "booth", "bar-counter", "bar-stool", "counter", "patio-table", "prep", "walk-in", "restroom", "host"];
const CHIPS = ["Add 10 more seats", "Make it a coffee bar", "Put a bar along the window", "Move the kitchen to the front", "More two-tops, fewer four-tops", "Seat everyone along the walls"];

type History = { past: Layout[]; present: Layout; future: Layout[] };
type Action = { type: "set"; layout: Layout } | { type: "undo" } | { type: "redo" } | { type: "load"; layout: Layout };

function reduceHistory(h: History, a: Action): History {
  switch (a.type) {
    case "set":
      return a.layout === h.present ? h : { past: [...h.past.slice(-49), h.present], present: a.layout, future: [] };
    case "undo":
      return h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h;
    case "redo":
      return h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h;
    case "load":
      return { past: [], present: a.layout, future: [] };
  }
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

const tool = "inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-sm border border-rule-strong bg-paper px-2.5 text-sm text-ink transition-[transform,border-color,background-color] duration-150 hover:border-ink active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40";

type Reply = { explanation: string; notes: string[]; source?: "claude" | "offline"; error?: boolean };
type Media = { src: string; caption: string }[];

export function Studio({
  site,
  brief,
  media,
  externalOps,
  externalMoves,
  onLayoutChange,
}: {
  site: Site;
  brief: OwnerBrief;
  media: Media;
  /** layout ops sent from outside (the Imagine panel); applied once per bump of n */
  externalOps?: { n: number; ops: Op[] };
  /** exact placements dragged in the 3D Walk; applied once per bump of n */
  externalMoves?: { n: number; moves: { id: string; x: number; y: number; rotation: Layout["items"][number]["rotation"] }[] };
  /** reports the settled plan, e.g. to hand it to the Imagine panel */
  onLayoutChange?: (layout: Layout) => void;
}) {
  const initial = useMemo(() => autoLayout(site, brief), [site, brief]);
  const [history, dispatch] = useReducer(reduceHistory, { past: [], present: initial, future: [] });
  const layout = history.present;
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: string; x: number; y: number } | null>(null);
  const [tilt, setTilt] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [flight, setFlight] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<Reply | null>(null);
  const [simState, setSimState] = useState<SimState>({ sim: null, playing: false, speed: 1, tick: null });
  const plan = useRef<PlanHandle>(null);
  const ctx = useMemo(() => ({ site, brief }), [site, brief]);
  const storageKey = `foreground.layout.v1.${site.id}`;

  // a saved plan for this site wins over the starting plan
  const loaded = useRef(false);
  useEffect(() => {
    loaded.current = true;
    try {
      const raw = localStorage.getItem(storageKey);
      const saved = raw ? LayoutSchema.safeParse(JSON.parse(raw)) : null;
      if (saved?.success && saved.data.siteId === site.id) dispatch({ type: "load", layout: saved.data });
      if (window.matchMedia("(max-width: 640px)").matches) requestAnimationFrame(() => setZoom(2));
    } catch {
      /* private mode or a stale shape: start from the default plan */
    }
  }, [storageKey, site.id]);
  useEffect(() => {
    if (!loaded.current) return;
    const id = setTimeout(() => {
      try {
        if (layout === initial) localStorage.removeItem(storageKey);
        else localStorage.setItem(storageKey, JSON.stringify(layout));
      } catch {
        /* storage full or blocked */
      }
    }, 300);
    return () => clearTimeout(id);
  }, [layout, initial, storageKey]);

  const stopSim = useCallback(() => setSimState((s) => (s.sim ? { ...s, sim: null, playing: false, tick: null } : s)), []);
  const commit = useCallback(
    (next: Layout, fly = false) => {
      dispatch({ type: "set", layout: next });
      if (fly) setFlight((f) => f + 1);
      stopSim();
    },
    [stopSim],
  );
  const run = useCallback(
    (ops: Op[], fly = true) => {
      const result = applyOps(layout, ops, ctx);
      commit(result.layout, fly);
      return result;
    },
    [layout, ctx, commit],
  );

  const settled = useDebounced(layout, 120);
  const impact = useMemo(() => layoutImpact(site, brief, settled), [site, brief, settled]);
  const baseline = useMemo(() => layoutImpact(site, brief, initial), [site, brief, initial]);
  const warnings = useMemo(() => validate(settled), [settled]);
  const dayResult = useMemo(() => simulateDay(settled, { covers: impact.breakeven.coversPerDay, concept: settled.concept }), [settled, impact.breakeven.coversPerDay]);
  const flagged = useMemo(() => {
    const live = preview ? { ...layout, items: layout.items.map((i) => (i.id === preview.id ? { ...i, x: preview.x, y: preview.y } : i)) } : layout;
    const c = conflicts(live);
    return new Set([...c.overlapping, ...c.outside]);
  }, [layout, preview]);

  const item = layout.items.find((i) => i.id === selected) ?? null;
  const patch = useCallback(
    (id: string, change: (i: Layout["items"][number]) => Layout["items"][number] | null) => {
      const items = layout.items.flatMap((i) => {
        if (i.id !== id) return [i];
        const next = change(i);
        return next ? [next] : [];
      });
      commit({ ...layout, items });
    },
    [layout, commit],
  );
  const onMove = useCallback((id: string, x: number, y: number) => patch(id, (i) => ({ ...i, x, y })), [patch]);
  const onPreview = useCallback((id: string | null, x: number, y: number) => setPreview(id ? { id, x, y } : null), []);
  const nudge = (id: string, dx: number, dy: number) => patch(id, (i) => ({ ...i, x: i.x + dx, y: i.y + dy }));
  const rotate = (id: string) => patch(id, (i) => ({ ...i, rotation: ((i.rotation + 90) % 360) as 0 | 90 | 180 | 270 }));
  const remove = (id: string) => {
    patch(id, () => null);
    setSelected(null);
  };
  const onKey = (id: string, e: KeyboardEvent) => {
    const step = e.shiftKey ? 1 : GRID_M;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) nudge(id, ...moves[e.key]);
    else if (e.key === "r" || e.key === "R") rotate(id);
    else if (e.key === "Backspace" || e.key === "Delete") remove(id);
    else if (e.key === "Escape") setSelected(null);
    else return;
    e.preventDefault();
  };
  const undo = (redo = false) => {
    dispatch({ type: redo ? "redo" : "undo" });
    setFlight((f) => f + 1);
    stopSim();
  };

  async function submit(instruction: string) {
    const ask = instruction.trim();
    if (ask.length < 2 || busy) return;
    setBusy(true);
    setReply(null);
    try {
      const res = await fetch("/api/layout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ siteId: site.id, layout, instruction: ask }), signal: AbortSignal.timeout(20_000) });
      const data = (await res.json()) as { ops?: unknown; explanation?: string; source?: "claude" | "offline"; error?: string };
      const ops = OpsSchema.safeParse(data.ops);
      if (!res.ok || !ops.success) return setReply({ explanation: data.error ?? "The planner sent back something unreadable. Try rephrasing.", notes: [], error: true });
      const result = ops.data.length ? run(ops.data) : { notes: [] };
      setReply({ explanation: data.explanation ?? "", notes: result.notes, source: data.source });
      setText("");
      setSelected(null);
    } catch {
      setReply({ explanation: "The planner did not answer. Check the connection and try again, or drag the pieces yourself.", notes: [], error: true });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    onLayoutChange?.(settled);
  }, [settled, onLayoutChange]);
  const appliedOps = useRef(externalOps?.n ?? 0);
  useEffect(() => {
    if (!externalOps || externalOps.n === appliedOps.current) return;
    appliedOps.current = externalOps.n;
    run(externalOps.ops);
  }, [externalOps, run]);

  const appliedMoves = useRef(externalMoves?.n ?? 0);
  useEffect(() => {
    if (!externalMoves || externalMoves.n === appliedMoves.current) return;
    appliedMoves.current = externalMoves.n;
    const by = new Map(externalMoves.moves.map((m) => [m.id, m]));
    commit({ ...layout, items: layout.items.map((i) => (by.has(i.id) ? { ...i, x: by.get(i.id)!.x, y: by.get(i.id)!.y, rotation: by.get(i.id)!.rotation } : i)) });
  }, [externalMoves, layout, commit]);

  const onTick = useCallback((tick: SimTick) => setSimState((s) => (s.sim ? { ...s, tick, playing: tick.done ? false : s.playing } : s)), []);
  const toggleSim = () =>
    setSimState((s) => {
      if (!s.sim) return { ...s, sim: dayResult, playing: true, tick: null };
      if (s.tick?.done) plan.current?.simReset();
      return { ...s, playing: !s.playing };
    });

  return (
    <div
      className="grid gap-x-10 gap-y-8 lg:grid-cols-12"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !(e.target instanceof HTMLInputElement)) {
          e.preventDefault();
          undo(e.shiftKey);
        }
      }}
    >
      <div className="flex min-w-0 flex-col gap-4 lg:col-span-8">

        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <div role="radiogroup" aria-label="Concept" className="flex flex-wrap">
            {CONCEPTS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={layout.concept === c} onClick={() => layout.concept !== c && run([{ op: "setConcept", concept: c }])} className={`-ml-px h-9 border border-rule-strong px-3 text-sm transition-colors first:ml-0 first:rounded-l-sm last:rounded-r-sm ${layout.concept === c ? "relative z-10 border-ink bg-ink font-semibold text-on-ink" : "bg-paper hover:border-ink hover:z-10 hover:relative"}`}>
                {CONCEPT_LABEL[c]}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            <button type="button" className={tool} onClick={() => undo()} disabled={!history.past.length} aria-label="Undo">
              <Undo2 size={16} aria-hidden />
            </button>
            <button type="button" className={tool} onClick={() => undo(true)} disabled={!history.future.length} aria-label="Redo">
              <Redo2 size={16} aria-hidden />
            </button>
            <button type="button" className={tool} aria-pressed={tilt} onClick={() => setTilt((v) => !v)} style={tilt ? { background: "var(--ink)", color: "var(--on-ink)", borderColor: "var(--ink)" } : undefined}>
              <Box size={16} aria-hidden /> {tilt ? "Flat plan" : "Tilt"}
            </button>
            <button type="button" className={tool} onClick={() => setZoom((z) => Math.max(1, z - 0.5))} disabled={zoom <= 1} aria-label="Zoom out">
              <Minus size={16} aria-hidden />
            </button>
            <button type="button" className={tool} onClick={() => setZoom((z) => Math.min(3, z + 0.5))} disabled={zoom >= 3} aria-label="Zoom in">
              <Plus size={16} aria-hidden />
            </button>
          </div>
          {layout !== initial ? (
            <button type="button" onClick={() => (commit(initial, true), setReply(null), setSelected(null))} className="h-9 text-sm text-ink-2 underline hover:text-ink">
              Start over
            </button>
          ) : null}
        </div>

        <div className="overflow-auto overscroll-x-contain" style={{ touchAction: "pan-x pan-y pinch-zoom" }}>
          <div style={{ width: `${zoom * 100}%` }}>
            <Plan ref={plan} layout={layout} selectedId={selected} flagged={flagged} tilt={tilt} flight={flight} sim={simState.sim} simPlaying={simState.playing} simSpeed={simState.speed} onSimTick={onTick} onSelect={setSelected} onMove={onMove} onPreview={onPreview} onKey={onKey} />
          </div>
        </div>

        <div className="flex min-h-11 flex-wrap items-center gap-2 text-sm">
          {item ? (
            <>
              <span className="mr-1 font-medium">
                {ITEM_SPECS[item.type].label}
                {ITEM_SPECS[item.type].seats ? <span className="text-ink-2"> · {ITEM_SPECS[item.type].seats} seats</span> : null}
              </span>
              <button type="button" className={tool} onClick={() => rotate(item.id)}>
                <RotateCw size={15} aria-hidden /> Rotate
              </button>
              <button type="button" className={tool} onClick={() => remove(item.id)}>
                <Trash2 size={15} aria-hidden /> Remove
              </button>
              {(
                [
                  [ArrowLeft, -GRID_M, 0, "left"],
                  [ArrowUp, 0, -GRID_M, "up"],
                  [ArrowDown, 0, GRID_M, "down"],
                  [ArrowRight, GRID_M, 0, "right"],
                ] as const
              ).map(([Icon, dx, dy, name]) => (
                <button key={name} type="button" className={tool} aria-label={`Nudge ${name}`} onClick={() => nudge(item.id, dx, dy)}>
                  <Icon size={15} aria-hidden />
                </button>
              ))}
            </>
          ) : (
            <span className="text-ink-2">Drag a piece to move it. Select one to rotate (R), nudge (arrow keys) or remove (Backspace). Snaps to 0.25 m.</span>
          )}
        </div>

        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Add a piece">
          {PALETTE.map((t) => (
            <button key={t} type="button" className={`${tool} shrink-0 px-2 text-[0.8125rem]`} onClick={() => run([{ op: "add", type: t, count: 1 }], false)}>
              <Plus size={13} aria-hidden className="text-ink-2" />
              {ITEM_SPECS[t].label}
            </button>
          ))}
        </div>

        <form onSubmit={(e: FormEvent) => (e.preventDefault(), void submit(text))} className="flex flex-col gap-2">
          <label htmlFor="studio-ask" className="text-xs font-medium text-ink-2">
            Tell it what you want changed
          </label>
          <div className="flex gap-2">
            <input id="studio-ask" value={text} onChange={(e) => setText(e.target.value)} maxLength={400} placeholder="Put a bar along the window" autoComplete="off" className="h-11 min-w-0 flex-1 rounded-sm border border-rule-strong bg-paper px-3 text-base text-ink transition-colors placeholder:text-ink-2/70 hover:border-ink focus-visible:border-ink" />
            <button type="submit" disabled={busy || text.trim().length < 2} className="h-11 shrink-0 rounded-sm bg-ink px-4 text-sm font-semibold text-on-ink transition-[transform,background-color] duration-150 hover:bg-ink/90 active:scale-[0.97] disabled:opacity-50">
              {busy ? "Rearranging…" : "Rearrange"}
            </button>
          </div>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
            {CHIPS.map((c) => (
              <button key={c} type="button" disabled={busy} onClick={() => void submit(c)} className="h-8 shrink-0 rounded-sm border border-rule-strong px-2.5 text-sm text-ink-2 transition-[transform,border-color,color] duration-150 hover:border-ink hover:text-ink active:scale-[0.97] disabled:opacity-50">
                {c}
              </button>
            ))}
          </div>
          <div aria-live="polite" className="min-h-6 text-sm">
            {busy ? <span className="text-ink-2">Reading the plan and your instruction…</span> : null}
            {reply ? (
              <p role={reply.error ? "alert" : undefined} className={reply.error ? "text-needed" : ""}>
                {reply.explanation} {reply.notes.length ? <span className="text-maybe-ink">{reply.notes.join(" ")}</span> : null}{" "}
                {reply.source ? <span className="font-mono text-[0.6875rem] text-ink-2">src {reply.source === "claude" ? "Claude read the instruction; Foreground placed the pieces" : "offline reader (planner unreachable)"}</span> : null}
              </p>
            ) : null}
          </div>
        </form>

        {warnings.length ? (
          <ul className="flex flex-col gap-1.5 border-t border-rule pt-3 text-sm" aria-label="Problems with this plan">
            {warnings.map((w) => (
              <li key={w.message} className="flex gap-2">
                <span aria-hidden className="mt-1 inline-block size-3 shrink-0 border border-needed" style={{ background: "repeating-linear-gradient(45deg, var(--needed) 0 1.5px, transparent 1.5px 4px)" }} />
                <span>
                  {w.message}{" "}
                  {w.itemIds[0] ? (
                    <button type="button" className="text-ink-2 underline hover:text-ink" onClick={() => setSelected(w.itemIds[0])}>
                      Show
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="border-t border-rule pt-3 text-sm text-ink-2">Nothing overlaps, everything is on the floor, and a 0.9 m route reaches every table, the restroom and the cook line.</p>
        )}

        <p className="font-mono text-[0.6875rem] leading-snug text-ink-2">
          src {layout.footprint.source === "matterport" ? `floor outline from the Matterport scan of this suite, ${layout.footprint.rooms?.length} rooms` : `rectangle drawn from the listing's ${site.space.sf.toLocaleString("en-US")} SF at a typical bay shape; real walls will differ`}
          {layout.kitchenAnchor ? "; green cross marks the existing hood" : ""}. Zones, aisles (1.1 m) and the door position are Foreground&apos;s planning assumptions. <Estimate />
        </p>
      </div>

      <div className="flex min-w-0 flex-col gap-8 lg:col-span-4">
        <ImpactPanel impact={impact} baseline={baseline} budget={brief.budgetUsd} simState={simState} dayResult={dayResult} onSimToggle={toggleSim} onSimRestart={() => (plan.current?.simReset(), setSimState((s) => ({ ...s, playing: true, tick: null })))} onSimSpeed={(speed) => setSimState((s) => ({ ...s, speed }))} />
        {media.length ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1 xl:grid-cols-2">
            {media.map((m) => (
              <figure key={m.src} className="m-0 flex flex-col gap-1">
                <div className="relative aspect-[4/3] overflow-hidden rounded-sm border border-rule-strong bg-paper-2">
                  <Image src={m.src} alt={m.caption} fill sizes="(min-width: 1024px) 16vw, 50vw" className="object-cover" />
                </div>
                <figcaption className="font-mono text-[0.6875rem] leading-tight text-ink-2">{m.caption}</figcaption>
              </figure>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
