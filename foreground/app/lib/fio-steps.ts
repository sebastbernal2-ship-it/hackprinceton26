// Pure timeline for the Fio inspector character: a queue of steps with durations, sampled at any time.
// No React, no DOM: the component runs a clock and asks `sample(t)`; tests ask it the same way.
import type { Pt } from "./planner";

export type FioItem = { id: string; label: string; cx: number; cy: number; w: number; d: number; color?: string };

type Say = { say?: string };
export type FioStep =
  | ({ kind: "walk"; path: Pt[] } & Say)
  | ({ kind: "pick"; item: FioItem } & Say)
  | ({ kind: "place"; item: FioItem; dur?: number } & Say)
  | ({ kind: "look"; at: Pt; dur?: number } & Say)
  | ({ kind: "point"; at: Pt; dur?: number } & Say)
  | ({ kind: "think"; dur?: number } & Say)
  | ({ kind: "celebrate"; dur?: number } & Say)
  | ({ kind: "idle"; dur?: number } & Say)
  | { kind: "say"; text: string; dur?: number };

export type FioAction = "idle" | "walk" | "carry" | "pick" | "place" | "look" | "point" | "think" | "celebrate";
export type Facing = "l" | "r" | "u" | "d";
export type Pose = {
  x: number;
  y: number;
  facing: Facing;
  action: FioAction;
  /** 0..1 progress within the current step (0 when idle between steps). */
  phase: number;
  /** Seconds since the timeline started, for blinks and gait. */
  clock: number;
  carry: FioItem | null;
  say: string | null;
  aim: Pt | null;
  /** The set-down pop: where it happened and 0..1 progress, for 0.5 s after the piece lands. */
  pop: { x: number; y: number; p: number } | null;
  /** Index of the current segment, -1 before the first. */
  seg: number;
};
export type FioEvent = { at: number; type: "pick" | "place" | "say"; item?: FioItem; text?: string };
export type TimelineOptions = { speed?: number; reduced?: boolean };

export const DEFAULT_SPEED = 1.5;
export const POP_SECONDS = 0.5;
const LINGER = 0.8;
const PLACE_AT = 0.55;

export const readTime = (text: string) => Math.max(1.2, text.length * 0.045 + 0.5);
export const pathLength = (path: Pt[]) => path.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - path[i][0], p[1] - path[i][1]), 0);

/** `from` is where a walk starts; a walk's path lists the points after it. */
export function stepDuration(step: FioStep, speed = DEFAULT_SPEED, reduced = false, from?: Pt): number {
  switch (step.kind) {
    case "walk": {
      const t = pathLength(from ? [from, ...step.path] : step.path) / speed;
      return Math.max(0.05, reduced ? Math.min(0.2, t) : t);
    }
    case "pick": return 0.4;
    case "place": return step.dur ?? 0.9;
    case "look": return step.dur ?? 1.6;
    case "point": return step.dur ?? 1.4;
    case "think": return step.dur ?? 1.6;
    case "celebrate": return step.dur ?? 2;
    case "idle": return step.dur ?? 1;
    case "say": return step.dur ?? readTime(step.text);
  }
}

export function facingToward(from: Pt, to: Pt, fallback: Facing = "d"): Facing {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  if (Math.hypot(dx, dy) < 1e-6) return fallback;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "r" : "l";
  return dy < 0 ? "u" : "d";
}

type Seg = {
  step: FioStep;
  start: number;
  end: number;
  from: Pt;
  to: Pt;
  facing0: Facing;
  facing1: Facing;
  carry0: FioItem | null;
  carry1: FioItem | null;
  say: string | null;
};

export class FioTimeline {
  private segs: Seg[] = [];
  private pending: FioEvent[] = [];
  private home: Pt;
  private homeFacing: Facing = "d";
  readonly speed: number;
  readonly reduced: boolean;

  constructor(home: Pt, opts: TimelineOptions = {}) {
    this.home = home;
    this.speed = opts.speed ?? DEFAULT_SPEED;
    this.reduced = opts.reduced ?? false;
  }

  get end() { return this.segs.length ? this.segs[this.segs.length - 1].end : 0; }
  get length() { return this.segs.length; }
  private get tail() {
    const s = this.segs[this.segs.length - 1];
    return s
      ? { pos: s.to, facing: s.facing1, carry: s.carry1 }
      : { pos: this.home, facing: this.homeFacing, carry: null as FioItem | null };
  }

  /** Where the character will be once everything queued has run. */
  get tailPosition(): Pt { return this.tail.pos; }

