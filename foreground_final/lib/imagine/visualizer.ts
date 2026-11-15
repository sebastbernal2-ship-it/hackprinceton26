import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import { MEDIA_PREFIX } from "./media";
import { IMAGE_QUOTA_MESSAGE, type ImagineError } from "./types";

/** Gemini image edit over REST. Server only. The key is read from the environment and never logged or returned. */

const MODELS = ["gemini-3.1-flash-image", "gemini-3-pro-image"] as const;
const ENDPOINT = (model: string) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
const TIMEOUT_MS = 90_000;
const PUBLIC_DIR = join(process.cwd(), "public");
export const MAX_DATA_URL_CHARS = 5_600_000; // about 4 MB of image
const DATA_URL = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/;
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

export type SourceImage = { mime: string; data: string };

/** Read an image the edit may start from: a site photo, an earlier imagined image, or a screenshot data URL. */
export async function loadSource(siteId: string, src: string): Promise<SourceImage | null> {
  const m = DATA_URL.exec(src);
  if (m) return src.length <= MAX_DATA_URL_CHARS ? { mime: m[1], data: m[2] } : null;
  // only files under this site's own public folders, whatever the path says
  const allowed = [join(PUBLIC_DIR, "sites", siteId) + sep, join(PUBLIC_DIR, "imagine", siteId) + sep];
  // runtime images are addressed as /media/imagine/... (see app/media), stored under public/imagine/...
  const file = normalize(join(PUBLIC_DIR, src.startsWith("/media/") ? src.slice(6) : src));
  const mime = MIME[file.split(".").pop()?.toLowerCase() ?? ""];
  if (!mime || !allowed.some((dir) => file.startsWith(dir))) return null;
  try {
    return { mime, data: (await readFile(file)).toString("base64") };
  } catch {
    return null;
  }
}

/** The fixed frame around the planner's edit: same camera, same light, nothing else moves. */
export function editPrompt(edit: string, region: string): string {
  return [
    "Edit this photograph of a real commercial interior. Make only the change described; this is the same room, photographed from the same spot.",
    `Change: ${edit}`,
    region ? `Only this part of the image may change: ${region}.` : "",
    "Return the image at the same aspect ratio and framing as the input: do not crop, zoom, rotate or straighten it. Keep exactly: the camera position, lens, perspective and framing; the room's geometry, wall positions, openings, ceiling height and floor level unless the change says otherwise; the existing lighting direction, colour temperature and shadows; every surface, fixture and object outside the changed region.",
    "The result must look like an unretouched photo of a built space: real materials at true scale, correct perspective lines, new surfaces lit by the room's existing light. No people, no text, no labels, no watermark, no added furniture unless asked.",
  ]
    .filter(Boolean)
    .join("\n");
}

type GeminiPart = { inlineData?: { mimeType?: string; data?: string }; text?: string };
type GeminiReply = { candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string }; error?: { message?: string } };

async function callModel(model: string, key: string, source: SourceImage, prompt: string, signal?: AbortSignal): Promise<SourceImage | ImagineError> {
  let res: Response;
  try {
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    res = await fetch(ENDPOINT(model), {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ inlineData: { mimeType: source.mime, data: source.data } }, { text: prompt }] }],
        generationConfig: { responseModalities: ["IMAGE"] },
      }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (e) {
    return { code: "image_failed", message: e instanceof Error && e.name === "TimeoutError" ? "The image model took too long." : "The image model could not be reached." };
  }
  if (res.status === 429) return { code: "image_quota", message: IMAGE_QUOTA_MESSAGE };
  if (!res.ok) return { code: "image_failed", message: `The image model returned ${res.status}.` };
  const body = (await res.json().catch(() => ({}))) as GeminiReply;
  const part = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (part?.inlineData?.data) return { mime: part.inlineData.mimeType ?? "image/png", data: part.inlineData.data };
  if (body.promptFeedback?.blockReason || /SAFETY|PROHIBITED|BLOCK/.test(body.candidates?.[0]?.finishReason ?? ""))
    return { code: "image_blocked", message: "The image model declined this edit." };
  return { code: "image_failed", message: "The image model returned no image." };
}

/** Edit one image: the primary model, then the fallback. A quota error on both comes back as image_quota. */
export async function editImage(source: SourceImage, prompt: string, signal?: AbortSignal): Promise<{ image: SourceImage; model: string } | ImagineError> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { code: "no_key", message: IMAGE_QUOTA_MESSAGE };
  let last: ImagineError = { code: "image_failed", message: "The image model returned no image." };
  for (const model of MODELS) {
    const out = await callModel(model, key, source, prompt, signal);
    if ("data" in out) return { image: out, model };
    // a quota answer outranks whatever the fallback says: it is the one the owner can act on
    if (last.code !== "image_quota") last = out;
    if (out.code === "image_blocked" || signal?.aborted) break;
  }
  return last;
}

/** Save under public/imagine/<siteId>/<versionId>-<n>.<ext> and return the public path. */
export async function saveImage(siteId: string, versionId: string, n: number, image: SourceImage): Promise<string> {
  const dir = join(PUBLIC_DIR, "imagine", siteId);
  await mkdir(dir, { recursive: true });
  const name = `${versionId}-${n}.${EXT[image.mime] ?? "png"}`;
  await writeFile(join(dir, name), Buffer.from(image.data, "base64"));
  return `${MEDIA_PREFIX}/${siteId}/${name}`;
}
