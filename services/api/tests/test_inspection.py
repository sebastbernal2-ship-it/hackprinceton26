import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from app.main import app  # noqa: E402
from inspection import run as run_mod  # noqa: E402
from inspection.cost_link import link_costs  # noqa: E402
from inspection.geometry import geometry_findings  # noqa: E402
from inspection.schema import validate_finding  # noqa: E402
from inspection.vision import load_fixture, parse_findings_json, run_vision  # noqa: E402

client = TestClient(app)


class FakeClient:
    def __init__(self, text):
        self.text, self.calls = text, 0

    def analyze(self, image_bytes, media_type, system):
        self.calls += 1
        return self.text


GOOD = json.dumps([
    {"category": "flooring", "title": "Cracked tile", "description": "d", "severity": "high",
     "modelConfidence": 0.7, "region": {"x": .1, "y": .2, "w": .3, "h": .1}, "canConfirmFromImagery": True,
     "verificationStep": "Inspect"},
    {"category": "bogus", "title": "Odd", "severity": "catastrophic", "modelConfidence": 7},
    {"description": "no title"}])


def imgs(tmp_path, n=2):
    for i in range(n):
        (tmp_path / f"p{i}.jpg").write_bytes(b"\xff\xd8fake")
    return sorted(tmp_path.glob("*.jpg"))


def test_live_validates_and_coerces(tmp_path):
    c = FakeClient("```json\n" + GOOD + "\n```")
    res = run_vision(imgs(tmp_path), c)
    assert res["mode"] == "live" and c.calls == 2
    assert len(res["findings"]) == 4  # 2 valid per image, untitled dropped
    for f in res["findings"]:
        assert validate_finding(f) == []
    odd = [f for f in res["findings"] if f["title"] == "Odd"][0]
    assert (odd["category"], odd["severity"], odd["modelConfidence"]) == ("other", "unknown", 1.0)
    assert odd["verificationStep"]


def test_max_images(tmp_path):
    c = FakeClient("[]")
    run_vision(imgs(tmp_path, 9), c, max_images=6)
    assert c.calls == 6


def test_fixture_when_no_client_or_images(tmp_path):
    for res in (run_vision(imgs(tmp_path), None), run_vision([], FakeClient("[]"))):
        assert res["mode"] == "fixture" and "SAMPLE" in res["notice"]
        assert all(f["title"].startswith("[SAMPLE]") and not validate_finding(f) for f in res["findings"])


def test_all_failures_fall_back_to_fixture(tmp_path):
    class Boom:
        def analyze(self, *a): raise RuntimeError("x")
    assert run_vision(imgs(tmp_path), Boom())["mode"] == "fixture"


def test_parse_garbage():
    assert parse_findings_json("not json") == [] and parse_findings_json('{"a":1}') == []


PLAN = {"rooms": [
    {"id": "k", "label": "Kitchen", "polygon": [[0, 0], [8, 0], [8, 1.8], [0, 1.8]], "area_m2": 14.4, "height_m": 2.4},
    {"id": "d", "label": "Dining", "polygon": [[0, 2], [10, 2], [10, 12], [0, 12]], "area_m2": 100, "height_m": 3.0},
    {"id": "l", "label": "Storage", "polygon": [[0, 0], [10, 0], [10, 10], [8, 10], [8, 2], [0, 2]], "area_m2": 36, "height_m": 3},
]}


def test_geometry_rules():
    fs = geometry_findings(PLAN)
    titles = " | ".join(f["title"] for f in fs)
    assert "Narrow Kitchen" in titles and "Low ceiling" in titles and "Long narrow Kitchen" in titles
    assert "Small prep" in titles and "Irregular shape in Storage" in titles
    for f in fs:
        assert validate_finding(f) == [] and f["evidence"]["source"] == "floorplan_geometry"
        assert "Rule:" in f["description"] and "ASSUMPTION" in f["description"]
    assert geometry_findings({"rooms": []}) == []


def test_cost_link_missing_stays_empty():
    fs = link_costs(load_fixture(), {"electrical": ["elec.panel"]})
    by = {f["category"]: f["costLineItemIds"] for f in fs}
    assert by["electrical"] == ["elec.panel"] and by["ceiling_water_damage"] == []


def test_cli_and_endpoint(tmp_path, monkeypatch):
    plan = tmp_path / "plan.json"; plan.write_text(json.dumps(PLAN))
    out = tmp_path / "out"
    monkeypatch.setattr(run_mod, "default_client", lambda: None)
    run_mod.main(["--plan", str(plan), "--listing-id", "5", "--out", str(out)])
    monkeypatch.setenv("INSPECTION_DIR", str(out))
    r = client.get("/api/property/5/inspection").json()
    assert r["mode"] == "fixture" and any(f["evidence"]["source"] == "floorplan_geometry" for f in r["findings"])


def test_endpoint_none(tmp_path, monkeypatch):
    monkeypatch.setenv("INSPECTION_DIR", str(tmp_path)); monkeypatch.delenv("INSPECTION_FIXTURE", raising=False)
    r = client.get("/api/property/9/inspection").json()
    assert r["mode"] == "none" and r["findings"] == []
    monkeypatch.setenv("INSPECTION_FIXTURE", "1")
    assert client.get("/api/property/9/inspection").json()["mode"] == "fixture"


def test_box_2d_and_reality_check(tmp_path):
    raw = json.dumps([
        {"category": "flooring", "title": "Cracked tile", "severity": "medium", "modelConfidence": 0.6,
         "box_2d": [100, 200, 300, 600], "grounding": "observed", "visibleEvidence": "diagonal crack near door"},
        {"category": "flooring", "title": "Claims observed, no evidence", "modelConfidence": 0.6,
         "box_2d": [0, 0, 500, 500], "grounding": "observed"},
        {"category": "kitchen_infrastructure", "title": "No grease hood visible", "modelConfidence": 0.5,
         "box_2d": [0, 0, 500, 500], "grounding": "observed", "visibleEvidence": "ceiling"},
        {"category": "hvac", "title": "Vague", "modelConfidence": 0.1, "grounding": "observed", "visibleEvidence": "x"},
        {"category": "other", "title": "Bad box", "box_2d": [500, 500, 100, 100], "modelConfidence": 0.5},
        {"category": "other", "title": "Model says unknown", "box_2d": [0, 0, 10, 10], "grounding": "unknown",
         "visibleEvidence": "y", "modelConfidence": 0.9}])
    fs = {f["title"]: f for f in run_vision(imgs(tmp_path, 1), FakeClient(raw))["findings"]}
    a = fs["Cracked tile"]
    assert a["evidence"]["region"] == pytest.approx({"x": .2, "y": .1, "w": .4, "h": .2})
    assert a["grounding"] == "observed" and a["framing"] == "hypothesis" and a["verificationStep"]
    assert fs["Claims observed, no evidence"]["grounding"] == "inferred"
    assert fs["No grease hood visible"]["grounding"] == "inferred"
    assert fs["Vague"]["grounding"] == "unknown"
    assert fs["Bad box"]["evidence"]["region"] is None and fs["Bad box"]["grounding"] == "unknown"
    assert fs["Model says unknown"]["grounding"] == "unknown"
    for f in fs.values():
        assert validate_finding(f) == []
