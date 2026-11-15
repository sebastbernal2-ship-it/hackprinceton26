import { z } from "zod";
import type { Change } from "@/lib/feasibility/types";
import { LayoutSchema, applyOps, autoLayout } from "@/lib/layout";
import { evaluate } from "@/lib/imagine/numbers";
import { planChange } from "@/lib/imagine/planner";
import { checkView } from "@/lib/imagine/qa";
import { BriefSchema, DISCLAIMER, VersionRefSchema, type ImagineError, type ImagineEvent, type ViewImage, type ViewQa } from "@/lib/imagine/types";
import { newVersionId } from "@/lib/imagine/versions";
import { MAX_DATA_URL_CHARS, editImage, editPrompt, loadSource, saveImage, type SourceImage } from "@/lib/imagine/visualizer";
import { loadSite } from "@/lib/sites/load";
import { guard, reserveDaily, DAILY_IMAGE_EDITS } from "@/lib/rate-limit";

// cacheComponents is on, so no `runtime` or `dynamic` segment options: a POST handler is never cached.
export const maxDuration = 300;

const MAX_CHANGES = 10;
const MAX_RUNS = 3;
let runs = 0;

const Body = z.object({
  siteId: z.string().regex(/^[A-Za-z0-9_-]+$/).max(40),
  brief: BriefSchema,
  instruction: z.string().trim().min(3, "Say what you would change.").max(500, "Keep it under 500 characters."),
  parentVersion: VersionRefSchema.optional(),
  /** the plan as the owner has it now; a starting plan is drawn when absent */
  layout: LayoutSchema.optional(),
  /** a screenshot of the current 3D view to edit instead of the site's photos */
  screenshot: z
    .string()
    .max(MAX_DATA_URL_CHARS, "That screenshot is too large (4 MB at most).")
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, "The screenshot must be a PNG, JPEG or WebP data URL.")
    .optional(),
  /** how many photos to edit, 0 to skip images */
  maxViews: z.number().int().min(0).max(3).default(3),
});

type View = { id: string; caption: string; scanned: string | null; empty: string | null; source: string };

/**
 * POST { siteId, brief, instruction, parentVersion?, layout?, screenshot?, maxViews? } -> text/event-stream.
 * Events, in order: plan -> checks -> numbers -> image (one per view as it finishes) -> images -> qa -> done,
 * each announced by a `stage` event. Checks and numbers never wait on the image model: when it is out of quota
 * the `images` event carries { code: "image_quota" } and the run still completes.
 * Stateless: the browser keeps the versions and sends the parent it builds on.
 */
