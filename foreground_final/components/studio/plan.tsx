"use client";

import { animate, AnimatePresence, motion, useMotionValue, useMotionValueEvent, useReducedMotion } from "motion/react";
import { memo, useEffect, useImperativeHandle, useMemo, useRef, type KeyboardEvent, type PointerEvent, type Ref } from "react";
import { ITEM_SPECS, OUTWARD, itemRect, patioRect, seatPoints, snap, type DaySim, type Item, type Layout, type Pt, type ZoneKind } from "@/lib/layout";

const TILT_X = 54;
const TILT_Z = -26;
const TILT_SCALE = 0.86;
const rad = (deg: number) => (deg * Math.PI) / 180;
/** in-plane offset that looks like one metre of height once the plane is tilted */
const extrusion = (t: number): Pt => {
  const k = Math.tan(rad(TILT_X * t));
  return [-k * Math.sin(rad(TILT_Z * t)), -k * Math.cos(rad(TILT_Z * t))];
};
const SPRING = { type: "spring", bounce: 0, duration: 0.45 } as const;

const ZONE_LABEL: Record<ZoneKind, string> = { kitchen: "Kitchen", dining: "Dining", bar: "Bar", restroom: "Restroom", storage: "Storage", entry: "Entry" };
const ZONE_FILL: Record<ZoneKind, string> = {
  kitchen: "url(#fg-hatch)",
  dining: "transparent",
  bar: "var(--paper-2)",
  restroom: "var(--paper-2)",
  storage: "var(--paper-2)",
  entry: "transparent",
};

export type PlanHandle = { simReset: () => void };
export type SimTick = { minute: number; seated: number; served: number; walked: number; queue: number; done: boolean };

type Props = {
  layout: Layout;
  selectedId: string | null;
  flagged: Set<string>;
  tilt: boolean;
  /** bumps when a change should fly (instructions, concept, undo), not on drags */
  flight: number;
  sim: DaySim | null;
  simPlaying: boolean;
  simSpeed: number;
  onSimTick: (t: SimTick) => void;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
  onPreview: (id: string | null, x: number, y: number) => void;
  onKey: (id: string, e: KeyboardEvent) => void;
  ref?: Ref<PlanHandle>;
};

