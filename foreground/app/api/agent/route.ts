import { spawn } from "node:child_process";
import path from "node:path";
import { NextResponse } from "next/server";

// walk.html's "Ask AI" bar posts here (same contract as run_all.py's serve step). The Gemini call stays in
// modeling/scene_agent.py, run as a local Python process; GEMINI_API_KEY is read from the repo's .env by that process
// and never reaches the browser. Only exact /api/agent is handled here; /api/agent/run and /replay still go to FastAPI.
const ROOT = process.env.SCAN_ASSETS_DIR || path.resolve(process.cwd(), "..");
const PYTHON = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");

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
sys.path.insert(0, "modeling")
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

  const result = await new Promise<{ status: number; body: unknown }>((resolve) => {
    const child = spawn(PYTHON, ["-c", RUNNER], { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
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
  return NextResponse.json(result.body, { status: result.status });
}
