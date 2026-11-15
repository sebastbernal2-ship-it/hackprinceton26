import { isIP } from "node:net";

/** Public https pages only: no IP literals, no localhost or internal names (the server fetches these URLs). */
export function safePublicUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  if (isIP(host) || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".")) {
    return null;
  }
  return url;
}

const UA = "Mozilla/5.0 (compatible; ForegroundLayoutAgent/1.0)";

/** fetch that follows at most 4 redirects itself, re-checking every hop against safePublicUrl. */
export async function safeFetch(start: URL, init: { accept?: string; timeoutMs: number }): Promise<Response | null> {
  let url = start;
  const signal = AbortSignal.timeout(init.timeoutMs);
  for (let hop = 0; hop < 5; hop += 1) {
    const res = await fetch(url, { headers: { "user-agent": UA, ...(init.accept ? { accept: init.accept } : {}) }, redirect: "manual", signal });
    if (res.status < 300 || res.status >= 400) return res;
    const next = res.headers.get("location");
    await res.body?.cancel().catch(() => undefined);
    const resolved = next ? safePublicUrl(new URL(next, url).toString()) : null;
    if (!resolved) return null;
    url = resolved;
  }
  return null;
}

async function readCapped(res: Response, cap: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < cap) {
    const { value, done } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  return Buffer.concat(chunks).toString("utf8");
}

function decode(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x2F;/g, "/").replace(/&#47;/g, "/");
}

/** The product photo a page advertises: its Open Graph / Twitter image, else the first schema.org image. */
function imageFromHtml(html: string, base: URL): string | null {
  const patterns = [
    /<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["']/i,
    /"image"\s*:\s*(?:\[\s*)?"(https:[^"]+?\.(?:jpe?g|png|webp)[^"]*)"/i,
  ];
  for (const pattern of patterns) {
    const hit = html.match(pattern)?.[1];
    if (!hit) continue;
    try {
      const url = new URL(decode(hit), base);
      if (url.protocol === "https:") return url.toString();
    } catch {
      // try the next pattern
    }
  }
  return null;
}

/**
 * Finds a real photo of the product: reads each candidate page (the product page the agent named, then the pages
 * its web search used) and returns the first advertised image that actually loads as an image.
 */
export async function findProductImage(pages: string[]): Promise<{ image: string; page: string } | null> {
  for (const raw of pages.slice(0, 5)) {
    const page = safePublicUrl(raw);
    if (!page) continue;
    try {
      const res = await safeFetch(page, { accept: "text/html", timeoutMs: 6_000 });
      if (!res || !res.ok || !(res.headers.get("content-type") ?? "").includes("html")) continue;
      const finalUrl = safePublicUrl(res.url) ?? page;
      const image = imageFromHtml(await readCapped(res, 1_500_000), finalUrl);
      const imageUrl = image ? safePublicUrl(image) : null;
      if (!imageUrl) continue;
      const head = await safeFetch(imageUrl, { timeoutMs: 5_000 });
      const type = head?.headers.get("content-type") ?? "";
      await head?.body?.cancel().catch(() => undefined);
      if (head?.ok && type.startsWith("image/") && !type.includes("svg")) return { image: imageUrl.toString(), page: finalUrl.toString() };
    } catch {
      // next candidate
    }
  }
  return null;
}

/**
 * A real, openly licensed photo of the object from Openverse (Flickr, Wikimedia and other open collections), for
 * when the product's own page cannot be read. Tries the product name, then the plain object name.
 */
export async function findOpenPhoto(queries: string[]): Promise<{ image: string; page: string; credit: string } | null> {
  for (const q of queries.map((x) => x.trim()).filter(Boolean).slice(0, 3)) {
    try {
      const api = new URL("https://api.openverse.org/v1/images/");
      api.searchParams.set("q", q.slice(0, 80));
      api.searchParams.set("page_size", "5");
      api.searchParams.set("mature", "false");
      const res = await fetch(api, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(6_000) });
      if (!res.ok) continue;
      const body = (await res.json()) as { results?: { url?: string; foreign_landing_url?: string; creator?: string; license?: string }[] };
      for (const r of body.results ?? []) {
        const image = r.url ? safePublicUrl(r.url) : null;
        if (!image || /\.svg($|\?)/i.test(image.pathname)) continue;
        return { image: image.toString(), page: r.foreign_landing_url ?? image.toString(), credit: `${r.creator ?? "Unknown"} · ${(r.license ?? "cc").toUpperCase()}` };
      }
    } catch {
      // next query
    }
  }
  return null;
}
