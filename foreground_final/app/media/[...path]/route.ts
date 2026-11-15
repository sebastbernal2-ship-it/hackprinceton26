import { readFile } from "node:fs/promises";
import { resolveMediaPath } from "@/lib/imagine/media";

/** GET /media/imagine/<siteId>/<file>: runtime images written under public/imagine, which `next start` does not serve. */
export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  // the URL is /media/imagine/<rest>: only the imagine folder is served
  if (path[0] !== "imagine") return new Response("Not found", { status: 404 });
  const hit = resolveMediaPath(path.slice(1));
  if (!hit) return new Response("Not found", { status: 404 });
  try {
    const body = await readFile(hit.file);
    return new Response(new Uint8Array(body), {
      headers: {
        "content-type": hit.type,
        "content-length": String(body.length),
        // generated files are named by content-addressed version ids: never rewritten, safe to cache for long
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
