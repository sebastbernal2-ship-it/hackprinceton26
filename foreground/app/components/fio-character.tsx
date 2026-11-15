"use client";
// Fio the inspector: a small flat-shape character (hard hat, hi-vis vest, clipboard) that lives in the environment.
// Draw it inside any SVG whose user unit is `1 / scale` metres (the planner floor: scale 1, origin 0), or use
// <FioOverlay> as a floating mascot on screens without a floor. It is driven by a queue of timed steps (see lib/fio-steps):
// walkTo / place / lookAt / say / act(plan) all return a promise that resolves when that step has finished.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore } from "react";
import { FioTimeline, readTime, type FioEvent, type FioItem, type FioStep, type Pose } from "../lib/fio-steps";
import type { Pt } from "../lib/planner";

export type FioHandle = {
  /** Walk in a straight line to a point (use act() with a routed path to go around furniture). */
  walkTo(x: number, y: number): Promise<void>;
  /** Pick the piece up (if not already carrying it), walk beside its spot and set it down with a pop. */
  place(item: FioItem): Promise<void>;
  lookAt(x: number, y: number, seconds?: number): Promise<void>;
  say(text: string, seconds?: number): Promise<void>;
  point(x: number, y: number, seconds?: number): Promise<void>;
  think(seconds?: number): Promise<void>;
  celebrate(seconds?: number): Promise<void>;
  /** Queue a whole plan (see lib/fio-plan); resolves when its last step ends. */
  act(plan: FioStep[]): Promise<void>;
  /** Forget everything not yet started. */
  clear(): void;
  position(): Pt;
};

export type FioActorProps = {
  /** Pixels per unit of the coordinates you pass in (px per metre on a px SVG; 1 inside a viewBox that is already in metres). */
  scale?: number;
  origin?: Pt;
  /** Character height in the same units as coordinates (metres on a floor). */
  heightM?: number;
  home?: Pt;
  /** Metres per second. */
  speed?: number;
  onPlace?: (item: FioItem) => void;
  onPick?: (item: FioItem) => void;
  onSay?: (text: string) => void;
  /** Called every frame with the pose, for hosts that want to follow him (e.g. a camera). */
  onPose?: (pose: Pose) => void;
  "data-testid"?: string;
};

const H = 104;

const reducedQuery = "(prefers-reduced-motion: reduce)";
function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(reducedQuery); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
    () => window.matchMedia(reducedQuery).matches,
    () => false,
  );
}

const rad = (d: number) => (d * Math.PI) / 180;
/** End of an arm hanging `len` long from (x, y) at `deg` from straight down (positive swings to +x). */
const hand = (x: number, y: number, deg: number, len: number): Pt => [x + Math.sin(rad(deg)) * len, y + Math.cos(rad(deg)) * len];

function wrap(text: string, max = 24): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/)) {
    if (cur && (cur + " " + w).length > max) { lines.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 5);
}

const SKIN = "#f1d9bd";
const ink = { fill: "var(--foreground)" };

