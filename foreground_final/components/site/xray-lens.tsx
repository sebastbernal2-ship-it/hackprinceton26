"use client";

import Image from "next/image";
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { linkProps, useFocusedFinding, usePanoRequest } from "./focus-store";
import { DUR, EASE_IN_OUT, SPRING } from "./motion-tokens";

export type LensPair = { panoId: string; before: string; after: string | null; caption?: string };

export type LensCallout = {
  /** focus key shared with the cost row and the tour pin */
  key: string;
  panoId: string;
  label: string;
  tone: "needed" | "saved" | "maybe" | "info";
  /** "You pay $20k–$60k", "Saves $28k–$45k", ... */
  cost: string;
};

const TONE = {
  needed: { dot: "bg-needed text-needed", text: "text-needed" },
  saved: { dot: "bg-saved text-saved", text: "text-saved" },
  maybe: { dot: "bg-maybe text-maybe-ink", text: "text-maybe-ink" },
  info: { dot: "bg-ink-2 text-ink-2", text: "text-ink-2" },
} as const;

const SIZES = "(min-width: 1024px) 45vw, 100vw";

/**
 * The X-ray lens: outside the circle the room as scanned, inside it the same camera with the furniture removed, and
 * the infrastructure that camera saw riding the rim as callouts with their cost. Composite-only: the lens and the
 * counter-moving empty image are both transforms driven by one spring.
 * Mouse: the lens follows. Touch / pen: drag the lens, or tap to send it. Keyboard: arrows (Shift for big steps),
 * Home / End.
 */
