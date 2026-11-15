import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MEDIA_PREFIX } from "@/lib/imagine/media";
import type { ChangeSpec, ImagineError } from "@/lib/imagine/types";
import { editImage, editPrompt, loadSource, type SourceImage } from "@/lib/imagine/visualizer";
import type { Site } from "@/lib/sites/schema";
import { capEdgeTouching, opposite, ringNeighbours, type SideFace } from "./cube";
import { imagineVersionId, panoCacheKey } from "./cache-key";
import { editWithReferences, type EditOut } from "./gemini-ref";
import { MAX_FACE_EDITS, type FaceIndex, type PanoImagineErrorCode, type PanoImagineEvent } from "./imagine-types";

/**
 * Imagine a change inside a 360 pano: edit the cube faces with Gemini so the room around the viewer changes.
 * The face the user looks at is edited first; its ring neighbours follow in parallel with the edited face as a
 * reference so the design continues across the shared edge; the opposite face last with both neighbours.
 * Ceiling / floor faces only when the instruction is about them. Server only.
 */

const PUBLIC_DIR = join(process.cwd(), "public");
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const CEILING = /\b(ceiling|ceilings|pendant|pendants|chandelier|skylight|downlight|light fixtures?|lighting|beams?|ductwork|soffit)\b/i;
const FLOOR = /\b(floor|floors|flooring|tiles?|carpet|rug|terrazzo|parquet|hardwood|concrete slab|epoxy)\b/i;

/** Edit plan: stages run in order, faces inside a stage in parallel. Never more than MAX_FACE_EDITS faces. */
export function planFaces(lookFace: SideFace, instruction: string): FaceIndex[][] {
  const { left, right } = ringNeighbours(lookFace);
  const second: FaceIndex[] = [left, right];
  if (CEILING.test(instruction)) second.push(0);
  if (FLOOR.test(instruction)) second.push(5);
  const stages: FaceIndex[][] = [[lookFace], second, [opposite(lookFace)]];
  let n = 0;
  return stages.map((s) => s.filter(() => ++n <= MAX_FACE_EDITS)).filter((s) => s.length);
}

const SIDE_WORD: Record<number, string> = { 0: "straight up at the ceiling", 1: "toward the front", 2: "to the right", 3: "toward the back", 4: "to the left", 5: "straight down at the floor" };

function changeText(instruction: string, spec?: ChangeSpec): string {
  const extra = spec ? [spec.summary, ...spec.changes.map((c) => `${c.target}: ${c.detail}`)].filter(Boolean).join(" ") : "";
  return extra ? `${instruction}. Details: ${extra}` : instruction;
}

/** Prompt for one face. `refs` describes the reference images that follow the image being edited. */
export function facePrompt(face: FaceIndex, instruction: string, refs: { face: FaceIndex; edgeOfTarget: string; edgeOfRef: string }[], spec?: ChangeSpec): string {
  const context = [
    `This square photo is one face of a 360-degree cube panorama of a real commercial interior: a 90-degree field of view looking ${SIDE_WORD[face]} from a fixed camera point at eye height.`,
    "Apply the change only where it would be visible from this direction; if nothing of it is visible here, keep the photo as it is.",
    changeText(instruction, spec),
  ].join(" ");
  const base = editPrompt(context, "");
  if (refs.length === 0) return base;
  const lines = refs.map(
    (r, i) =>
      `Image ${i + 2} is the already-edited neighbouring face of the same cube (looking ${SIDE_WORD[r.face]}). The ${r.edgeOfTarget} edge of image 1 and the ${r.edgeOfRef} edge of image ${i + 2} are the same physical line in the room.`,
  );
  return [
    base,
    "Image 1 is the photo to edit.",
    ...lines,
    "Continue the same design seamlessly across each shared edge: the same materials, colours, fixture style, heights and lighting; anything that crosses the edge continues at exactly the same height and position. Do not copy the reference images; only edit image 1.",
  ].join("\n");
}

