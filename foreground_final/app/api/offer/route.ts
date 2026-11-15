import { z } from "zod";
import { analyzeSite } from "@/lib/engine";
import { loadSite } from "@/lib/sites/load";
import { buildAskList } from "@/lib/outputs/ask-list";
import { emailPrompt, fallbackEmail } from "@/lib/outputs/email";
import { guard } from "@/lib/rate-limit";

const MODEL = "claude-haiku-5-5";
const TIMEOUT_MS = 15_000;

const Body = z.object({
  siteId: z.string().regex(/^[A-Za-z0-9_-]+$/).max(40),
  brief: z.object({
    concept: z.enum(["quick-service", "fast-casual", "full-service", "cafe", "bar"]),
    seats: z.number().int().min(8).max(400).optional(),
    budgetUsd: z.number().int().min(10_000).max(2_000_000).optional(),
  }),
  /** the plan's seats (the owner's drawn layout); overrides brief.seats */
  seats: z.number().int().min(8).max(400).optional(),
  /** only these asks go in the letter (ids from buildAskList); absent means the usual top asks */
  askIds: z.array(z.string().max(60)).max(20).optional(),
  /** true: answer with the letter as a plain-text stream; the source is in the x-offer-source header */
  stream: z.boolean().optional(),
});

async function draftWithModel(system: string, user: string): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 700, thinking: { type: "disabled" }, system, messages: [{ role: "user", content: user }] }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[offer] model call failed with HTTP ${res.status}; using template`);
      return null;
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((c) => c.type === "text")?.text?.trim();
    return text && text.length > 40 ? text : null;
  } catch (err) {
    console.warn(`[offer] model call failed (${err instanceof Error ? err.name : "error"}); using template`);
    return null;
  }
}

/** Opens the model's stream and returns its text deltas as a plain-text body, or null when the model cannot be reached. */
async function streamWithModel(system: string, user: string): Promise<ReadableStream<Uint8Array> | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 700, stream: true, thinking: { type: "disabled" }, system, messages: [{ role: "user", content: user }] }),
      signal: AbortSignal.timeout(TIMEOUT_MS * 2),
    });
    if (!res.ok || !res.body) {
      console.warn(`[offer] model stream failed with HTTP ${res.status}; using template`);
      return null;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    const enc = new TextEncoder();
    let buf = "";
    /** the next run of text from the stream; null at the end, or when the model reports an error */
    const nextText = async (): Promise<string | null> => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return null;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        let out = "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          try {
            const ev = JSON.parse(line.slice(5)) as { type?: string; delta?: { type?: string; text?: string }; error?: { message?: string } };
            if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) out += ev.delta.text;
            else if (ev.type === "error") {
              console.warn(`[offer] model stream error: ${ev.error?.message ?? "unknown"}`);
              return out || null;
            }
          } catch {
            /* a partial or non-JSON line: skip it */
          }
        }
        if (out) return out;
      }
    };
    // commit to "claude" only once the first text has arrived; before that, any failure falls back to the template
    const first = await nextText();
    if (!first) {
      console.warn("[offer] model stream gave no text; using template");
      void reader.cancel();
      return null;
    }
    let sentFirst = false;
    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (!sentFirst) {
          sentFirst = true;
          return controller.enqueue(enc.encode(first));
        }
        const t = await nextText();
        if (t === null) return controller.close();
        controller.enqueue(enc.encode(t));
      },
      cancel: () => void reader.cancel(),
    });
  } catch (err) {
    console.warn(`[offer] model stream failed (${err instanceof Error ? err.name : "error"}); using template`);
    return null;
  }
}

/** POST { siteId, brief, seats?, askIds?, stream? } -> { email, source }. The asks are rebuilt here from the site file, never taken from the client. */
export async function POST(req: Request) {
  const blocked = guard(req, "offer", 20000);
  if (blocked) return blocked;
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return Response.json({ error: "Invalid request.", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });

  const site = loadSite(parsed.data.siteId);
  if (!site) return Response.json({ error: "Unknown site." }, { status: 404 });

  const brief = { ...parsed.data.brief, seats: parsed.data.seats ?? parsed.data.brief.seats, city: site.city };
  const all = buildAskList(site, analyzeSite(site, brief));
  const ids = parsed.data.askIds;
  const asks = ids ? all.filter((a) => ids.includes(a.id)) : all;
  if (ids && asks.length === 0) return Response.json({ error: "Pick at least one ask for the letter." }, { status: 400 });
  const { system, user } = emailPrompt(site, asks, brief);

  if (parsed.data.stream) {
    const stream = await streamWithModel(system, user);
    const headers = { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-offer-source": stream ? "claude" : "template" };
    return new Response(stream ?? fallbackEmail(site, asks, brief), { headers });
  }
  const drafted = await draftWithModel(system, user);
  return Response.json(
    drafted ? { email: drafted, source: "claude" } : { email: fallbackEmail(site, asks, brief), source: "template" },
  );
}
