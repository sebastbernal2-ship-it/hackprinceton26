"use client";

import { useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "motion/react";
import type { Concept } from "@/lib/engine/types";
import { simulateDay, type Layout } from "@/lib/layout";
import { PlanMini } from "../plan-mini";
import { fillFrame } from "./data";

const PLAY_SECONDS = 12;
const STEP_MIN = 3;

function clock(openHour: number, minute: number): string {
  const total = openHour * 60 + minute;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`;
}

/**
 * "Will it fill?": one service day on the owner's plan at the break-even covers (lib/layout simulateDay), played in
 * 12 seconds on the plan. Guests queue at the door, take a free seat, and leave after the concept's dwell time;
 * anyone who waits past the patience limit walks. Counters come from the same simulation, not from a script.
 */
export function WillItFill({ layout, concept, covers }: { layout: Layout; concept: Concept; covers: number }) {
  const reduce = useReducedMotion();
  const sim = useMemo(() => simulateDay(layout, { covers, concept }), [layout, covers, concept]);
  const [run, setRun] = useState(0);
  const [minute, setMinute] = useState<number | null>(null);
  const shown = reduce ? sim.minutes : (minute ?? 0);

  useEffect(() => {
    if (reduce) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const m = Math.min(sim.minutes, Math.floor(((now - start) / 1000 / PLAY_SECONDS) * sim.minutes));
      setMinute(Math.floor(m / STEP_MIN) * STEP_MIN);
      if (m < sim.minutes) raf = requestAnimationFrame(tick);
      else setMinute(sim.minutes);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, sim, reduce]);

  const f = useMemo(() => fillFrame(sim, layout, shown), [sim, layout, shown]);
  const done = shown >= sim.minutes;
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_auto] gap-4">
      <div className="grid min-h-0 place-items-center rounded-f-sm bg-stage p-2">
        <PlanMini layout={layout} dots={f.dots} label={`The plan at ${clock(sim.openHour, shown)}: ${f.seated} seated, ${f.waiting} waiting`} className="h-full w-full" />
      </div>
      <div className="flex w-[132px] flex-col justify-between">
        <div>
          <p className="text-[1.5rem] leading-none font-semibold tracking-[-0.02em] text-text tabular-nums">{clock(sim.openHour, shown)}</p>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="flow-label text-text-3">Served</dt>
              <dd className="font-semibold text-text tabular-nums">
                {f.served} <span className="text-text-3">of {sim.needed}</span>
              </dd>
            </div>
            <div>
              <dt className="flow-label text-text-3">Walked away</dt>
              <dd className={`font-semibold tabular-nums ${f.walked > 0 ? "text-needed" : "text-text"}`}>{f.walked}</dd>
            </div>
            <div>
              <dt className="flow-label text-text-3">Waiting now</dt>
              <dd className="font-semibold text-text tabular-nums">{f.waiting}</dd>
            </div>
          </dl>
        </div>
        <button
          type="button"
          onClick={() => setRun((n) => n + 1)}
          className="flow-label h-9 rounded-full border border-line-strong bg-glass-fill px-3 text-text transition-transform duration-100 active:scale-[0.97]"
        >
          {done ? "Play again" : "Restart"}
        </button>
      </div>
      <p className="col-span-2 text-xs text-text-2" role="status">
        {done
          ? sim.walked === 0
            ? `At ${sim.needed} covers the room seats everyone: ${sim.turns.toFixed(1)} turns, longest queue ${sim.peakQueue}.`
            : `At ${sim.needed} covers ${sim.walked} guests walk away after waiting ${sim.patience} minutes; the room turns ${sim.turns.toFixed(1)} times, longest queue ${sim.peakQueue}.`
          : `Break-even is ${sim.needed} covers on ${sim.seats} seats, guests stay about ${sim.dwell} minutes.`}
      </p>
    </div>
  );
}