export function Plan({ layout, selectedId, flagged, tilt, flight, sim, simPlaying, simSpeed, onSimTick, onSelect, onMove, onPreview, onKey, ref }: Props) {
  const reduce = useReducedMotion();
  const fp = layout.footprint;
  const patio = patioRect(layout);
  const view = useMemo(() => {
    const m = 0.9;
    const x0 = Math.min(0, patio.x) - m;
    const y0 = Math.min(0, patio.y) - m;
    const x1 = Math.max(fp.w, patio.x + patio.w) + m;
    const y1 = Math.max(fp.d, patio.y + patio.d) + m + 1.1;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }, [fp.w, fp.d, patio.x, patio.y, patio.w, patio.d]);
  const fs = Math.max(0.3, view.w / 62);

  const stage = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const t = useMotionValue(0);
  const up = useRef<Pt>([0, -0.7]);
  const applyTilt = (v: number) => {
    const [ex, ey] = extrusion(v);
    up.current = v < 0.02 ? [0, -0.7] : [ex, ey];
    svg.current?.style.setProperty("--ex", String(ex));
    svg.current?.style.setProperty("--ey", String(ey));
    if (stage.current) stage.current.style.transform = `rotateX(${TILT_X * v}deg) rotateZ(${TILT_Z * v}deg) scale(${1 - (1 - TILT_SCALE) * v})`;
  };
  useMotionValueEvent(t, "change", applyTilt);
  useEffect(() => {
    const controls = animate(t, tilt ? 1 : 0, reduce ? { duration: 0 } : { type: "spring", bounce: 0.14, duration: 0.8 });
    return () => controls.stop();
  }, [tilt, reduce, t]);

  /** Screen point to plan metres, undoing the tilt (orthographic, so it inverts exactly). */
  const toPlan = (clientX: number, clientY: number): Pt => {
    const el = stage.current!;
    const box = el.getBoundingClientRect();
    const W = el.offsetWidth;
    const H = el.offsetHeight;
    const v = t.get();
    const s = 1 - (1 - TILT_SCALE) * v;
    const a = rad(TILT_X * v);
    const b = rad(TILT_Z * v);
    const u = (clientX - (box.left + box.width / 2)) / s;
    const w = (clientY - (box.top + box.height / 2)) / (s * Math.cos(a));
    const lx = u * Math.cos(b) + w * Math.sin(b) + W / 2;
    const ly = -u * Math.sin(b) + w * Math.cos(b) + H / 2;
    return [view.x + (lx / W) * view.w, view.y + (ly / H) * view.h];
  };

  // far pieces first, so near blocks overlap them once tilted
  const ordered = useMemo(() => [...layout.items].sort((p, q) => q.x * 0.47 - q.y * 0.88 - (p.x * 0.47 - p.y * 0.88)), [layout.items]);
  const order = useMemo(() => new Map(layout.items.map((it, n) => [it.id, n])), [layout.items]);
  const out = OUTWARD[layout.front];
  const door = layout.entry;
  const bar = fp.w > 24 ? 10 : 5;

  return (
    <div className="relative overflow-hidden rounded-sm border border-ink bg-paper-2/50" style={{ perspective: "none" }}>
      <div ref={stage} className="will-change-transform" style={{ aspectRatio: `${view.w} / ${view.h}`, transformOrigin: "50% 50%" }}>
        <svg
          ref={svg}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          className="block h-full w-full select-none"
          role="group"
          aria-label={`Floor plan, ${fp.w.toFixed(1)} by ${fp.d.toFixed(1)} metres. ${layout.items.length} pieces. Use Tab to pick a piece, arrow keys to move it, R to rotate, Backspace to remove.`}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget || (e.target as Element).hasAttribute("data-floor")) onSelect(null);
          }}
        >
          <defs>
            <pattern id="fg-hatch" width="0.5" height="0.5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="0.5" stroke="var(--ink)" strokeOpacity="0.16" strokeWidth="0.05" />
            </pattern>
            <pattern id="fg-clash" width="0.3" height="0.3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="0.3" stroke="var(--needed)" strokeWidth="0.08" />
            </pattern>
            <pattern id="fg-grid" width="1" height="1" patternUnits="userSpaceOnUse">
              <path d="M1 0H0V1" fill="none" stroke="var(--rule)" strokeWidth="0.02" />
            </pattern>
            <clipPath id="fg-floor">{fp.rooms ? fp.rooms.map((r, i) => <polygon key={i} points={r.polygon.join(" ")} />) : <rect width={fp.w} height={fp.d} />}</clipPath>
          </defs>

          {/* patio strip */}
          <rect x={patio.x} y={patio.y} width={patio.w} height={patio.d} fill="none" stroke="var(--rule-strong)" strokeWidth={0.04} strokeDasharray="0.3 0.2" />
          <text x={patio.x + 0.2} y={patio.y + patio.d - 0.25} fontSize={fs * 0.8} fill="var(--ink-2)" className="font-mono">
            patio, if permitted
          </text>

          {/* floor */}
          <g data-floor>
            {fp.rooms ? (
              fp.rooms.map((r, i) => <polygon key={i} data-floor points={r.polygon.join(" ")} fill="var(--paper)" stroke="var(--ink)" strokeWidth={0.07} strokeLinejoin="round" />)
            ) : (
              <rect data-floor width={fp.w} height={fp.d} fill="var(--paper)" stroke="var(--ink)" strokeWidth={0.09} />
            )}
            <rect width={fp.w} height={fp.d} fill="url(#fg-grid)" clipPath="url(#fg-floor)" pointerEvents="none" />
          </g>
          <g clipPath="url(#fg-floor)" pointerEvents="none">
            {layout.zones.map((z) => (
              <g key={z.id}>
                {z.polygon ? <polygon points={z.polygon.join(" ")} fill={ZONE_FILL[z.kind]} /> : <rect x={z.x} y={z.y} width={z.w} height={z.d} fill={ZONE_FILL[z.kind]} stroke="var(--rule-strong)" strokeWidth={0.03} strokeDasharray="0.25 0.2" />}
                {z.w * z.d > 5 ? (
                  <text x={z.x + 0.25} y={z.y + fs + 0.15} fontSize={fs * 0.85} fontWeight={500} fill="var(--ink-2)" style={{ letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    {ZONE_LABEL[z.kind]}
                  </text>
                ) : null}
              </g>
            ))}
          </g>

          {/* door and storefront */}
          <g pointerEvents="none">
            <circle cx={door[0]} cy={door[1]} r={0.16} fill="var(--ink)" />
            <text x={door[0] + out[0] * 0.5 + (out[0] === 0 ? 0.3 : out[0] < 0 ? -0.2 : 0.2)} y={door[1] + out[1] * 0.6 + 0.12} fontSize={fs * 0.8} textAnchor={out[0] < 0 ? "end" : "start"} fill="var(--ink)" className="font-mono">
              door
            </text>
            {layout.kitchenAnchor ? (
              <g transform={`translate(${layout.kitchenAnchor[0]} ${layout.kitchenAnchor[1]})`} stroke="var(--saved)" strokeWidth={0.05}>
                <circle r={0.32} fill="none" />
                <path d="M-0.5 0H0.5M0 -0.5V0.5" />
              </g>
            ) : null}
          </g>

          <AnimatePresence initial={false}>
            {ordered.map((it) => (
              <motion.g key={it.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.18 }}>
                <ItemView item={it} index={order.get(it.id) ?? 0} selected={it.id === selectedId} clash={flagged.has(it.id)} flight={flight} fs={fs} up={up} toPlan={toPlan} reduce={Boolean(reduce)} onSelect={onSelect} onMove={onMove} onPreview={onPreview} onKey={onKey} />
              </motion.g>
            ))}
          </AnimatePresence>

          <SimLayer ref={ref} layout={layout} sim={sim} playing={simPlaying} speed={simSpeed} onTick={onSimTick} reduce={Boolean(reduce)} />

          {/* scale bar */}
          <g transform={`translate(0 ${fp.d + (layout.front === "bottom" ? patio.d : 0) + 1})`} pointerEvents="none" stroke="var(--ink)" strokeWidth={0.05}>
            <path d={`M0 0H${bar}M0 -0.2V0.2M${bar / 2} -0.12V0.12M${bar} -0.2V0.2`} fill="none" />
            <text x={bar + 0.35} y={0.14} fontSize={fs * 0.8} stroke="none" fill="var(--ink-2)" className="font-mono">
              {bar} m · {Math.round(bar * 3.281)} ft
            </text>
          </g>
        </svg>
      </div>
    </div>
  );
}