/** Edge relations between a target face and an already-edited adjacent face. */
export function sharedEdge(target: FaceIndex, ref: FaceIndex): { edgeOfTarget: string; edgeOfRef: string } {
  const isCap = (f: FaceIndex): f is 0 | 5 => f === 0 || f === 5;
  if (isCap(target) && !isCap(ref)) return { edgeOfTarget: capEdgeTouching(target, ref as SideFace), edgeOfRef: target === 0 ? "top" : "bottom" };
  if (!isCap(target) && isCap(ref)) return { edgeOfTarget: ref === 0 ? "top" : "bottom", edgeOfRef: capEdgeTouching(ref, target as SideFace) };
  const { left } = ringNeighbours(target as SideFace);
  return left === ref ? { edgeOfTarget: "left", edgeOfRef: "right" } : { edgeOfTarget: "right", edgeOfRef: "left" };
}

/** The already-edited faces a face should be given as references. */
function referencesFor(face: FaceIndex, lookFace: SideFace, done: Map<FaceIndex, SourceImage>): FaceIndex[] {
  if (face === lookFace) return [];
  if (face === 0 || face === 5) return done.has(lookFace) ? [lookFace] : [];
  const { left, right } = ringNeighbours(face as SideFace);
  return [left, right].filter((f) => done.has(f));
}

// ---------- jobs: one per cache key, shared by every request for it ----------

type Job = { events: PanoImagineEvent[]; listeners: Set<(e: PanoImagineEvent) => void>; done: boolean };
type Registry = { jobs: Map<string, Job>; running: number; usage: { edits: number; inTokens: number; outTokens: number; ms: number[] } };
const g = globalThis as unknown as { __imaginePano?: Registry };
export const registry: Registry = (g.__imaginePano ??= { jobs: new Map(), running: 0, usage: { edits: 0, inTokens: 0, outTokens: 0, ms: [] } });
export const MAX_RUNNING = 2;

export type ImaginePanoInput = { site: Site; panoId: string; instruction: string; lookFace: SideFace; changeSpec?: ChangeSpec };

const codeOf = (e: ImagineError): PanoImagineErrorCode =>
  e.code === "image_quota" ? "quota" : e.code === "image_blocked" ? "blocked" : e.code === "no_key" ? "no_key" : "failed";

function folder(siteId: string, versionId: string, panoId: string) {
  return { dir: join(PUBLIC_DIR, "imagine", siteId, versionId, panoId), url: `${MEDIA_PREFIX}/${siteId}/${versionId}/${panoId}` };
}

type Manifest = { instruction: string; base: "empty" | "scanned"; faces: Partial<Record<FaceIndex, string>>; stages: FaceIndex[][] };

/**
 * Subscribe to the job for (site, pano, instruction): replays what already happened, then follows.
 * Returns null when the budget of concurrent jobs is used up (the route answers 429).
 */
export function subscribe(input: ImaginePanoInput, listener: (e: PanoImagineEvent) => void): (() => void) | null {
  const { site, panoId, instruction } = input;
  const pano = site.matterport?.panos.find((p) => p.id === panoId);
  const base: "empty" | "scanned" = pano?.skyboxEmpty?.length === 6 ? "empty" : "scanned";
  const key = panoCacheKey(site.id, panoId, instruction, base);
  let job = registry.jobs.get(key);
  if (!job) {
    // finished jobs are kept only as a warm cache (their manifest on disk can rebuild them); cap the map
    if (registry.jobs.size >= 200) {
      for (const [k, j] of registry.jobs) {
        if (registry.jobs.size < 150) break;
        if (j.done && j.listeners.size === 0) registry.jobs.delete(k);
      }
    }
    const versionId = imagineVersionId(site.id, instruction, base);
    const manifestPath = join(folder(site.id, versionId, panoId).dir, "manifest.json");
    if (existsSync(manifestPath)) {
      job = { events: [], listeners: new Set(), done: false };
      registry.jobs.set(key, job);
      void replayManifest(job, manifestPath, versionId, panoId);
    } else {
      if (registry.running >= MAX_RUNNING) return null;
      job = { events: [], listeners: new Set(), done: false };
      registry.jobs.set(key, job);
      void run(job, key, input, base, versionId);
    }
  }
  for (const e of job.events) listener(e);
  if (job.done) return () => {};
  job.listeners.add(listener);
  return () => job.listeners.delete(listener);
}

function emit(job: Job, e: PanoImagineEvent) {
  job.events.push(e);
  for (const l of job.listeners) l(e);
  if (e.type === "done" || e.type === "error") {
    job.done = true;
    job.listeners.clear();
  }
}