  /** Queue steps to start at max(now, end of the queue). Returns the time the last one ends. */
  push(steps: FioStep[], now: number): { start: number; end: number } {
    let t = Math.max(now, this.end);
    const start = t;
    for (const step of steps) {
      const tl = this.tail;
      const dur = stepDuration(step, this.speed, this.reduced, tl.pos);
      let to = tl.pos;
      let facing1 = tl.facing;
      let carry1 = tl.carry;
      const say: string | null = step.kind === "say" ? step.text : (step.say ?? null);
      if (step.kind === "walk" && step.path.length) {
        to = step.path[step.path.length - 1];
        const last = step.path.length > 1 ? step.path[step.path.length - 2] : tl.pos;
        facing1 = facingToward(last, to, tl.facing);
      }
      if (step.kind === "pick") carry1 = step.item;
      if (step.kind === "place") { carry1 = null; facing1 = facingToward(tl.pos, [step.item.cx, step.item.cy], tl.facing); }
      if (step.kind === "look" || step.kind === "point") facing1 = facingToward(tl.pos, step.at, tl.facing);
      const seg: Seg = { step, start: t, end: t + dur, from: tl.pos, to, facing0: tl.facing, facing1, carry0: tl.carry, carry1, say };
      this.segs.push(seg);
      // a bubble that carries over from the previous step is one utterance, not two
      if (say && this.segs[this.segs.length - 2]?.say !== say) this.pending.push({ at: seg.start, type: "say", text: say });
      if (step.kind === "pick") this.pending.push({ at: seg.start + dur * 0.5, type: "pick", item: step.item });
      if (step.kind === "place") this.pending.push({ at: seg.start + dur * PLACE_AT, type: "place", item: step.item });
      t += dur;
    }
    return { start, end: t };
  }

  /** Drop everything not yet started; the running step finishes. */
  clearQueued(now: number) {
    const keep = this.segs.findIndex((s) => s.start > now);
    if (keep >= 0) this.segs.length = keep;
    const end = this.end;
    this.pending = this.pending.filter((e) => e.at <= end);
  }

  /** Events whose time has come, each returned once, in time order. */
  events(upTo: number): FioEvent[] {
    const due = this.pending.filter((e) => e.at <= upTo).sort((a, b) => a.at - b.at);
    if (due.length) this.pending = this.pending.filter((e) => e.at > upTo);
    return due;
  }

  sample(t: number): Pose {
    let i = -1;
    for (let k = 0; k < this.segs.length && this.segs[k].start <= t; k++) i = k;
    const base = { clock: t, aim: null as Pt | null, pop: null as Pose["pop"], seg: i };
    if (i < 0) return { ...base, x: this.home[0], y: this.home[1], facing: this.homeFacing, action: "idle", phase: 0, carry: null, say: null };
    const s = this.segs[i];
    const pop = this.lastPop(i, t);
    if (t >= s.end) {
      const lingering = s.say && t < s.end + LINGER;
      return { ...base, pop, x: s.to[0], y: s.to[1], facing: s.facing1, action: "idle", phase: 0, carry: s.carry1, say: lingering ? s.say : null };
    }
    const phase = s.end > s.start ? (t - s.start) / (s.end - s.start) : 1;
    const out: Pose = { ...base, pop, x: s.from[0], y: s.from[1], facing: s.facing0, action: "idle", phase, carry: s.carry0, say: s.say };
    const st = s.step;
    switch (st.kind) {
      case "walk": {
        const pts = [s.from, ...st.path];
        const total = pathLength(pts);
        let d = phase * total;
        let pos: Pt = s.to;
        let heading = s.facing0;
        for (let k = 1; k < pts.length; k++) {
          const a = pts[k - 1];
          const b = pts[k];
          const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
          heading = facingToward(a, b, heading);
          if (d <= l || k === pts.length - 1) {
            const f = l === 0 ? 1 : Math.min(1, d / l);
            pos = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
            break;
          }
          d -= l;
        }
        return { ...out, x: pos[0], y: pos[1], facing: heading, action: s.carry0 ? "carry" : "walk" };
      }
      case "pick": return { ...out, action: "pick", facing: s.facing0, carry: phase >= 0.5 ? s.carry1 : null };
      case "place": return { ...out, action: "place", facing: s.facing1, carry: phase < PLACE_AT ? s.carry0 : null, aim: [st.item.cx, st.item.cy] };
      case "look": return { ...out, action: "look", facing: s.facing1, aim: st.at };
      case "point": return { ...out, action: "point", facing: s.facing1, aim: st.at };
      case "think": return { ...out, action: "think" };
      case "celebrate": return { ...out, action: "celebrate" };
      default: return out;
    }
  }

  private lastPop(i: number, t: number): Pose["pop"] {
    for (let k = i; k >= 0 && k >= i - 1; k--) {
      const s = this.segs[k];
      if (s.step.kind !== "place") continue;
      const at = s.start + (s.end - s.start) * PLACE_AT;
      if (t >= at && t < at + POP_SECONDS) return { x: s.step.item.cx, y: s.step.item.cy, p: (t - at) / POP_SECONDS };
    }
    return null;
  }
}
