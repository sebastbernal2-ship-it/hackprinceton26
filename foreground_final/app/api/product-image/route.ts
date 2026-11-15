import { safeFetch, safePublicUrl } from "../../lib/product-image";

const MAX_BYTES = 6_000_000;
const cache = new Map<string, { type: string; body: ArrayBuffer }>();

/**
 * GET ?u=<https image url> -> the image, served from this origin so three.js can use it as a texture (most shops
 * send no CORS headers). Public https images only, 6 MB cap, cached in memory.
 */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("u") ?? "";
  const url = safePublicUrl(raw);
  if (!url) return Response.json({ error: "Bad image URL." }, { status: 400 });
  const key = url.toString();
  let hit = cache.get(key);
  if (!hit) {
    try {
      const res = await safeFetch(url, { timeoutMs: 8_000 });
      const type = res?.headers.get("content-type") ?? "";
      if (!res || !res.ok || !type.startsWith("image/") || type.includes("svg")) return Response.json({ error: "Not an image." }, { status: 502 });
      const body = await res.arrayBuffer();
      if (body.byteLength > MAX_BYTES) return Response.json({ error: "Image too large." }, { status: 502 });
      hit = { type, body };
      if (cache.size > 200) cache.delete(cache.keys().next().value!);
      cache.set(key, hit);
    } catch {
      return Response.json({ error: "Could not load the image." }, { status: 502 });
    }
  }
  return new Response(hit.body, { headers: { "content-type": hit.type, "cache-control": "public, max-age=86400" } });
}
