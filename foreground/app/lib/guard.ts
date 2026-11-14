// Small in-memory guards for the server routes that spend paid-API credits.
// Local demo scope: per-process, not a substitute for real auth if this is ever deployed.
const hits = new Map<string, number[]>();

export function rateLimited(bucket: string, request: Request, max: number, windowMs = 60_000): boolean {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 500) hits.delete(hits.keys().next().value as string);
  return false;
}

export function boundedSet<K, V>(map: Map<K, V>, key: K, value: V, max = 50): void {
  if (map.size >= max) map.delete(map.keys().next().value as K);
  map.set(key, value);
}