type ItemProps = {
  item: Item;
  index: number;
  selected: boolean;
  clash: boolean;
  flight: number;
  fs: number;
  up: { current: Pt };
  toPlan: (x: number, y: number) => Pt;
  reduce: boolean;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
  onPreview: (id: string | null, x: number, y: number) => void;
  onKey: (id: string, e: KeyboardEvent) => void;
};

const ItemView = memo(function ItemView({ item, index, selected, clash, flight, fs, up, toPlan, reduce, onSelect, onMove, onPreview, onKey }: ItemProps) {
  const g = useRef<SVGGElement>(null);
  const mx = useMotionValue(item.x);
  const my = useMotionValue(item.y);
  // 1 while the piece is in the air: arrivals drop in, instructed moves hop along an arc
  const lift = useMotionValue(reduce ? 0 : 1);
  const drag = useRef<{ dx: number; dy: number; moved: boolean; sx: number; sy: number } | null>(null);
  const lastFlight = useRef(flight);
  const running = useRef<{ stop: () => void }[]>([]);

  useEffect(() => {
    const write = () => {
      const l = lift.get();
      if (g.current) g.current.style.transform = `translate(${mx.get() + up.current[0] * l}px, ${my.get() + up.current[1] * l}px)`;
    };
    write();
    const off = [mx.on("change", write), my.on("change", write), lift.on("change", write)];
    return () => off.forEach((f) => f());
  }, [mx, my, lift, up]);

  useEffect(() => {
    const controls = animate(lift, 0, reduce ? { duration: 0 } : { ...SPRING, duration: 0.5, delay: Math.min(index * 0.012, 0.35) });
    return () => controls.stop();
    // arrival only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (drag.current) return;
    const flying = flight !== lastFlight.current;
    lastFlight.current = flight;
    const far = Math.hypot(item.x - mx.get(), item.y - my.get()) > 0.3;
    if (!far && mx.get() === item.x && my.get() === item.y) return;
    running.current.forEach((c) => c.stop());
    if (reduce) {
      mx.set(item.x);
      my.set(item.y);
      return;
    }
    const delay = flying ? Math.min(index * 0.016, 0.4) : 0;
    const move = flying && far ? { type: "spring", bounce: 0, duration: 0.6, delay } as const : SPRING;
    running.current = [animate(mx, item.x, move), animate(my, item.y, move)];
    if (flying && far) running.current.push(animate(lift, [lift.get(), 0.9, 0], { duration: 0.6, delay, times: [0, 0.45, 1], ease: ["easeOut", "easeIn"] }));
  }, [item.x, item.y, flight, index, reduce, mx, my, lift]);

  const spec = ITEM_SPECS[item.type];
  const box = itemRect({ ...item, x: 0, y: 0 });
  const h = spec.h;
  const ex = `calc(var(--ex, 0) * ${h})`;
  const ey = `calc(var(--ey, 0) * ${h})`;

  const down = (e: PointerEvent<SVGGElement>) => {
    if (e.button !== 0 || drag.current) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* a synthetic or already-ended pointer cannot be captured; the drag still works inside the piece */
    }
    running.current.forEach((c) => c.stop());
    lift.set(0);
    const p = toPlan(e.clientX, e.clientY);
    drag.current = { dx: p[0] - mx.get(), dy: p[1] - my.get(), moved: false, sx: e.clientX, sy: e.clientY };
    onSelect(item.id);
  };
  const moveTo = (e: PointerEvent<SVGGElement>) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
    d.moved = true;
    const p = toPlan(e.clientX, e.clientY);
    mx.set(p[0] - d.dx);
    my.set(p[1] - d.dy);
    onPreview(item.id, snap(mx.get()), snap(my.get()));
  };
  const end = (e: PointerEvent<SVGGElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    onPreview(null, 0, 0);
    if (!d.moved) return;
    const x = snap(mx.get());
    const y = snap(my.get());
    if (x === item.x && y === item.y) running.current = [animate(mx, x, SPRING), animate(my, y, SPRING)];
    else onMove(item.id, x, y);
  };

  const stroke = clash ? "var(--needed)" : "var(--ink)";
  return (
    <g
      ref={g}
      tabIndex={0}
      role="button"
      aria-label={`${spec.label}${spec.seats ? `, ${spec.seats} seats` : ""}, ${item.x.toFixed(1)} m across, ${item.y.toFixed(1)} m down${clash ? ", overlapping or off the floor" : ""}`}
      aria-pressed={selected}
      data-item={item.type}
      className="cursor-grab touch-none outline-none active:cursor-grabbing"
      onPointerDown={down}
      onPointerMove={moveTo}
      onPointerUp={end}
      onPointerCancel={end}
      onFocus={() => onSelect(item.id)}
      onKeyDown={(e) => onKey(item.id, e)}
    >
      {/* generous hit area for fingers */}
      <rect x={Math.min(box.x, -0.45)} y={Math.min(box.y, -0.45)} width={Math.max(box.w, 0.9)} height={Math.max(box.d, 0.9)} fill="transparent" />
      {/* two visible walls of the block; they have no area until the plan tilts */}
      <rect width={1} height={1} fill="var(--rule)" stroke={stroke} strokeWidth={0.03} vectorEffect="non-scaling-stroke" style={{ transform: `matrix(0, ${box.d}, ${ex}, ${ey}, ${box.x}, ${box.y})` }} />
      <rect width={1} height={1} fill="var(--paper-2)" stroke={stroke} strokeWidth={0.03} vectorEffect="non-scaling-stroke" style={{ transform: `matrix(${box.w}, 0, ${ex}, ${ey}, ${box.x}, ${box.y + box.d})` }} />
      <g style={{ transform: `translate(calc(${ex} * 1px), calc(${ey} * 1px))` }}>
        <g transform={`rotate(${item.rotation})`}>
          <Glyph item={item} stroke={stroke} fs={fs} />
        </g>
        {clash ? <rect x={box.x} y={box.y} width={box.w} height={box.d} fill="url(#fg-clash)" opacity={0.55} pointerEvents="none" /> : null}
        {selected ? <rect x={box.x - 0.12} y={box.y - 0.12} width={box.w + 0.24} height={box.d + 0.24} fill="none" stroke="var(--ring)" strokeWidth={2} vectorEffect="non-scaling-stroke" rx={0.05} pointerEvents="none" /> : null}
      </g>
    </g>
  );
});