/** The character itself, in local units: feet at (0, 0), about 104 tall, centred on x = 0. Pure function of the pose. */
export function FioFigure({ pose, reduced = false }: { pose: Pose; reduced?: boolean }) {
  const { action, facing, clock: t, phase } = pose;
  const moving = action === "walk" || action === "carry";
  const side = facing === "l" || facing === "r";
  const back = facing === "u";
  const gait = moving && !reduced ? t * 10 : 0;
  const swing = moving && !reduced ? Math.sin(gait) * 26 : 0;
  const bob = reduced ? 0 : moving ? -Math.abs(Math.sin(gait)) * 2.6 : Math.sin(t * 2.2) * 0.7;
  const jump = action === "celebrate" && !reduced ? -Math.abs(Math.sin(phase * Math.PI * 4)) * 14 : 0;
  const lean = action === "place" ? Math.sin(Math.min(1, phase) * Math.PI) * 9 : 0;
  const blink = !reduced && t % 3.7 < 0.13 ? 0.1 : 1;
  const holding = pose.carry !== null && (action === "carry" || action === "pick" || action === "place");
  const cyc = t % 7;
  const check = !reduced && action === "idle" && !pose.say && cyc > 3.4 && cyc < 5 ? Math.sin(((cyc - 3.4) / 1.6) * Math.PI) : 0;
  const lookX = pose.aim ? Math.sign(pose.aim[0] - pose.x) : 0;
  const wob = reduced ? 0 : Math.sin(t * 3);

  // shoulders and arms (local, y down): free arm on +x, clipboard arm on -x (front view)
  const sy = -54 + bob + jump + lean * 0.6;
  const swx = side ? 0 : 17;
  let freeDeg = 8 + (moving ? -swing * 0.9 : 0) + (reduced ? 0 : Math.sin(t * 1.7) * 2);
  let clipDeg = -10;
  if (action === "point") freeDeg = 82;
  if (action === "look") freeDeg = 135 + wob * 6;
  if (action === "think") freeDeg = 150;
  if (action === "celebrate") { freeDeg = 165 + (reduced ? 0 : Math.sin(t * 14) * 10); clipDeg = -165; }
  const lift = holding ? 0 : check;
  const free = hand(swx, sy, freeDeg, 22);
  let clip = hand(-swx, sy, clipDeg, 22);
  if (side) clip = [clip[0] + 10, clip[1]];
  if (lift) clip = [clip[0] + 5 * lift, clip[1] - 20 * lift];
  const boxY = -40 + lean * 2.4 + bob;
  const mag: Pt = [free[0] + 3, free[1] - 6];

  const bodyW = side ? 12 : 17;
  const legX = side ? 4.5 : 7;
  const legSwing = (dir: number) => (moving ? swing * dir : 0);
  const headY = -80 + bob + jump + lean * 0.8;
  const eyeDx = side ? 4 : 0;
  const body = (
    <g>
      {/* legs: rotated about the hip so the gait reads at any size */}
      {[-1, 1].map((d) => (
        <g key={d} transform={`translate(${d * legX} ${-27 + bob + jump}) rotate(${legSwing(d)})`}>
          <rect x={-4.2} y={0} width={8.4} height={25} rx={3.5} style={ink} opacity={0.85} />
          <rect x={-5.2} y={21} width={11} height={6.5} rx={3} style={ink} />
        </g>
      ))}
      {/* torso: green shirt under an hi-vis vest with reflective stripes */}
      <rect x={-bodyW} y={-62 + bob + jump + lean * 0.5} width={bodyW * 2} height={38} rx={9} style={{ fill: "var(--panel)" }} stroke="var(--foreground)" strokeOpacity={0.35} strokeWidth={1} />
      <path d={`M ${-bodyW + 2} ${-60 + bob + jump + lean * 0.5} h ${bodyW * 2 - 4} l ${side ? 0 : -2} 34 h ${-(bodyW * 2 - (side ? 4 : 0))} z`} style={{ fill: "var(--match)" }} opacity={back ? 1 : 0.95} />
      <rect x={-bodyW + 2} y={-46 + bob + jump + lean * 0.5} width={bodyW * 2 - 4} height={3.6} style={{ fill: "var(--background)" }} opacity={0.9} />
      <rect x={-bodyW + 2} y={-37 + bob + jump + lean * 0.5} width={bodyW * 2 - 4} height={3.6} style={{ fill: "var(--background)" }} opacity={0.9} />
      {/* clipboard arm */}
      <line x1={-swx} y1={sy} x2={clip[0]} y2={clip[1]} stroke="var(--match)" strokeWidth={8} strokeLinecap="round" />
      {!back && !holding && action !== "celebrate" && (
        <g transform={`translate(${clip[0]} ${clip[1] + 1}) rotate(${-8 * (1 - lift)})`}>
          <rect x={-8} y={-12} width={16} height={22} rx={2} style={{ fill: "var(--panel)" }} stroke="var(--foreground)" strokeWidth={1.3} />
          <rect x={-3.5} y={-14} width={7} height={4} rx={1.2} style={ink} />
          <path d="M -4.5 0 l 3 3.5 l 6 -8" fill="none" stroke="var(--accent)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={20} strokeDashoffset={lift ? 20 * (1 - Math.min(1, lift * 1.6)) : 0} opacity={lift ? 1 : 0.9} />
          <line x1={-4.5} y1={7} x2={4.5} y2={7} stroke="var(--foreground)" strokeOpacity={0.4} strokeWidth={1.2} />
        </g>
      )}
      <circle cx={clip[0]} cy={clip[1]} r={4.3} fill={SKIN} />
      {/* carried piece: a little crate in both arms */}
      {holding && pose.carry && (
        <g transform={`translate(0 ${boxY})`}>
          <rect x={-15} y={-9} width={30} height={20} rx={3} style={{ fill: pose.carry.color ?? "var(--accent)" }} stroke="var(--foreground)" strokeWidth={1.3} />
          <path d="M -15 -1 h 30" stroke="var(--background)" strokeOpacity={0.6} strokeWidth={1.4} />
          <circle cx={-15} cy={4} r={4.3} fill={SKIN} />
          <circle cx={15} cy={4} r={4.3} fill={SKIN} />
        </g>
      )}
      {/* free arm */}
      {!holding && (
        <>
          <line x1={swx} y1={sy} x2={free[0]} y2={free[1]} stroke="var(--match)" strokeWidth={8} strokeLinecap="round" />
          <circle cx={free[0]} cy={free[1]} r={4.3} fill={SKIN} />
        </>
      )}
      {action === "look" && !holding && (
        <g transform={`translate(${mag[0]} ${mag[1]}) rotate(${wob * 8})`}>
          <line x1={0} y1={0} x2={-5} y2={9} stroke="var(--foreground)" strokeWidth={3} strokeLinecap="round" />
          <circle cx={4} cy={-6} r={9} style={{ fill: "var(--background)" }} fillOpacity={0.55} stroke="var(--foreground)" strokeWidth={2.2} />
          <path d="M -0.5 -9 a 6 6 0 0 1 6 -1.5" fill="none" stroke="var(--background)" strokeWidth={1.6} strokeLinecap="round" />
        </g>
      )}
      {/* head */}
      <g transform={`translate(${lookX * 1.5} 0)`}>
        <circle cx={0} cy={headY} r={16} fill={SKIN} stroke="var(--foreground)" strokeOpacity={0.35} strokeWidth={1} />
        {back ? (
          <path d={`M -15 ${headY - 2} a 15 15 0 0 0 30 0 v 5 a 15 15 0 0 1 -30 0 z`} style={ink} opacity={0.85} />
        ) : (
          <g>
            {[-1, 1].map((d) => (
              <ellipse key={d} cx={d * 6.2 + eyeDx + lookX * 2.5} cy={headY} rx={2.1} ry={2.3 * blink} style={ink} />
            ))}
            {[-1, 1].map((d) => (
              <circle key={`c${d}`} cx={d * 10.5 + eyeDx} cy={headY + 6} r={3} style={{ fill: "var(--accent)" }} opacity={0.22} />
            ))}
            {/* moustache: the quality-control look */}
            <ellipse cx={-3.6 + eyeDx} cy={headY + 7.2} rx={4.4} ry={2.3} transform={`rotate(10 ${-3.6 + eyeDx} ${headY + 7.2})`} style={ink} />
            <ellipse cx={3.6 + eyeDx} cy={headY + 7.2} rx={4.4} ry={2.3} transform={`rotate(-10 ${3.6 + eyeDx} ${headY + 7.2})`} style={ink} />
            {action === "celebrate" && <path d={`M ${-4 + eyeDx} ${headY + 10.5} q 4 4 8 0`} fill="none" stroke="var(--foreground)" strokeWidth={1.6} strokeLinecap="round" />}
          </g>
        )}
        {/* hard hat */}
        <path d={`M -19 ${headY - 4.5} a 19 17 0 0 1 38 0 z`} style={{ fill: "var(--accent)" }} stroke="var(--foreground)" strokeWidth={1.3} strokeLinejoin="round" />
        <rect x={-22} y={headY - 5.5} width={44} height={5.5} rx={2.7} style={{ fill: "var(--accent)" }} stroke="var(--foreground)" strokeWidth={1.3} />
        <rect x={-3} y={headY - 21} width={6} height={13} rx={2} style={{ fill: "var(--accent)" }} stroke="var(--foreground)" strokeWidth={1.1} />
      </g>
    </g>
  );
  return <g transform={facing === "l" ? "scale(-1 1)" : undefined}>{body}</g>;
}

