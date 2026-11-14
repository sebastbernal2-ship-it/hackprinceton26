"""POST /api/agent/run (SSE) and GET /api/agent/replay (SSE). Provider: anthropic | local | scripted | auto."""
import itertools
import json
import os
import sys
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from agent import providers, runner  # noqa: E402
from agent.fixture_env import ScriptedEnv  # noqa: E402
from agent.scripted import ScriptedInspector, ScriptedPlanner  # noqa: E402
from agent.tools import LiveEnv  # noqa: E402

router = APIRouter()
FIXTURE = ROOT / "agent" / "fixtures" / "replay.synthetic.json"
SANITIZED = ROOT / "agent" / "fixtures" / "replay.local-qwen.sanitized.json"


class RunRequest(BaseModel):
    goal: str
    provider: str = "auto"  # auto | anthropic | local | scripted
    record: bool = False


def _sse(events):
    for e in events:
        yield f"event: {e['type']}\ndata: {json.dumps(e, default=str)}\n\n"


def _local_replay_path() -> Path:
    return Path(os.environ.get("DERIVED_DIR", "data/derived")) / "agent" / "replay.json"


def build_run(req: RunRequest):
    """(Run, None) or (None, reason). auto: a configured provider, else SCRIPTED policy over the live tools."""
    from app import loader
    if loader.load_matches() is None:
        return None, "CoStar data unavailable (COSTAR_NORMALIZED_DIR); use GET /api/agent/replay"
    env = LiveEnv()
    name = req.provider
    if name == "auto":
        name = "anthropic" if os.environ.get("ANTHROPIC_API_KEY") else ("local" if os.environ.get("LOCAL_LLM_BASE_URL") else "scripted")
    if name == "scripted":
        planner, sub, mode = ScriptedPlanner(), ScriptedInspector(), "SCRIPTED"
    elif name == "anthropic":
        planner, sub, mode = providers.AnthropicProvider(providers.PLANNER_MODEL), providers.AnthropicProvider(providers.SUBAGENT_MODEL), "LIVE"
    elif name == "local":
        planner = sub = providers.OpenAICompatProvider()
        mode = "LIVE"
    else:
        return None, f"unknown provider {name!r}"
    rec = _local_replay_path() if req.record else None
    return runner.Run(req.goal, env, planner, sub, mode=mode, record=rec), None


@router.post("/api/agent/run")
def agent_run(req: RunRequest):
    try:
        run, why = build_run(req)
    except Exception as e:  # noqa: BLE001 - e.g. missing SDK or key
        run, why = None, f"{type(e).__name__}: {e}"
    if run is None:
        err = {"type": "error", "mode": "NONE", "message": why}
        return StreamingResponse(_sse([err]), media_type="text/event-stream")

    def gen():
        evs = []
        for e in run.stream():
            evs.append(e)
            yield from _sse([e])
        if run.record:
            run.record.parent.mkdir(parents=True, exist_ok=True)
            run.record.write_text(json.dumps(evs, indent=1, default=str))
    return StreamingResponse(gen(), media_type="text/event-stream")


@router.get("/api/agent/replay")
def agent_replay(delay: float = 0.0, source: str = "auto"):
    """Replays a recorded trace. 'local' = last recorded run on local data (not committed); 'fixture' = SYNTHETIC."""
    # Three tiers: the unmasked local recording (gitignored, real), then the committed sanitized recording of the same
    # run (addresses and ids masked), then the synthetic fixture.
    p = _local_replay_path()
    if source in ("auto", "local") and p.is_file():
        path, kind = p, "local-recorded-run"
    elif source in ("auto", "sanitized") and SANITIZED.is_file():
        path, kind = SANITIZED, "recorded-run-sanitized"
    else:
        path, kind = FIXTURE, "SYNTHETIC-fixture"
    if not path.is_file():
        err = {"type": "error", "mode": "NONE", "message": "no recorded trace available"}
        return StreamingResponse(_sse([err]), media_type="text/event-stream")
    events = json.loads(path.read_text())
    first = events[0] if events and isinstance(events[0], dict) else {}
    notes = {"local-recorded-run": "Recorded trace replayed; not a live run.",
             "recorded-run-sanitized": "Recorded trace replayed; not a live run. Property addresses and ids are masked for public display.",
             "SYNTHETIC-fixture": "Recorded trace replayed; not a live run. Values are synthetic."}
    note = {"type": "replay_info", "mode": "REPLAY", "source": kind, "note": notes[kind],
            "recordedFrom": {"originalMode": first.get("mode"), "provider": first.get("provider"), "model": first.get("model"),
                             "date": first.get("date")}}
    return StreamingResponse(_sse(itertools.chain([note], runner.replay(events, min(max(delay, 0.0), 2.0)))), media_type="text/event-stream")