export async function POST(req: Request) {
  const blocked = guard(req, "imagine", 6500000);
  if (blocked) return blocked;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "That request could not be read." }, { status: 400 });
  const { siteId, brief, instruction, parentVersion: parent, screenshot, maxViews } = parsed.data;
  const site = loadSite(siteId);
  if (!site) return Response.json({ error: "Unknown site." }, { status: 404 });
  if (parsed.data.layout && parsed.data.layout.siteId !== site.id) return Response.json({ error: "That plan belongs to another site." }, { status: 400 });
  // images are addressed as /media/imagine/<site>/... (older saved versions: /imagine/<site>/...)
  const folder = (p: string) => (p.startsWith("/media/") ? p.slice(6) : p);
  if (parent && parent.images.some((i) => !folder(i.imagined).startsWith(`/imagine/${site.id}/`))) return Response.json({ error: "That version belongs to another site." }, { status: 400 });
  if (runs >= MAX_RUNS) return Response.json({ error: "Imagine is busy. Try again in a moment." }, { status: 429 });
  // spend ceiling on image edits; when it's used up the run still returns checks and numbers (no images)
  // maxViews 0 asks for checks and numbers only, so it spends none of the image budget
  const imagesAllowed = maxViews > 0 && reserveDaily("gemini-edits", 3, DAILY_IMAGE_EDITS);

  const baseLayout = parsed.data.layout ?? autoLayout(site, brief);
  const existing: Change[] = parent?.changes ?? [];
  const existingOps = parent?.layoutOps ?? [];
  if (existing.length >= MAX_CHANGES) return Response.json({ error: "This version holds as many changes as it can. Branch from an earlier one." }, { status: 400 });

  const views: View[] = screenshot
    ? [{ id: "shot", caption: "The view on screen now", scanned: null, empty: null, source: screenshot }]
    : (site.matterport?.beforeAfter ?? []).slice(0, 3).map((b, i) => {
        const id = `v${i + 1}`;
        return { id, caption: b.caption ?? `View ${i + 1}`, scanned: b.before, empty: b.after ?? b.before, source: parent?.images.find((p) => p.view === id)?.imagined ?? b.after ?? b.before };
      });

  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort(), { once: true });
  const encoder = new TextEncoder();
  const t0 = Date.now();
  const ms = () => Date.now() - t0;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: ImagineEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
          abort.abort();
        }
      };
      runs += 1;
      try {
        // 1. plan
        send({ type: "stage", stage: "plan" });
        const current = existingOps.length ? applyOps(baseLayout, existingOps, { site, brief }).layout : baseLayout;
        const plan = await planChange({ instruction, site, brief, layout: current, views: views.map((v) => ({ id: v.id, caption: v.caption })), existing });
        if ("error" in plan) {
          send({ type: "error", message: plan.error === "timeout" ? "The planner took too long. Try again, or try a simpler change." : "The planner could not be reached, and this request is beyond the offline reader. Try one of the examples." });
          return;
        }
        const fresh = plan.spec.changes.slice(0, MAX_CHANGES - existing.length).map((c, i) => ({ ...c, id: `c${existing.length + i + 1}` }));
        if (fresh.length === 0) {
          send({ type: "error", message: plan.spec.summary || "Nothing in that request changes this space. Try one of the examples." });
          return;
        }
        const changeSpec = { ...plan.spec, changes: [...existing, ...fresh], layoutOps: [...existingOps, ...plan.spec.layoutOps].slice(0, 48) };
        const result = evaluate({ site, brief, changes: changeSpec.changes, layoutOps: changeSpec.layoutOps, baseLayout });
        const id = newVersionId();
        send({ type: "plan", id, changeSpec, layout: result.layout, plannedBy: plan.plannedBy, notes: result.notes, ms: ms() });

        // 2-3. checks and numbers are pure and immediate
        send({ type: "stage", stage: "checks" });
        send({ type: "checks", assessment: result.assessment, ms: ms() });
        send({ type: "stage", stage: "numbers" });
        send({ type: "numbers", numbers: result.numbers, costDelta: result.costDelta, ms: ms() });

        // 4. images, in parallel; each view is sent as it finishes
        send({ type: "stage", stage: "images" });
        const jobs = changeSpec.viewPrompts.flatMap((p) => {
          const view = views.find((v) => v.id === p.view);
          return view ? [{ view, prompt: p }] : [];
        }).slice(0, imagesAllowed ? maxViews : 0);
        const made: { view: View; before: SourceImage; after: SourceImage; intended: string; region: string }[] = [];
        let firstError: ImagineError | null = maxViews === 0 ? null : !imagesAllowed
          ? { code: "image_quota", message: "Today's visualization budget is used up. Checks and costs still work." }
          : jobs.length === 0 && changeSpec.viewPrompts.length === 0 ? null : jobs.length === 0 ? { code: "no_views", message: "No photo of this space shows that change." } : null;
        await Promise.all(
          jobs.map(async ({ view, prompt }, n) => {
            const image: ViewImage = { view: view.id, caption: view.caption, scanned: view.scanned, empty: view.empty, imagined: null, prompt: prompt.prompt };
            const before = await loadSource(site.id, view.source);
            const out = before ? await editImage(before, editPrompt(prompt.prompt, prompt.region), abort.signal) : ({ code: "image_failed", message: "The photo to edit could not be read." } satisfies ImagineError);
            if ("image" in out && before) {
              image.imagined = await saveImage(site.id, id, n + 1, out.image);
              made.push({ view, before, after: out.image, intended: prompt.prompt, region: prompt.region });
            } else if (!("image" in out)) {
              image.error = out;
              firstError ??= out;
            }
            send({ type: "image", image, ms: ms() });
          }),
        );
        send({ type: "images", error: made.length ? null : firstError, ms: ms() });

        // 5. QA: vision check of each generated image; the disclaimer and flags are attached either way
        send({ type: "stage", stage: "qa" });
        const checked = (await Promise.all(made.map((m) => checkView(m.view.id, m.before, m.after, m.intended, m.region, abort.signal)))).filter((v): v is ViewQa => v !== null);
        send({ type: "qa", qa: { disclaimer: DISCLAIMER, structuralFlags: changeSpec.structuralFlags, views: checked, checked: made.length > 0 && checked.length === made.length }, ms: ms() });
        send({ type: "done", ms: ms() });
      } catch (err) {
        console.error("[imagine] run failed:", err instanceof Error ? err.message : "unknown error");
        send({ type: "error", message: "Something went wrong while imagining that. Try again." });
      } finally {
        runs -= 1;
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" },
  });
}
