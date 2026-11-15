/**
 * Guards for routes that spend money on model calls (Anthropic, Gemini).
 * In-memory: right for one server process (local demo, a single instance). A multi-instance deploy should swap
 * the store for a shared one (e.g. Redis) behind the same functions.
 */

type Window = { hits: number[] };
const windows = new Map<string, Window>();
const daily = new Map<string, { day: string; used: number }>();

export type Limit = { perMinute: number };

/** Per-route defaults: calls per client per minute. */
export const LIMITS = {
  agent: { perMinute: 4 },
  offer: { perMinute: 10 },
  layout: { perMinute: 12 },
  ask: { perMinute: 12 },
  imagine: { perMinute: 6 },
  imaginePano: { perMinute: 6 },
} satisfies Record<string, Limit>;

/** Image edits allowed per day across all clients (Gemini spend cap). */
export const DAILY_IMAGE_EDITS = Number(process.env.FOREGROUND_DAILY_IMAGE_EDITS ?? 600);

export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("x-real-ip") || "local";
}

/** Sliding one-minute window. Returns seconds to wait when over the limit, else 0. */
export function hit(bucket: string, key: string, limit: Limit, now = Date.now()): number {
  const id = `${bucket}:${key}`;
  const w = windows.get(id) ?? { hits: [] };
  w.hits = w.hits.filter((t) => now - t < 60_000);
  if (w.hits.length >= limit.perMinute) {
    windows.set(id, w);
    return Math.max(1, Math.ceil((60_000 - (now - w.hits[0])) / 1000));
  }
  w.hits.push(now);
  windows.set(id, w);
  if (windows.size > 5_000) {
    for (const [k, v] of windows) if (v.hits.every((t) => now - t >= 60_000)) windows.delete(k);
  }
  return 0;
}

/** Reserve `n` units of a daily budget; false when it would exceed `cap`. */
export function reserveDaily(bucket: string, n: number, cap: number, now = new Date()): boolean {
  const day = now.toISOString().slice(0, 10);
  const cur = daily.get(bucket);
  const used = cur && cur.day === day ? cur.used : 0;
  if (used + n > cap) return false;
  daily.set(bucket, { day, used: used + n });
  return true;
}

/** 413 when the declared body is larger than `maxBytes` (checked before parsing). */
export function tooLarge(req: Request, maxBytes: number): Response | null {
  const len = Number(req.headers.get("content-length") ?? 0);
  return len > maxBytes ? Response.json({ error: "That request is too large." }, { status: 413 }) : null;
}

/** One call for the top of a route: size check, then the per-client window. */
export function guard(req: Request, bucket: keyof typeof LIMITS, maxBytes: number): Response | null {
  const big = tooLarge(req, maxBytes);
  if (big) return big;
  const wait = hit(bucket, clientKey(req), LIMITS[bucket]);
  return wait
    ? Response.json({ error: `Too many requests. Try again in ${wait} s.` }, { status: 429, headers: { "Retry-After": String(wait) } })
    : null;
}

/** test hook */
export function resetLimits() {
  windows.clear();
  daily.clear();
}