function Bubble({ text, thinking, below }: { text: string | null; thinking: boolean; below: boolean }) {
  if (!text && !thinking) return null;
  if (!text) {
    return (
      <g transform={`translate(0 ${below ? 38 : -H - 18})`}>
        <rect x={-18} y={-14} width={36} height={22} rx={11} style={{ fill: "var(--background)" }} stroke="var(--foreground)" strokeWidth={1.4} />
        {[-8, 0, 8].map((x) => <circle key={x} cx={x} cy={-3} r={2.4} style={ink} />)}
      </g>
    );
  }
  const lines = wrap(text);
  const w = Math.max(...lines.map((l) => l.length)) * 6.9 + 18;
  const h = lines.length * 15.5 + 12;
  const left = -Math.min(w / 2, 40);
  return (
    <g transform={`translate(0 ${below ? 16 : -H - 16 - h})`} data-testid="fio-bubble">
      <rect x={left} y={0} width={w} height={h} rx={9} style={{ fill: "var(--background)" }} stroke="var(--foreground)" strokeWidth={1.4} />
      <path d={below ? "M -6 0.7 l 6 -8 l 6 8" : `M -6 ${h - 0.7} l 6 8 l 6 -8`} style={{ fill: "var(--background)" }} stroke="var(--foreground)" strokeWidth={1.4} strokeLinejoin="round" />
      <path d={below ? "M -4.7 0.4 h 9.4" : `M -4.7 ${h - 0.4} h 9.4`} stroke="var(--background)" strokeWidth={2.4} />
      <text x={left + 9} y={16} fontSize={12.5} style={{ fill: "var(--foreground)", fontFamily: "var(--font-sans), system-ui, sans-serif" }}>
        {lines.map((l, i) => <tspan key={i} x={left + 9} dy={i ? 15.5 : 0}>{l}</tspan>)}
      </text>
    </g>
  );
}

