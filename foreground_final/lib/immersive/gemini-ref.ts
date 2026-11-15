import { IMAGE_QUOTA_MESSAGE, type ImagineError } from "@/lib/imagine/types";
import type { SourceImage } from "@/lib/imagine/visualizer";

/**
 * Thin adapter over the same Gemini REST call lib/imagine/visualizer.ts makes, for the one thing its editImage
 * cannot do: send reference images alongside the image being edited (the already-edited adjacent cube face).
 * Server only. The key is read from the environment and never logged or returned.
 */

const MODELS = ["gemini-3.1-flash-image", "gemini-3-pro-image"] as const;
const ENDPOINT = (model: string) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
const TIMEOUT_MS = 90_000;

type Part = { inlineData?: { mimeType?: string; data?: string }; text?: string };
type Reply = {
  candidates?: { content?: { parts?: Part[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
};

export type EditOut = { image: SourceImage; model: string; usage?: { inTokens: number; outTokens: number } };

async function call(model: string, key: string, images: SourceImage[], prompt: string, signal?: AbortSignal): Promise<EditOut | ImagineError> {
  let res: Response;
  try {
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    res = await fetch(ENDPOINT(model), {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [...images.map((i) => ({ inlineData: { mimeType: i.mime, data: i.data } })), { text: prompt }] }],
        generationConfig: { responseModalities: ["IMAGE"] },
      }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (e) {
    return { code: "image_failed", message: e instanceof Error && e.name === "TimeoutError" ? "The image model took too long." : "The image model could not be reached." };
  }
  if (res.status === 429) return { code: "image_quota", message: IMAGE_QUOTA_MESSAGE };
  if (!res.ok) return { code: "image_failed", message: `The image model returned ${res.status}.` };
  const body = (await res.json().catch(() => ({}))) as Reply;
  const part = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  const usage = body.usageMetadata ? { inTokens: body.usageMetadata.promptTokenCount ?? 0, outTokens: body.usageMetadata.candidatesTokenCount ?? 0 } : undefined;
  if (part?.inlineData?.data) return { image: { mime: part.inlineData.mimeType ?? "image/png", data: part.inlineData.data }, model, usage };
  if (body.promptFeedback?.blockReason || /SAFETY|PROHIBITED|BLOCK/.test(body.candidates?.[0]?.finishReason ?? ""))
    return { code: "image_blocked", message: "The image model declined this edit." };
  return { code: "image_failed", message: "The image model returned no image." };
}

/** Edit `source` with `refs` as extra reference images (in order: image 2, image 3, ...). Primary model, then fallback. */
export async function editWithReferences(source: SourceImage, refs: SourceImage[], prompt: string, signal?: AbortSignal): Promise<EditOut | ImagineError> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { code: "no_key", message: IMAGE_QUOTA_MESSAGE };
  let last: ImagineError = { code: "image_failed", message: "The image model returned no image." };
  for (const model of MODELS) {
    const out = await call(model, key, [source, ...refs], prompt, signal);
    if ("image" in out) return out;
    if (last.code !== "image_quota") last = out;
    if (out.code === "image_blocked" || signal?.aborted) break;
  }
  return last;
}
