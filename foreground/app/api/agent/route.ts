import { spawn } from "node:child_process";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { NextResponse } from "next/server";
import type { Match } from "../../lib/matches";
import { answerFio, loadFioContext } from "../../lib/fio";

// walk.html's "Ask Fio" bar posts here (same contract as run_all.py's serve step). The Gemini call stays in
// modeling/scene_agent.py, run as a local Python process; GEMINI_API_KEY is read from the repo's .env by that process
// and never reaches the browser. Only exact /api/agent is handled here; /api/agent/run and /replay still go to FastAPI.
const ROOT = process.env.SCAN_ASSETS_DIR || path.resolve(process.cwd(), "..");
const MODELING = process.env.MODELING_DIR || path.resolve(process.cwd(), "..", "modeling");
const PYTHON = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");

const API = process.env.API_URL ?? "http://127.0.0.1:8000";

/** True when a model key is configured (environment or the repo .env), so the Gemini scene agent can run. */
function hasModelKey(): boolean {
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return true;
  try {
    const f = path.join(ROOT, ".env");
    return existsSync(f) && /^\s*(GEMINI_API_KEY|GOOGLE_API_KEY)\s*=\s*\S/m.test(readFileSync(f, "utf8"));
  } catch {
    return false;
  }
}

type Block = { type?: string; text?: string };
/** The user's typed request from walk.html's last chat message (it prefixes the scene state, then "Request: <typed text>"). */
function lastRequest(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { role?: string; content?: string | Block[] };
    if (m?.role !== "user") continue;
    const texts = typeof m.content === "string" ? [m.content] : (m.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "");
    const t = texts.join("\n");
    const k = t.lastIndexOf("Request:");
    if (k >= 0) return t.slice(k + 8).trim();
    if (texts.length) return t.trim();
  }
  return "";
}

const EDIT_REQUEST = /\b(move|push|rotate|turn|remove|delete|add|place|put|swap|rearrange|arrange)\b.*\b(sofa|chair|table|desk|counter|armchair|stool|shelf|plant|lamp|bench|furniture|wall|object|piece)\b/i;

/** No-key path: answer from the open property's real data (same answerer as the app's Fio panel). Always HTTP 200 with a text reply. */
async function localAnswer(body: { messages?: unknown; fio?: { match?: Match } }) {
  const question = lastRequest(body.messages);
  const match = body.fio?.match;
  let text: string;
  if (!match) text = "I do not know which property this scan belongs to. Open it from the matches page (View Info), then reopen the walk, and I can answer from its data.";
  else if (EDIT_REQUEST.test(question)) text = "Moving furniture by typing needs a model key, which is not configured here. You can still drag pieces by hand or add them from the Catalogue (C). I can answer questions about this property: cost, seats, hazards, history, forecasts, next steps and fit.";
  else text = answerFio(match, await loadFioContext(match.listingId, API), question || "help");
  return { content: [{ type: "text", text }], stop_reason: "end_turn", model: "fio-local" };
}

const RUNNER = `
import json, os, sys
from pathlib import Path
env = Path(".env")
if env.exists():
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
sys.path.insert(0, os.environ["WALK_MODELING_DIR"])
import scene_agent
try:
    status, out = scene_agent.handle(json.load(sys.stdin))
except Exception as e:
    status, out = 500, {"error": f"{type(e).__name__}: {e}"}
sys.stdout.write(json.dumps({"status": status, "body": out}))
`;

export async function POST(request: Request) {
  const origin = request.headers.get("origin") || "";
  if (request.headers.get("x-walk-agent") !== "1" || (origin && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.text();
  if (body.length > 20 * 1024 * 1024) return NextResponse.json({ error: "Request too large" }, { status: 413 });

  if (!hasModelKey()) {
    try {
      return NextResponse.json(await localAnswer(JSON.parse(body)));
    } catch {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }
  }

  const result = await new Promise<{ status: number; body: unknown }>((resolve) => {
    const child = spawn(PYTHON, ["-c", RUNNER], { cwd: ROOT, env: { ...process.env, WALK_MODELING_DIR: MODELING }, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("error", (e) => resolve({ status: 500, body: { error: `Could not start Python: ${e.message}` } }));
    child.on("close", () => {
      try {
        resolve(JSON.parse(out));
      } catch {
        resolve({ status: 500, body: { error: "The scene agent returned no result." } });
      }
    });
    child.stdin.end(body);
  });
  // No Gemini key is expected on a demo machine: answer 200 with an error body so the viewer falls back to its demo assistant without a failed request.
  return NextResponse.json(result.body, { status: result.status === 503 ? 200 : result.status });
}