function Glyph({ item, stroke, fs }: { item: Item; stroke: string; fs: number }) {
  const { w, d, type } = item;
  const line = { stroke, strokeWidth: 0.05, fill: "var(--paper)" } as const;
  const label = (text: string) => (
    <text y={fs * 0.3} textAnchor="middle" fontSize={fs * 0.8} fill="var(--ink)" fontWeight={600} transform={`rotate(${-item.rotation})`} pointerEvents="none">
      {text}
    </text>
  );
  const seats = ITEM_SPECS[type].seats;
  if (type === "bar-stool") return <circle r={0.2} {...line} />;
  if (seats > 0) {
    const chairs = seatPoints({ items: [{ ...item, x: 0, y: 0, rotation: 0 }] });
    const longW = w >= d;
    return (
      <>
        {chairs.map(([x, y], i) => (type === "booth" ? null : <rect key={i} x={x - 0.19} y={y - 0.19} width={0.38} height={0.38} rx={0.08} {...line} />))}
        {type === "booth" ? (
          <>
            <rect x={-w / 2} y={-d / 2} width={0.32} height={d} {...line} fill="var(--paper-2)" />
            <rect x={w / 2 - 0.32} y={-d / 2} width={0.32} height={d} {...line} fill="var(--paper-2)" />
            <rect x={-0.24} y={-d / 2 + 0.1} width={0.48} height={d - 0.2} {...line} />
          </>
        ) : (
          <rect x={longW ? -w * 0.4 : -w * 0.24} y={longW ? -d * 0.24 : -d * 0.4} width={longW ? w * 0.8 : w * 0.48} height={longW ? d * 0.48 : d * 0.8} rx={0.04} {...line} strokeDasharray={type === "patio-table" ? "0.15 0.1" : undefined} />
        )}
      </>
    );
  }
  const body = <rect x={-w / 2} y={-d / 2} width={w} height={d} {...line} fill={type === "kitchen-line" ? "url(#fg-hatch)" : type === "bar-counter" || type === "counter" ? "var(--paper-2)" : "var(--paper)"} />;
  return (
    <>
      <rect x={-w / 2} y={-d / 2} width={w} height={d} fill="var(--paper)" />
      {body}
      {type === "walk-in" ? <path d={`M${-w / 2} ${-d / 2}L${w / 2} ${d / 2}M${w / 2} ${-d / 2}L${-w / 2} ${d / 2}`} stroke={stroke} strokeWidth={0.03} /> : null}
      {type === "bar-counter" ? <line x1={-w / 2 + 0.1} x2={w / 2 - 0.1} y1={0} y2={0} stroke={stroke} strokeWidth={0.03} /> : null}
      {type === "kitchen-line" ? label("LINE") : type === "restroom" ? label("WC") : type === "walk-in" ? label("COOLER") : type === "prep" ? label("PREP") : type === "bar-counter" ? null : type === "counter" ? label("ORDER") : label("HOST")}
    </>
  );
}

