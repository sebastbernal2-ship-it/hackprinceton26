import { z } from "zod";
import { runAgent } from "@/lib/agent/agent";
import { toSse, type AgentEvent } from "@/lib/agent/events";
import { createRecorder, findClosestReplay, isCompleteRun, playReplay, saveReplay } from "@/lib/agent/replay";
import { clientKey, hit, LIMITS, tooLarge } from "@/lib/rate-limit";

// next.config has cacheComponents on, and with it Next 16 rejects the `runtime` and `dynamic` segment
// options. Neither is needed: route handlers run on Node.js by default and a POST is never cached.
export const maxDuration = 300;

const Body = z.object({
  query: z.string().trim().min(3, "Tell us what you want to open.").max(500, "Keep it under 500 characters."),
  /** stream the closest recorded run instead of calling the models */
  replay: z.boolean().optional(),
  /** replay speed multiplier, e.g. 2 = twice as fast */
  speed: z.number().min(0.25).max(20).optional(),
});

const HEARTBEAT_MS = 10_000;
const MAX_LIVE_RUNS = 3;
let liveRuns = 0;

function json(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

export async function POST(req: Request) {
  const big = tooLarge(req, 20_000);
  if (big) return big;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json(400, "Body must be JSON: { query: string }");
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return json(400, parsed.error.issues[0]?.message ?? "Invalid request");
  const { query, speed } = parsed.data;

  // replay only when the request asks for it (the client sends it for `?replay=1`); the env switch is for tests alone
  const replayMode = parsed.data.replay === true || (process.env.NODE_ENV === "test" && process.env.FOREGROUND_REPLAY === "1");
  if (!replayMode) {
    const wait = hit("agent", clientKey(req), LIMITS.agent);
    if (wait) return Response.json({ error: `Too many live runs. Try again in ${wait} s.` }, { status: 429, headers: { "Retry-After": String(wait) } });
  }
  const replay = replayMode ? findClosestReplay(query) : null;
  if (replayMode && !replay) return json(503, "Replay mode is on but data/replays has no recorded run.");
  if (!replay && !process.env.ANTHROPIC_API_KEY) return json(503, "The live agent is not configured (no model key on the server).");
  if (!replay && liveRuns >= MAX_LIVE_RUNS) return json(429, "The scout is busy. Try again in a minute.");

  const envSpeed = Number(process.env.FOREGROUND_REPLAY_SPEED);
  const replaySpeed = speed ?? (envSpeed > 0 ? envSpeed : 1);
  const recorder = !replay && process.env.FOREGROUND_RECORD === "1" ? createRecorder(query) : null;

  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort(), { once: true });
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const live = !replay;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          closed = true;
          abort.abort();
        }
      };
      if (live) liveRuns += 1;
      send(`: foreground agent ${replay ? "replay" : "live"}\n\n`);
      heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);
      try {
        const events: AsyncIterable<AgentEvent> = replay
          ? playReplay(replay, { speed: replaySpeed, signal: abort.signal })
          : runAgent(query, { signal: abort.signal });
        for await (const event of events) {
          recorder?.push(event);
          send(toSse(event));
        }
        if (recorder && !abort.signal.aborted) {
          const doc = recorder.finish();
          if (isCompleteRun(doc)) saveReplay(doc);
        }
      } catch (err) {
        if (!abort.signal.aborted) {
          console.error("[api/agent] run failed:", err instanceof Error ? err.message : err);
          send(toSse({ type: "error", message: "The scout hit a problem. Try again." }));
          send(toSse({ type: "done" }));
        }
      } finally {
        clearInterval(heartbeat);
        if (live) liveRuns -= 1;
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      }
    },
    cancel() {
      clearInterval(heartbeat);
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Foreground-Mode": replay ? "replay" : "live",
      ...(replay ? { "X-Foreground-Recorded-Query": encodeURIComponent(replay.query) } : {}),
    },
  });
}
