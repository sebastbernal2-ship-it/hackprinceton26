"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";
import type { Assessment, Check, Status } from "@/lib/feasibility";
import { usdRange } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SPRING } from "../motion";

const STATUS: Record<Status, { word: string; tone: string }> = {
  "likely-fine": { word: "Likely fine", tone: "text-saved" },
  "needs-professional": { word: "Needs a professional", tone: "text-maybe" },
  "likely-blocker": { word: "Likely blocker", tone: "text-needed" },
};

const weeks = (w: { low: number; high: number }) => (w.low === w.high ? `${w.low} wk` : `${w.low}-${w.high} wk`);
const signature = (c: Check) => `${c.id}:${c.status}:${c.cost ? Math.round(c.cost.range.mid) : "-"}:${c.triggeredBy.join(",")}`;

/**
 * "What this triggers": the feasibility checks the current plan raises, from lib/feasibility. Each row carries its
 * status word, cost range (and whether it is counted in the all-in), the code citations and the permit steps with
 * their weeks. New or changed rows flash `live-wash` once.
 */
export function ChecksCard({ assessment, open, onClose }: { assessment: Assessment; open: boolean; onClose: () => void }) {
  const reduce = useReducedMotion();
  // rows that were not in the previous assessment flash once; the previous set is kept alongside the current one
  const sigs = useMemo(() => new Set(assessment.checks.map(signature)), [assessment]);
  const [track, setTrack] = useState<{ cur: Set<string>; prior: Set<string> | null }>({ cur: sigs, prior: null });
  if (track.cur !== sigs) setTrack({ cur: sigs, prior: track.cur });
  const prior = track.prior;
  const permitName = new Map(assessment.permits.map((p) => [p.id, p]));

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.aside
          aria-label="What this triggers"
          className="glass-heavy pointer-events-auto absolute inset-y-0 right-0 z-20 flex w-[392px] max-w-[92%] flex-col overflow-hidden rounded-f-lg"
          initial={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, x: 24, transition: { duration: 0.2 } }}
          transition={SPRING.ui}
        >
          <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h3 className="text-[1.0625rem] font-semibold text-text">What this triggers</h3>
              <p className="flow-source mt-1 text-text-3">
                {assessment.checks.length} check{assessment.checks.length === 1 ? "" : "s"}, {usdRange(assessment.cost.total)} counted, about {weeks(assessment.time.totalWeeks)} to open
              </p>
              <p className="flow-source text-text-3">{assessment.codeBasis}</p>
            </div>
            <button type="button" onClick={onClose} className="flow-label h-9 shrink-0 rounded-full border border-line px-3 text-text-2 outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-live active:scale-[0.97]">
              Close
            </button>
          </header>
          <ul className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4">
            {assessment.checks.length === 0 ? <li className="flow-chat text-text-2">Nothing here raises a check yet. Add a bar, a cook line, a restroom or a patio and the code consequences appear.</li> : null}
            {assessment.checks.map((c) => {
              const sig = signature(c);
              const fresh = prior !== null && !prior.has(sig);
              return (
                <motion.li
                  key={sig}
                  initial={fresh && !reduce ? { backgroundColor: "var(--color-live-wash)" } : false}
                  animate={{ backgroundColor: "oklch(1 0 0 / 0.04)" }}
                  transition={{ duration: 1.2 }}
                  className="rounded-f-md border border-line p-3.5"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-semibold text-text">{c.label}</span>
                    <span className={cn("flow-label shrink-0", STATUS[c.status].tone)}>{STATUS[c.status].word}</span>
                  </div>
                  <p className="mt-1 text-sm leading-snug text-text-2">{c.summary}</p>
                  {c.cost ? (
                    <p className="flow-source mt-2 text-text-3">
                      {usdRange(c.cost.range)} {c.cost.counted ? "added to all-in" : "not added: already priced or a risk"}. {c.cost.source.label}
                    </p>
                  ) : null}
                  {c.weeks ? <p className="flow-source text-text-3">Work {weeks(c.weeks)}</p> : null}
                  {c.citations.length ? (
                    <p className="flow-source mt-1.5 text-text-3">
                      {c.citations.map((x) => `${x.code} (${x.source.label})`).join("; ")}
                    </p>
                  ) : null}
                  {c.permits.length ? (
                    <ul className="mt-1.5 space-y-0.5">
                      {c.permits.map((id) => {
                        const p = permitName.get(id);
                        return (
                          <li key={id} className="flow-source text-text-2">
                            Permit: {p ? `${p.label}, ${p.agency}, ${weeks(p.weeks)}` : id}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                  {c.professional && c.status !== "likely-fine" ? <p className="flow-source mt-1.5 text-maybe">Call: {c.professional}</p> : null}
                </motion.li>
              );
            })}
          </ul>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
