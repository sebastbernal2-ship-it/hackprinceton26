"use client";

import { animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export type Snap = "peek" | "half" | "full";
const ORDER: Snap[] = ["peek", "half", "full"];
const SNAP_TEXT: Record<Snap, string> = { peek: "showing a summary", half: "half open", full: "fully open" };

/** px visible at each snap, measured against the live viewport */
function heights(vh: number, top: number): Record<Snap, number> {
  return { peek: 152, half: Math.round(vh * 0.55), full: vh - top - 8 };
}

/** Apple's projection of where a flick would come to rest (decelerationRate 0.998). */
const project = (v: number, rate = 0.998) => ((v / 1000) * rate) / (1 - rate);

/**
 * The phone's plat sheet: a bottom sheet with three snap points in thumb reach. Drag the grip (1:1, respecting the
 * grab offset), flick it (momentum is projected to the nearest snap), or tap / arrow-key the grip to step between
 * snaps: dragging is never the only way. Only the part on screen scrolls, so nothing is reachable only by dragging.
 */
export function MobileSheet({ snap, onSnap, header, children, label }: { snap: Snap; onSnap: (s: Snap) => void; header: ReactNode; children: ReactNode; label: string }) {
  const reduce = useReducedMotion();
  const [vh, setVh] = useState(0);
  const y = useMotionValue(10_000);
  const drag = useRef<{ startY: number; startOffset: number; moved: boolean; samples: { y: number; t: number }[] } | null>(null);

  useEffect(() => {
    const read = () => setVh(window.innerHeight);
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);

  const top = 56;
  const h = vh ? heights(vh, top) : null;
  const full = h?.full ?? 0;
  const offsetFor = useCallback((s: Snap) => (h ? full - h[s] : 0), [h, full]);

  // settle on the snap (spring from wherever the sheet is now; interruptible)
  useEffect(() => {
    if (!h) return;
    const target = offsetFor(snap);
    if (y.get() > full) {
      y.set(target);
      return;
    }
    const c = animate(y, target, reduce ? { duration: 0 } : { type: "spring", duration: 0.4, bounce: 0 });
    return () => c.stop();
  }, [snap, h, full, offsetFor, reduce, y]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || drag.current) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, startOffset: y.get(), moved: false, samples: [{ y: e.clientY, t: e.timeStamp }] };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.abs(dy) < 8) return; // hysteresis before committing to a drag
    d.moved = true;
    let next = d.startOffset + dy;
    // rubber-band past the ends instead of a hard stop
    const min = 0;
    const max = offsetFor("peek");
    if (next < min) next = min - Math.sqrt(min - next) * 4;
    if (next > max) next = max + Math.sqrt(next - max) * 4;
    y.set(next);
    d.samples = [...d.samples.slice(-4), { y: e.clientY, t: e.timeStamp }];
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      // a tap steps up, and from full back down to the summary
      const i = ORDER.indexOf(snap);
      onSnap(i === ORDER.length - 1 ? "peek" : ORDER[i + 1]);
      return;
    }
    const a = d.samples[0];
    const b = d.samples[d.samples.length - 1];
    const v = b.t > a.t ? ((b.y - a.y) / (b.t - a.t)) * 1000 : 0; // px/s, down is positive
    const rest = y.get() + project(v);
    const nearest = ORDER.reduce((best, s) => (Math.abs(offsetFor(s) - rest) < Math.abs(offsetFor(best) - rest) ? s : best), snap);
    if (nearest === snap) {
      animate(y, offsetFor(snap), reduce ? { duration: 0 } : { type: "spring", duration: 0.4, bounce: 0, velocity: v });
    } else {
      // a flick carried momentum: a touch of bounce, and the release velocity handed to the spring
      animate(y, offsetFor(nearest), reduce ? { duration: 0 } : { type: "spring", duration: 0.4, bounce: Math.abs(v) > 600 ? 0.15 : 0, velocity: v });
      onSnap(nearest);
    }
    void e;
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = ORDER.indexOf(snap);
    if (e.key === "ArrowUp" && i < ORDER.length - 1) onSnap(ORDER[i + 1]);
    else if (e.key === "ArrowDown" && i > 0) onSnap(ORDER[i - 1]);
    else if (e.key === "Home") onSnap("full");
    else if (e.key === "End") onSnap("peek");
    else return;
    e.preventDefault();
  };

  return (
    <motion.aside
      aria-label={label}
      id="ws-sheet"
      className="fixed inset-x-0 bottom-0 z-20 flex flex-col overflow-hidden rounded-t-[0.25rem] border-t border-ink bg-paper text-ink"
      style={{ height: full || "60dvh", y, visibility: h ? "visible" : "hidden" }}
    >
      <button
        type="button"
        className="ws-sheet-handle flex h-7 w-full shrink-0 items-center justify-center"
        aria-label={`Sheet, ${SNAP_TEXT[snap]}. Tap or use arrow keys to resize`}
        aria-expanded={snap !== "peek"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <span aria-hidden className="h-1 w-10 rounded-full bg-rule-strong" />
      </button>
      {header}
      {/* only the visible part scrolls: its height follows the settled snap */}
      <div className="min-h-0 overflow-y-auto overscroll-contain" style={{ height: h ? h[snap] - 28 - 48 - 36 : undefined }} tabIndex={0} aria-label="Sheet content">
        {children}
      </div>
    </motion.aside>
  );
}