const WALK = 5; // sim minutes to cross the room
const QUEUE_SHOWN = 22;

/** The day simulator's guests: a fixed pool of dots moved by one requestAnimationFrame loop, never by React. */
function SimLayer({ layout, sim, playing, speed, onTick, reduce, ref }: { layout: Layout; sim: DaySim | null; playing: boolean; speed: number; onTick: (t: SimTick) => void; reduce: boolean; ref?: Ref<PlanHandle> }) {
  const layer = useRef<SVGGElement>(null);
  const clock = useRef(0);
  const seats = useMemo(() => seatPoints(layout), [layout]);
  const pool = sim ? Math.min(220, sim.seats + QUEUE_SHOWN + 30) : 0;
  const live = useRef({ speed, onTick });
  live.current = { speed, onTick };
  useImperativeHandle(ref, () => ({ simReset: () => void (clock.current = 0) }), []);

  useEffect(() => {
    if (!sim || !layer.current) return;
    const dots = Array.from(layer.current.querySelectorAll<SVGCircleElement>("circle"));
    const door = layout.entry;
    const out = OUTWARD[layout.front];
    const ease = (k: number) => 1 - (1 - k) * (1 - k);
    const draw = (T: number) => {
      let n = 0;
      let queue = 0;
      let seated = 0;
      let served = 0;
      let walked = 0;
      const place = (x: number, y: number, waiting: boolean, alpha = 1) => {
        const dot = dots[n++];
        if (!dot) return;
        dot.style.transform = `translate(${x}px, ${y}px)`;
        dot.style.opacity = String(alpha);
        dot.style.fill = waiting ? "var(--needed)" : "var(--ink)";
      };
      for (const guest of sim.guests) {
        if (guest.arrive > T) break;
        if (T < guest.seatAt || guest.seatAt < 0) {
          const q = queue++;
          if (q < QUEUE_SHOWN) place(door[0] + out[0] * (0.7 + q * 0.42), door[1] + out[1] * (0.7 + q * 0.42), T - guest.arrive > sim.patience / 2);
          continue;
        }
        if (guest.seat < 0) {
          walked++;
          const k = (T - guest.seatAt) / WALK;
          if (k < 1) place(door[0] + out[0] * (0.7 + k * 3) + out[1] * k * 2, door[1] + out[1] * (0.7 + k * 3) + out[0] * k * 2, true, 1 - k);
          continue;
        }
        served++;
        const s = seats[guest.seat];
        if (!s) continue;
        const sinceSit = T - guest.seatAt;
        const sinceUp = T - guest.leaveAt;
        if (sinceSit < WALK) {
          const k = ease(sinceSit / WALK);
          place(door[0] + (s[0] - door[0]) * k, door[1] + (s[1] - door[1]) * k, false);
        } else if (sinceUp < 0) {
          seated++;
          place(s[0], s[1], false);
        } else if (sinceUp < WALK) {
          const k = ease(sinceUp / WALK);
          place(s[0] + (door[0] - s[0]) * k, s[1] + (door[1] - s[1]) * k, false, 1 - k * 0.6);
        }
      }
      for (; n < dots.length; n++) dots[n].style.opacity = "0";
      return { minute: Math.min(T, sim.minutes), seated, served, walked, queue, done: T >= sim.minutes + sim.dwell };
    };

    if (reduce) {
      // no travel: show the busiest moment of the day as a still
      let peak = 0;
      let at = 0;
      for (let m = 0; m < sim.minutes; m += 5) {
        const q = sim.guests.filter((g) => g.arrive <= m && (g.seatAt < 0 || g.seatAt > m)).length;
        if (q >= peak) [peak, at] = [q, m];
      }
      live.current.onTick({ ...draw(at), done: true });
      return;
    }
    if (!playing) {
      draw(clock.current);
      return;
    }
    let frame = 0;
    let last = performance.now();
    let lastTick = 0;
    const loop = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      // one service day in about 40 seconds at 1x
      clock.current += (dt / 1000) * (sim.minutes / 40) * live.current.speed;
      const state = draw(clock.current);
      if (now - lastTick > 120 || state.done) {
        lastTick = now;
        live.current.onTick(state);
      }
      if (!state.done && !document.hidden) frame = requestAnimationFrame(loop);
      else if (!state.done) frame = window.setTimeout(() => (frame = requestAnimationFrame(loop)), 500) as unknown as number;
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [sim, playing, seats, layout.entry, layout.front, reduce]);

  if (!sim) return null;
  return (
    <g ref={layer} pointerEvents="none" aria-hidden>
      {Array.from({ length: pool }, (_, i) => (
        <circle key={i} r={0.17} stroke="var(--paper)" strokeWidth={0.04} style={{ opacity: 0 }} />
      ))}
    </g>
  );
}
