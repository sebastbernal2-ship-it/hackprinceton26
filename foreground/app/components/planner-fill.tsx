"use client";

import { useEffect, useMemo, useState } from "react";
import type { Rect } from "../lib/asset-layout";
import type { Asset } from "../lib/assets";
import { clock, simulateRush } from "../lib/fill-sim";
import { applyInstruction } from "../lib/place-text";
import { seatsOf, type PlacedPiece } from "../lib/planner";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const PLAY_SECONDS = 10;

type Props = { floor: Rect; placed: PlacedPiece[]; assets: Asset[]; onPlaced: (next: PlacedPiece[]) => void };

/** Type-to-place instructions plus the "Will it fill?" lunch-rush simulation. All figures are ESTIMATED demo scenarios. */
export default function PlannerFill({ floor, placed, assets, onPlaced }: Props) {
  const seats = useMemo(() => placed.reduce((n, p) => n + seatsOf(p.asset), 0), [placed]);
  const [peak, setPeak] = useState(40);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [run, setRun] = useState(0);
  const [minute, setMinute] = useState(0);
  const sim = useMemo(() => simulateRush({ seats, peakPerHour: peak }), [seats, peak]);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const m = reduce ? sim.minutes - 1 : Math.max(0, Math.min(sim.minutes - 1, Math.floor(((now - start) / 1000 / PLAY_SECONDS) * sim.minutes)));
      setMinute(m);
      if (m < sim.minutes - 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, sim]);

  const frame = sim.timeline[Math.min(minute, sim.timeline.length - 1)];
  const done = minute >= sim.minutes - 1;
  const maxY = Math.max(seats, ...sim.timeline.map((f) => f.seated + f.queue), 1);
  const W = 360, H = 90;
  const x = (i: number) => (i / (sim.minutes - 1)) * W;
  const y = (v: number) => H - (v / maxY) * H;
  const line = (pick: (f: (typeof sim.timeline)[number]) => number) => sim.timeline.map((f, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(pick(f)).toFixed(1)}`).join(" ");
  const verdict = seats === 0 ? "No seats placed yet." : sim.walked === 0 ? `Fills and holds: everyone is seated, longest queue ${sim.peakQueue}.` : `Does not hold: about ${sim.walked} of ${sim.needed} guests walk after ${sim.patience} min, longest queue ${sim.peakQueue}.`;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = applyInstruction(text, floor, placed, assets);
    if (r.placed !== placed) onPlaced(r.placed);
    setMsg(r.note);
    if (r.placed !== placed) setText("");
  }

  return (
    <div className="mt-4 rounded-xl border border-foreground/15 bg-panel p-3" data-testid="planner-fill">
      <h3 className="text-sm font-medium">Will it fill? Lunch rush, 11:00 am to 2:30 pm</h3>
      <form onSubmit={submit} className="mt-2 flex flex-wrap gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder='Type: "6 two-tops", "add a bar along the windows"' aria-label="Place furniture by instruction"
          className="min-w-0 flex-1 rounded-full border border-foreground/25 bg-background px-3 py-1.5 text-sm" data-testid="fill-instruction" />
        <button type="submit" className="rounded-full border border-foreground/25 px-3 py-1.5 text-sm" data-testid="fill-place">Place</button>
      </form>
      {msg && <p role="status" className="mt-1 text-xs text-accent" data-testid="fill-msg">{msg}</p>}

      <label className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        Peak covers per hour (assumed)
        <input type="range" min={10} max={120} step={5} value={peak} onChange={(e) => setPeak(Number(e.target.value))} data-testid="fill-peak" />
        <span className="tabular-nums">{peak}</span>
      </label>

      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
        <div><dt className="text-xs text-foreground/55">Seats</dt><dd className="font-medium tabular-nums" data-testid="fill-seats">{seats}</dd></div>
        <div><dt className="text-xs text-foreground/55">Peak covers / hr</dt><dd className="font-medium tabular-nums">{peak}</dd></div>
        <div><dt className="text-xs text-foreground/55">Queue / turned away</dt><dd className={`font-medium tabular-nums ${sim.walked > 0 ? "text-accent" : ""}`} data-testid="fill-walked">{sim.peakQueue} / {sim.walked}</dd></div>
        <div><dt className="text-xs text-foreground/55">Turns per seat</dt><dd className="font-medium tabular-nums">{sim.turns.toFixed(1)}</dd></div>
        <div><dt className="text-xs text-foreground/55">Revenue / hr, est.</dt><dd className="font-medium tabular-nums" data-testid="fill-revenue">{usd.format(sim.revenuePerHour.low)} to {usd.format(sim.revenuePerHour.high)}</dd></div>
      </dl>

      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-3 h-24 w-full" role="img" aria-label={`Seated and waiting guests through the rush. ${verdict}`} data-testid="fill-chart">
        <line x1={0} x2={W} y1={y(seats)} y2={y(seats)} stroke="currentColor" strokeOpacity={0.35} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
        <path d={line((f) => f.seated)} fill="none" stroke="#5f6d4e" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <path d={line((f) => f.queue)} fill="none" stroke="#d9512c" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <line x1={x(minute)} x2={x(minute)} y1={0} y2={H} stroke="currentColor" strokeOpacity={0.6} vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="text-xs text-foreground/60"><span style={{ color: "#5f6d4e" }}>Seated</span> · <span style={{ color: "#d9512c" }}>Waiting</span> · dashed line is your seat count</p>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
        <span className="font-medium tabular-nums" data-testid="fill-clock">{clock(sim.openHour, minute)}</span>
        <span className="tabular-nums" data-testid="fill-frame">{frame.seated} seated · {frame.queue} waiting · {frame.walked} walked</span>
        <button type="button" onClick={() => setRun((n) => n + 1)} className="rounded-full border border-foreground/25 px-3 py-1" data-testid="fill-replay">{done ? "Play again" : "Restart"}</button>
      </div>
      <p className="mt-2 text-sm" role="status" data-testid="fill-verdict">{verdict}</p>
      <p className="mt-1 text-xs text-foreground/55">ESTIMATED scenario, not observed: demand is a bell curve peaking at 12:30, guests stay {sim.dwell} min and wait up to {sim.patience} min, average check $9 to $14. Revenue/hr is served covers times that check over the 3.5-hour rush.</p>
    </div>
  );
}