const nowSeconds = () => performance.now() / 1000;

/** Fio on a floor: render inside an <svg>. Control it through the ref (FioHandle). */
export const FioActor = forwardRef<FioHandle, FioActorProps>(function FioActor(
  { scale = 1, origin = [0, 0], heightM = 1.25, home = [0.5, 0.5], speed, onPlace, onPick, onSay, onPose, ...rest },
  ref,
) {
  const reduced = useReducedMotion();
  const tl = useRef<FioTimeline | null>(null);
  const t0 = useRef(0);
  const waiters = useRef<{ at: number; resolve: () => void }[]>([]);
  const cb = useRef({ onPlace, onPick, onSay, onPose });
  const [pose, setPose] = useState<Pose>(() => new FioTimeline(home).sample(0));
  useEffect(() => { cb.current = { onPlace, onPick, onSay, onPose }; });

  // home / speed / reduced are read through a ref so that an inline `home={[1, 2]}` cannot restart the clock every render
  const cfg = useRef({ home, speed, reduced });
  useEffect(() => { cfg.current = { home, speed, reduced }; });
  const timeline = useCallback(() => {
    if (!tl.current) {
      tl.current = new FioTimeline(cfg.current.home, { speed: cfg.current.speed, reduced: cfg.current.reduced });
      t0.current = nowSeconds();
    }
    return tl.current;
  }, []);

  useEffect(() => {
    // a change of reduced-motion preference restarts the clock at the current spot
    if (tl.current) {
      const here = tl.current.sample(nowSeconds() - t0.current);
      tl.current = new FioTimeline([here.x, here.y], { speed, reduced });
      t0.current = nowSeconds();
    }
  }, [reduced, speed]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const line = timeline();
      const now = nowSeconds() - t0.current;
      for (const e of line.events(now) as FioEvent[]) {
        if (e.type === "place" && e.item) cb.current.onPlace?.(e.item);
        else if (e.type === "pick" && e.item) cb.current.onPick?.(e.item);
        else if (e.type === "say" && e.text) cb.current.onSay?.(e.text);
      }
      const p = line.sample(now);
      setPose(p);
      cb.current.onPose?.(p);
      waiters.current = waiters.current.filter((w) => (w.at <= now ? (w.resolve(), false) : true));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      waiters.current.forEach((w) => w.resolve());
      waiters.current = [];
    };
  }, [timeline]);

  const run = useCallback((steps: FioStep[]) => {
    const line = timeline();
    const { end } = line.push(steps, nowSeconds() - t0.current);
    return new Promise<void>((resolve) => waiters.current.push({ at: end, resolve }));
  }, [timeline]);

  useImperativeHandle(ref, () => ({
    walkTo: (x, y) => run([{ kind: "walk", path: [[x, y]] }]),
    place: (item) => {
      const stand: Pt = [item.cx, item.cy + item.d / 2 + 0.55];
      return run([{ kind: "pick", item }, { kind: "walk", path: [stand] }, { kind: "place", item }]);
    },
    lookAt: (x, y, seconds) => run([{ kind: "look", at: [x, y], dur: seconds }]),
    say: (text, seconds) => run([{ kind: "say", text, dur: seconds ?? readTime(text) }]),
    point: (x, y, seconds) => run([{ kind: "point", at: [x, y], dur: seconds }]),
    think: (seconds) => run([{ kind: "think", dur: seconds }]),
    celebrate: (seconds) => run([{ kind: "celebrate", dur: seconds }]),
    act: (plan) => run(plan),
    clear: () => { const line = timeline(); line.clearQueued(nowSeconds() - t0.current); },
    position: () => { const p = timeline().sample(nowSeconds() - t0.current); return [p.x, p.y]; },
  }), [run, timeline]);

  const k = heightM / H;
  return (
    <g transform={`translate(${origin[0]} ${origin[1]}) scale(${scale})`} className="pointer-events-none" data-testid={rest["data-testid"] ?? "fio"} data-action={pose.action} data-facing={pose.facing} role="img" aria-label="Fio, the inspector">
      {pose.pop && (
        <g data-testid="fio-pop" transform={`translate(${pose.pop.x} ${pose.pop.y})`}>
          <circle r={0.12 + pose.pop.p * 0.5} fill="none" stroke="var(--accent)" strokeWidth={0.04 * (1 - pose.pop.p) + 0.005} opacity={1 - pose.pop.p} />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <circle key={i} cx={Math.cos(i * 1.047) * pose.pop!.p * 0.55} cy={Math.sin(i * 1.047) * pose.pop!.p * 0.55} r={0.035 * (1 - pose.pop!.p)} style={{ fill: "var(--accent)" }} />
          ))}
        </g>
      )}
      <g transform={`translate(${pose.x} ${pose.y}) scale(${k})`}>
        <ellipse cx={0} cy={0} rx={19} ry={6} fill="#000" opacity={0.14} />
        <FioFigure pose={pose} reduced={reduced} />
        <Bubble text={pose.say} thinking={pose.action === "think"} below={pose.y < heightM * 2.1} />
      </g>
    </g>
  );
});

/**
 * Fio as a floating mascot on screens without a floor: a full-viewport, click-through SVG where coordinates are CSS
 * pixels. He starts bottom-right; pass `home` to start elsewhere. Same ref API as FioActor.
 */
export const FioOverlay = forwardRef<FioHandle, Omit<FioActorProps, "scale" | "origin"> & { heightPx?: number }>(function FioOverlay(
  { heightPx = 120, home, ...props },
  ref,
) {
  const corner = useSyncExternalStore(() => () => {}, () => `${window.innerWidth - 90},${window.innerHeight - 24}`, () => "");
  const start: Pt | null = home ?? (corner ? (corner.split(",").map(Number) as Pt) : null);
  if (!start) return null;
  return (
    <svg className="pointer-events-none fixed inset-0 z-50 h-full w-full" aria-hidden={false} data-testid="fio-overlay">
      <FioActor ref={ref} scale={1} origin={[0, 0]} heightM={heightPx} home={start} speed={props.speed ?? 260} {...props} />
    </svg>
  );
});