async function replayManifest(job: Job, path: string, versionId: string, panoId: string) {
  try {
    const m = JSON.parse(await readFile(path, "utf8")) as Manifest;
    emit(job, { type: "start", versionId, panoId, base: m.base, stages: m.stages, cached: true });
    for (const [f, url] of Object.entries(m.faces)) emit(job, { type: "face", panoId, face: Number(f) as FaceIndex, url: url!, ms: 0 });
    emit(job, { type: "done", panoId, versionId, faces: m.faces, ms: 0, edits: 0 });
  } catch {
    emit(job, { type: "error", code: "failed", message: "The saved imagined room could not be read." });
  }
}

async function run(job: Job, key: string, input: ImaginePanoInput, base: "empty" | "scanned", versionId: string) {
  const { site, panoId, instruction, lookFace, changeSpec } = input;
  const pano = site.matterport?.panos.find((p) => p.id === panoId);
  const faces = (base === "empty" ? pano?.skyboxEmpty : pano?.skybox) ?? [];
  const stages = planFaces(lookFace, `${instruction} ${changeSpec?.summary ?? ""}`);
  const t0 = Date.now();
  const out = folder(site.id, versionId, panoId);
  const done = new Map<FaceIndex, SourceImage>();
  const urls: Partial<Record<FaceIndex, string>> = {};
  let edits = 0;
  const state: { fatal: { code: PanoImagineErrorCode; message: string } | null } = { fatal: null };
  registry.running += 1;
  emit(job, { type: "start", versionId, panoId, base, stages, cached: false });
  try {
    if (faces.length !== 6) throw new Error("no faces");
    await mkdir(out.dir, { recursive: true });
    for (const stage of stages) {
      if (state.fatal) break;
      await Promise.all(
        stage.map(async (face) => {
          if (edits >= MAX_FACE_EDITS) return;
          edits += 1;
          const t = Date.now();
          const source = await loadSource(site.id, faces[face]);
          if (!source) {
            emit(job, { type: "face_error", panoId, face, code: "failed", message: "The face to edit could not be read.", ms: Date.now() - t0 });
            return;
          }
          const refFaces = referencesFor(face, lookFace, done);
          const prompt = facePrompt(face, instruction, refFaces.map((r) => ({ face: r, ...sharedEdge(face, r) })), changeSpec);
          // the first face is a plain single-image edit: reuse the Imagine visualizer as is
          const res: EditOut | ImagineError =
            refFaces.length === 0 ? await editImage(source, prompt) : await editWithReferences(source, refFaces.map((r) => done.get(r)!), prompt);
          if (!("image" in res)) {
            const code = codeOf(res);
            emit(job, { type: "face_error", panoId, face, code, message: res.message, ms: Date.now() - t0 });
            if (code === "quota" || code === "no_key") state.fatal = { code, message: res.message };
            return;
          }
          done.set(face, res.image);
          const name = `f${face}.${EXT[res.image.mime] ?? "png"}`;
          await writeFile(join(out.dir, name), Buffer.from(res.image.data, "base64"));
          urls[face] = `${out.url}/${name}`;
          registry.usage.edits += 1;
          registry.usage.ms.push(Date.now() - t);
          if ("usage" in res && res.usage) {
            registry.usage.inTokens += res.usage.inTokens;
            registry.usage.outTokens += res.usage.outTokens;
          }
          emit(job, { type: "face", panoId, face, url: urls[face]!, ms: Date.now() - t0 });
        }),
      );
    }
    if (state.fatal && Object.keys(urls).length === 0) {
      emit(job, { type: "error", ...state.fatal });
      registry.jobs.delete(key); // a quota error is not cached: try again later
      return;
    }
    const manifest: Manifest = { instruction, base, faces: urls, stages };
    // only a complete set is cached on disk; a partial one is retried next time
    if (Object.keys(urls).length === stages.flat().length) await writeFile(join(out.dir, "manifest.json"), JSON.stringify(manifest, null, 2));
    else registry.jobs.delete(key);
    emit(job, { type: "done", panoId, versionId, faces: urls, ms: Date.now() - t0, edits });
  } catch (err) {
    console.error("[imagine-pano] run failed:", err instanceof Error ? err.message : "unknown error");
    registry.jobs.delete(key);
    emit(job, { type: "error", code: "failed", message: "Something went wrong while imagining this room. Try again." });
  } finally {
    registry.running -= 1;
  }
}