export function XRayLens({ pairs, callouts }: { pairs: LensPair[]; callouts: LensCallout[] }) {
  const usable = pairs.filter((p): p is LensPair & { after: string } => Boolean(p.after));
  const [index, setIndex] = useState(() => {
    // open on the camera with the most findings
    let best = 0;
    usable.forEach((p, i) => {
      if (callouts.filter((c) => c.panoId === p.panoId).length > callouts.filter((c) => c.panoId === usable[best].panoId).length) best = i;
    });
    return best;
  });
  const [flash, setFlash] = useState<string | null>(null);
  const request = usePanoRequest();
  const lastRequest = useRef(request.n);

  useEffect(() => {
    if (request.n === lastRequest.current) return;
    lastRequest.current = request.n;
    const i = usable.findIndex((p) => p.panoId === request.pano);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (i >= 0) setIndex(i);
    setFlash(request.finding);
    const t = setTimeout(() => setFlash(null), 2600);
    return () => clearTimeout(t);
  }, [request.n, request.pano, request.finding, usable]);

  if (usable.length === 0) return null;
  const pair = usable[Math.min(index, usable.length - 1)];
  const here = callouts.filter((c) => c.panoId === pair.panoId);

  return (
    <div className="flex flex-col gap-3">
      <Lens key={pair.panoId} pair={pair} callouts={here} flash={flash} />
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <p className="max-w-prose text-sm text-ink-2">
          {pair.caption ? <span className="font-medium text-ink">{pair.caption}. </span> : null}
          Outside the lens, the room as scanned. Inside it, the same camera with the furniture removed
          {here.length > 0 ? `; ${here.length} finding${here.length > 1 ? "s" : ""} from this camera ride the rim.` : "."}
        </p>
        <span className="font-mono text-[0.6875rem] text-ink-2">src Matterport scan, furniture-removed view</span>
      </div>
      {usable.length > 1 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Camera position">
          {usable.map((p, i) => {
            const n = callouts.filter((c) => c.panoId === p.panoId).length;
            return (
              <button
                key={p.panoId}
                type="button"
                aria-pressed={i === index}
                aria-label={`${p.caption ?? `View ${i + 1}`}${n ? `, ${n} findings` : ""}`}
                onClick={() => setIndex(i)}
                className={cn(
                  "group relative h-14 w-20 overflow-hidden rounded-sm border transition-[border-color,transform] duration-150 active:scale-[0.97]",
                  i === index ? "border-2 border-ink" : "border-rule-strong hover:border-ink",
                )}
              >
                <Image src={p.after} alt="" fill sizes="80px" className="object-cover transition-transform duration-300 ease-out [@media(hover:hover)]:group-hover:scale-105" />
                {n ? (
                  <span className="absolute right-1 bottom-1 rounded-sm bg-ink px-1 font-mono text-[0.625rem] leading-tight text-on-ink">{n}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function Lens({ pair, callouts, flash }: { pair: LensPair & { after: string }; callouts: LensCallout[]; flash: string | null }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const reduce = useReducedMotion();
  const inView = useInView(box, { once: true, amount: 0.5 });
  const focused = useFocusedFinding();
  const [dragging, setDragging] = useState(false);
  const [touched, setTouched] = useState(false);

  // lens centre as fractions of the frame; springs smooth the pointer, then pixels are derived
  const fx = useMotionValue(0.5);
  const fy = useMotionValue(0.55);
  const sx = useSpring(fx, reduce ? { stiffness: 10000, damping: 1000 } : SPRING.follow);
  const sy = useSpring(fy, reduce ? { stiffness: 10000, damping: 1000 } : SPRING.follow);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const D = Math.round(Math.min(size.w, size.h) * (size.w < 480 ? 0.46 : 0.4));
  const R = D / 2;
  const lx = useTransform(sx, (v) => v * size.w - R);
  const ly = useTransform(sy, (v) => v * size.h - R);
  const ix = useTransform(lx, (v) => -v);
  const iy = useTransform(ly, (v) => -v);

  // callouts ride whichever side of the lens has room
  const [side, setSide] = useState<"right" | "left">("right");
  useMotionValueEvent(sx, "change", (v) => {
    const next = v > 0.56 ? "left" : v < 0.44 ? "right" : side;
    if (next !== side) setSide(next);
  });
  const [pct, setPct] = useState({ x: 50, y: 55 });

  // one demonstrative sweep the first time the lens comes into view, until the reader takes over
  useEffect(() => {
    if (!inView || reduce || touched) return;
    const a = animate(fx, [0.22, 0.72, 0.5], { duration: 2.4, ease: EASE_IN_OUT, times: [0, 0.6, 1] });
    const b = animate(fy, [0.45, 0.62, 0.55], { duration: 2.4, ease: EASE_IN_OUT, times: [0, 0.6, 1] });
    return () => {
      a.stop();
      b.stop();
    };
    // the sweep runs once, on arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView]);

  const setFrom = (clientX: number, clientY: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    fx.set(clamp((clientX - r.left) / r.width, 0.04, 0.96));
    fy.set(clamp((clientY - r.top) / r.height, 0.04, 0.96));
  };
  const takeOver = () => {
    if (!touched) setTouched(true);
    fx.stop();
    fy.stop();
  };

  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey || e.key.startsWith("Page") ? 0.1 : 0.03;
    let x = fx.get();
    let y = fy.get();
    if (e.key === "ArrowLeft") x -= step;
    else if (e.key === "ArrowRight") x += step;
    else if (e.key === "ArrowUp" || e.key === "PageUp") y -= step;
    else if (e.key === "ArrowDown" || e.key === "PageDown") y += step;
    else if (e.key === "Home") x = 0.04;
    else if (e.key === "End") x = 0.96;
    else return;
    e.preventDefault();
    takeOver();
    fx.set(clamp(x, 0.04, 0.96));
    fy.set(clamp(y, 0.04, 0.96));
    // only the keyboard path re-renders for the value text; pointer moves stay off React
    setPct({ x: Math.round(fx.get() * 100), y: Math.round(fy.get() * 100) });
  };

  const ready = size.w > 0;

  return (
    <div
      ref={box}
      role="slider"
      tabIndex={0}
      aria-label="X-ray lens: move to see the room with furniture removed"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct.x}
      aria-valuetext={`Lens ${pct.x}% across, ${pct.y}% down. ${callouts.map((c) => `${c.label}: ${c.cost}`).join(". ")}`}
      onKeyDown={onKey}
      onPointerMove={(e) => {
        if (e.pointerType === "mouse" || dragging) {
          takeOver();
          setFrom(e.clientX, e.clientY);
        }
      }}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse") return;
        takeOver();
        setFrom(e.clientX, e.clientY);
      }}
      className={cn(
        "relative aspect-square w-full touch-pan-y overflow-hidden rounded-sm border border-ink bg-ink select-none sm:aspect-[4/3]",
        "cursor-none",
      )}
    >
      <Image src={pair.before} alt="The room as scanned, furnished" fill sizes={SIZES} className="object-cover" draggable={false} priority={false} />
      <span className="pointer-events-none absolute top-2 left-2 rounded-sm bg-ink/85 px-2 py-1 text-xs font-medium text-on-ink">Furnished, as scanned</span>

      {ready ? (
        <motion.div
          className="absolute top-0 left-0 touch-none"
          style={{ x: lx, y: ly, width: D, height: D, willChange: "transform" }}
          onPointerDown={(e) => {
            if (e.pointerType === "mouse") return;
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            takeOver();
            setDragging(true);
          }}
          onPointerMove={(e) => {
            if (dragging) setFrom(e.clientX, e.clientY);
          }}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
        >
          {/* the empty room, counter-moved so it stays registered with the furnished one */}
          <div className="absolute inset-0 overflow-hidden rounded-full">
            <motion.div className="absolute top-0 left-0" style={{ x: ix, y: iy, width: size.w, height: size.h }}>
              <Image src={pair.after} alt="The same view with furniture removed" fill sizes={SIZES} className="object-cover" draggable={false} />
            </motion.div>
          </div>
          <Reticle d={D} dragging={dragging} />

          {/* findings from this camera ride the rim */}
          {callouts.length > 0 ? (
            <ul
              className={cn("absolute top-1/2 flex w-max max-w-[15rem] -translate-y-1/2 flex-col gap-1.5", side === "right" ? "left-full pl-3" : "right-full items-end pr-3")}
              aria-hidden
            >
              {callouts.map((c, i) => {
                const active = focused === c.key || flash === c.key;
                return (
                  <motion.li
                    key={c.key}
                    initial={{ opacity: 0, x: side === "right" ? -6 : 6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: DUR.state, delay: 0.1 + i * 0.06 }}
                    {...linkProps(c.key)}
                    data-active={active}
                    className={cn(
                      "pointer-events-auto flex items-center gap-2 rounded-sm border bg-paper/95 px-2 py-1 text-xs leading-tight transition-[border-color,transform] duration-200",
                      active ? "scale-[1.04] border-ink" : "border-rule-strong",
                    )}
                  >
                    <span aria-hidden className={cn("ping inline-block size-2 shrink-0 rounded-full", TONE[c.tone].dot)} data-active={active} />
                    <span className="flex flex-col">
                      <span className="font-semibold text-ink">{c.label}</span>
                      <span className={cn("lettering font-semibold", TONE[c.tone].text)}>{c.cost}</span>
                    </span>
                  </motion.li>
                );
              })}
            </ul>
          ) : null}
        </motion.div>
      ) : null}

      <span className="pointer-events-none absolute right-2 bottom-2 rounded-sm bg-paper/90 px-2 py-1 text-xs text-ink">
        <span className="font-semibold">Inside the lens:</span> furniture removed
      </span>
    </div>
  );
}

/** Survey reticle: double rim, cross hairs, and quarter ticks. */
function Reticle({ d, dragging }: { d: number; dragging: boolean }) {
  const r = d / 2;
  return (
    <svg aria-hidden width={d} height={d} viewBox={`0 0 ${d} ${d}`} className={cn("absolute inset-0 overflow-visible transition-transform duration-150", dragging && "scale-[0.98]")}>
      <circle cx={r} cy={r} r={r - 1} fill="none" stroke="var(--paper)" strokeWidth={3} />
      <circle cx={r} cy={r} r={r - 1} fill="none" stroke="var(--ink)" strokeWidth={1} />
      {[0, 90, 180, 270].map((a) => (
        <line key={a} x1={r} y1={2} x2={r} y2={12} stroke="var(--paper)" strokeWidth={1.5} transform={`rotate(${a} ${r} ${r})`} />
      ))}
      {Array.from({ length: 24 }, (_, i) => i * 15)
        .filter((a) => a % 90)
        .map((a) => (
          <line key={a} x1={r} y1={2} x2={r} y2={6} stroke="var(--paper)" strokeWidth={1} opacity={0.8} transform={`rotate(${a} ${r} ${r})`} />
        ))}
      <line x1={r - 7} x2={r + 7} y1={r} y2={r} stroke="var(--paper)" strokeWidth={1} />
      <line y1={r - 7} y2={r + 7} x1={r} x2={r} stroke="var(--paper)" strokeWidth={1} />
    </svg>
  );
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
