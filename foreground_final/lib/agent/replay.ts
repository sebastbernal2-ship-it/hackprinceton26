import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseBriefRegex } from "./brief";
import type { AgentEvent } from "./events";

/**
 * Replay mode (T12): a live run's normalized events are saved with relative timestamps to
 * data/replays/<slug>.json and can be streamed back with the original timing and no API calls.
 */

export const REPLAYS_DIR = join(process.cwd(), "data", "replays");

export type TimedEvent = { t: number; event: AgentEvent };

export type Replay = {
  version: 1;
  slug: string;
  query: string;
  recordedAt: string;
  durationMs: number;
  events: TimedEvent[];
};

export function slugify(query: string): string {
  const slug = query
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
  return slug || "run";
}

/** Collects events as they stream; `finish()` returns the replay document. */
export function createRecorder(query: string, now: () => number = Date.now) {
  const started = now();
  const events: TimedEvent[] = [];
  return {
    push(event: AgentEvent) {
      events.push({ t: now() - started, event });
    },
    finish(): Replay {
      return {
        version: 1,
        slug: slugify(query),
        query,
        recordedAt: new Date(started).toISOString(),
        durationMs: events.at(-1)?.t ?? 0,
        events,
      };
    },
  };
}

/** A run is worth keeping only if it delivered a real (non-fallback) ranking and did not error. */
export function isCompleteRun(replay: Replay): boolean {
  const types = replay.events.map((e) => e.event);
  return (
    types.some((e) => e.type === "result" && !e.fallback) &&
    !types.some((e) => e.type === "error") &&
    types.at(-1)?.type === "done"
  );
}

export function saveReplay(replay: Replay, dir: string = REPLAYS_DIR): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${replay.slug}.json`);
  writeFileSync(file, `${JSON.stringify(replay, null, 1)}\n`, "utf8");
  return file;
}

function isReplay(v: unknown): v is Replay {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Partial<Replay>;
  return (
    typeof r.query === "string" &&
    Array.isArray(r.events) &&
    r.events.every((e) => typeof e?.t === "number" && typeof e?.event?.type === "string")
  );
}

export function loadReplays(dir: string = REPLAYS_DIR): Replay[] {
  if (!existsSync(dir)) return [];
  const out: Replay[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(join(dir, file), "utf8"));
      if (isReplay(parsed)) out.push(parsed);
    } catch {
      // a broken replay file must not take the demo down; skip it
    }
  }
  return out;
}

const STOP = new Set(["a", "an", "the", "in", "for", "with", "and", "of", "to", "budget", "seats", "seat", "i", "want", "open"]);
function tokens(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w)));
}

/** How well a recorded run matches a new query: city and concept dominate, shared words break ties. */
export function matchScore(query: string, recordedQuery: string): number {
  const a = parseBriefRegex(query);
  const b = parseBriefRegex(recordedQuery);
  let score = 0;
  if (a.city && a.city === b.city) score += 4;
  else if (a.city && b.city && a.city !== b.city) score -= 4;
  if (a.concept === b.concept) score += 2;
  if (a.cuisine && a.cuisine === b.cuisine) score += 2;
  const ta = tokens(query);
  const tb = tokens(recordedQuery);
  const shared = [...ta].filter((w) => tb.has(w)).length;
  score += shared / Math.max(1, Math.max(ta.size, tb.size));
  return score;
}

export function findClosestReplay(query: string, replays: Replay[] = loadReplays()): Replay | null {
  let best: Replay | null = null;
  let bestScore = -Infinity;
  for (const r of replays) {
    const s = matchScore(query, r.query);
    if (s > bestScore) {
      best = r;
      bestScore = s;
    }
  }
  return best;
}

export type PlayOptions = {
  /** 2 plays twice as fast; default 1 (original timing) */
  speed?: number;
  /** cap any single wait, so a slow recorded step never leaves dead air on stage */
  maxGapMs?: number;
  signal?: AbortSignal;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
};

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0 || signal?.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

/** Stream a recorded run with its original gaps (divided by `speed`). */
export async function* playReplay(replay: Replay, opts: PlayOptions = {}): AsyncGenerator<AgentEvent> {
  const speed = opts.speed && opts.speed > 0 ? opts.speed : 1;
  const sleep = opts.sleep ?? defaultSleep;
  let prev = 0;
  for (const { t, event } of replay.events) {
    if (opts.signal?.aborted) return;
    let gap = Math.max(0, t - prev) / speed;
    if (opts.maxGapMs !== undefined) gap = Math.min(gap, opts.maxGapMs);
    prev = t;
    if (gap > 0) await sleep(gap, opts.signal);
    if (opts.signal?.aborted) return;
    yield event;
  }
}
