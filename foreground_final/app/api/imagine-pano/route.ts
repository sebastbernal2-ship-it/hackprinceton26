import { z } from "zod";
import { ChangeSpecSchema } from "@/lib/imagine/types";
import { subscribe } from "@/lib/immersive/imagine-pano";
import type { PanoImagineEvent } from "@/lib/immersive/imagine-types";
import { loadSite } from "@/lib/sites/load";
import { guard, reserveDaily, DAILY_IMAGE_EDITS } from "@/lib/rate-limit";

// cacheComponents is on, so no `runtime` or `dynamic` segment options: a POST handler is never cached.
export const maxDuration = 300;

const Body = z.object({
  siteId: z.string().regex(/^[A-Za-z0-9_-]+$/).max(40),
  panoId: z.string().regex(/^[A-Za-z0-9_-]+$/).max(40),
  instruction: z.string().trim().min(3, "Say what you would change.").max(500, "Keep it under 500 characters."),
  /** the side face (1-4) the user is looking at: edited first */
  lookFace: z.number().int().min(1).max(4).default(1),
  changeSpec: ChangeSpecSchema.optional(),
});

/**
 * POST { siteId, panoId, instruction, lookFace?, changeSpec? } -> text/event-stream of PanoImagineEvent:
 * start -> face (one per edited cube face, as it lands) -> done, or error. Requests for the same
 * (site, pano, instruction) share one job, so a background prefetch and the viewer never pay twice.
 */
export async function POST(req: Request) {
  const blocked = guard(req, "imaginePano", 200000);
  if (blocked) return blocked;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ code: "bad_request", error: "Body must be JSON." }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return Response.json({ code: "bad_request", error: parsed.error.issues[0]?.message ?? "That request could not be read." }, { status: 400 });
  const { siteId, panoId, instruction, lookFace, changeSpec } = parsed.data;
  const site = loadSite(siteId);
  const pano = site?.matterport?.panos.find((p) => p.id === panoId);
  if (!site || !pano?.skybox) return Response.json({ code: "bad_request", error: "Unknown site or pano." }, { status: 404 });
  // worst case: a full room of face edits (cache hits still count; the cap is a spend ceiling, not a meter)
  if (!reserveDaily("gemini-edits", 6, DAILY_IMAGE_EDITS)) {
    return Response.json({ code: "image_quota", error: "Today's visualization budget is used up. Checks and costs still work." }, { status: 429 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let busy = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (e: PanoImagineEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          closed = true;
        }
        if (e.type === "done" || e.type === "error") {
          closed = true;
          try {
            controller.close();
          } catch {
            // client already gone
          }
        }
      };
      unsubscribe = subscribe({ site, panoId, instruction, lookFace: lookFace as 1 | 2 | 3 | 4, changeSpec }, send);
      if (!unsubscribe) busy = true;
    },
    cancel() {
      // the job keeps running (the result is cached for the next visit); this request just stops listening
      unsubscribe?.();
    },
  });
  if (busy) return Response.json({ code: "busy", error: "Imagine is busy with other rooms. Try again in a moment." }, { status: 429 });

  return new Response(stream, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" },
  });
}
