"""Regenerate the committed SYNTHETIC replay: python -m agent.record_fixture"""
import json
import tempfile
from pathlib import Path

from .fixture_env import ScriptedEnv
from .runner import Run
from .scripted import ScriptedInspector, ScriptedPlanner

GOAL = "Italian restaurant with gelato in Houston, 40 seats, under 250k: find, verify and plan the best candidates"

if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as d:
        evs = Run(GOAL, ScriptedEnv(), ScriptedPlanner(), ScriptedInspector(), mode="SCRIPTED", derived_dir=d).run()
    for e in evs:
        e["syntheticFixture"] = True
        if e["type"] == "final":
            e["brief"].pop("savedTo", None)
    out = Path(__file__).parent / "fixtures" / "replay.synthetic.json"
    out.write_text(json.dumps(evs, indent=1, default=str))
    print(f"wrote {len(evs)} events")
