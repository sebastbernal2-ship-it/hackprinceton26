import json
import math
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from inspection import hotspots as hs  # noqa: E402
from inspection.anchor import __main__ as cli  # noqa: E402
from inspection.anchor import anchor_box, camera_from_json, cost_totals, load_depth, project, rotate, sample_depth, unproject  # noqa: E402
from inspection.schema import validate_finding  # noqa: E402
from inspection.vision import parse_findings_json  # noqa: E402

CAM = {"width": 100, "height": 100, "fx": 100, "fy": 100, "position": [0, 1.5, 0], "quaternion": [0, 0, 0, 1]}


def flat_depth(z, h=20, w=20):
    return np.full((h, w), z, np.float32)


def test_rotate_90deg_about_y():
    s = math.sqrt(0.5)
    # +90 deg about Y maps -Z (forward) to -X
    assert np.allclose(rotate([0, s, 0, s], [0, 0, -1]), [-1, 0, 0], atol=1e-9)


def test_center_ray_hits_wall_with_standoff():
    # camera at (0,1.5,0) looking down -Z; wall at z-depth 3 -> point (0,1.5,-3) minus 5 cm
    a = anchor_box({"x": .45, "y": .45, "w": .1, "h": .1}, camera_from_json(CAM), flat_depth(3.0))
    assert a["source"] == "depth" and a["depthM"] == 3.0
    assert np.allclose(a["position"], [0, 1.5, -2.95], atol=1e-4)


def test_off_axis_uses_zdepth_not_ray_length():
    # pixel u=75 (nx .75): local dir x = (75-50)/100 = .25. At z-depth 2: x=0.5, z=-2, standoff along ray.
    cam = camera_from_json(CAM)
    a = anchor_box({"x": .70, "y": .45, "w": .1, "h": .1}, cam, flat_depth(2.0))
    ray_len = math.sqrt(.25**2 + 1)  # |dir| with z=-1
    dist = 2.0 * ray_len
    t = dist - 0.05
    expect = [0 + .25 / ray_len * t, 1.5, -1 / ray_len * t]
    assert np.allclose(a["position"], expect, atol=1e-4)
    # un-offset point projects back to the same pixel and depth
    p = unproject(cam, .75, .5, 2.0)
    assert np.allclose(p, [0.5, 1.5, -2.0])
    nx, ny, d = project(cam, p)
    assert (round(nx, 6), round(ny, 6), round(d, 6)) == (.75, .5, 2.0)


def test_pose_rotation_and_translation():
    s = math.sqrt(0.5)
    cam = camera_from_json({**CAM, "position": [1, 1, 1], "quaternion": [0, s, 0, s]})  # looks toward -X
    a = anchor_box({"x": .45, "y": .45, "w": .1, "h": .1}, cam, flat_depth(2.0))
    assert np.allclose(a["position"], [1 - 1.95, 1, 1], atol=1e-4)


def test_floor_clamp_and_missing_depth_gives_null():
    cam = camera_from_json({**CAM, "position": [0, 0.1, 0]})
    a = anchor_box({"x": .45, "y": .9, "w": .1, "h": .05}, cam, flat_depth(1.0))
    assert a["position"][1] >= 0.03
    for d in (np.zeros((20, 20), np.float32), np.full((20, 20), np.nan, np.float32), None):
        r = anchor_box({"x": .4, "y": .4, "w": .2, "h": .2}, camera_from_json(CAM), d)
        assert r["position"] is None and r["confidence"] == "none" and r["source"] is None


def test_null_when_no_camera_no_region_or_range():
    box = {"x": .4, "y": .4, "w": .2, "h": .2}
    assert anchor_box(box, None, flat_depth(2))["position"] is None
    assert anchor_box(None, camera_from_json(CAM), flat_depth(2))["position"] is None
    assert anchor_box(box, camera_from_json(CAM), flat_depth(50))["position"] is None
    assert anchor_box(box, camera_from_json(CAM), flat_depth(0.05))["position"] is None


def test_sample_depth_prefers_near_percentile_and_widens():
    d = np.full((20, 20), 5.0, np.float32)
    d[10, 10] = 1.0  # the lone near pixel: percentile 0.3 of 25 values -> index 7 -> 5.0
    assert sample_depth(d, .5, .5) == 5.0
    d[8:13, 8:13] = 2.0
    d[10, 10] = 0
    assert sample_depth(d, .5, .5) == 2.0
    hole = np.zeros((20, 20), np.float32)
    hole[10, 16] = 4.0  # outside radius 2, inside radius 6
    assert sample_depth(hole, .5, .5) == 4.0
    assert sample_depth(np.zeros((4, 4), np.float32), .5, .5) is None


def test_load_depth_npy(tmp_path):
    np.save(tmp_path / "a.npy", np.ones((4, 6, 1), np.float64))
    assert load_depth(tmp_path / "a.npy").shape == (4, 6)
    assert load_depth(tmp_path / "a.npy").dtype == np.float32
    np.save(tmp_path / "b.npy", np.ones((2, 2, 3), np.float32))
    with pytest.raises(ValueError):
        load_depth(tmp_path / "b.npy")


def finding(fid, ref, region=None, cat="flooring", cost=("c1",)):
    return {"id": fid, "roomId": None, "category": cat, "title": "t", "description": "d", "severity": "low",
            "modelConfidence": .5, "evidence": {"source": "panorama", "ref": ref,
                                                "region": region or {"x": .45, "y": .45, "w": .1, "h": .1}},
            "canConfirmFromImagery": False, "verificationStep": "v", "costLineItemIds": list(cost)}


def test_cli_end_to_end(tmp_path):
    (tmp_path / "d").mkdir()
    np.save(tmp_path / "d" / "a.npy", flat_depth(3.0))
    fs = [finding("f1", "a.jpg"), finding("f2", "a.jpg", {"x": .1, "y": .1, "w": .1, "h": .1}),
          finding("f3", "missing.jpg"), finding("f4", "b.jpg")]
    np.save(tmp_path / "d" / "b.npy", np.zeros((20, 20), np.float32))
    (tmp_path / "f.json").write_text(json.dumps({"findings": fs}))
    (tmp_path / "p.json").write_text(json.dumps({"a": CAM, "b.jpg": CAM, "missing.jpg": CAM}))
    (tmp_path / "r.json").write_text(json.dumps({"images": {"a.jpg": "observed", "b.jpg": "observed"},
                                                 "imaginedVolumes": [{"min": [-9, 0, -9], "max": [-1, 0.0, 9]}]}))
    out = tmp_path / "o.json"
    cli.main(["--findings", str(tmp_path / "f.json"), "--depth-dir", str(tmp_path / "d"), "--poses",
              str(tmp_path / "p.json"), "--reality", str(tmp_path / "r.json"), "--out", str(out)])
    o = json.loads(out.read_text())
    by = {f["id"]: f for f in o["findings"]}
    assert by["f1"]["anchor"]["position"] and by["f1"]["reality"] == "observed"
    assert by["f2"]["anchor"]["position"] and by["f2"]["reality"] == "observed"
    assert by["f3"]["anchor"]["position"] is None and by["f3"]["reality"] == "inferred"  # not in reality.json
    assert by["f4"]["anchor"]["position"] is None and by["f4"]["reality"] == "observed"   # captured, depth missing
    assert o["totals"] == {"costLineItemCounts": {"c1": 3}, "findingsCounted": 3, "inferredExcluded": 1}
    assert o["anchored"] == 2 and o["total"] == 4
    assert cost_totals(o["findings"], include_inferred=True)["costLineItemCounts"] == {"c1": 4}


def test_imagined_volume_marks_inferred_and_no_reality_default(tmp_path):
    np.save(tmp_path / "a.npy", flat_depth(3.0))
    f = [finding("f1", "a.jpg")]
    r = {"images": {"a": "observed"}, "imaginedVolumes": [{"min": [-1, 0, -4], "max": [1, 3, -2]}]}
    assert cli.run(f, tmp_path, {"a": CAM}, r)["findings"][0]["reality"] == "inferred"
    assert cli.run(f, tmp_path, {"a": CAM}, None)["findings"][0]["reality"] == "observed"
    assert cli.run(f, tmp_path, {}, None)["findings"][0]["reality"] == "inferred"  # no pose -> no anchor


# ---- Gemini provider (mocked; no network) ----
class FakeGemini:
    def __init__(self, script):
        self.script, self.calls = list(script), []

    def generate_json(self, model, system, text, image, mime, schema, low_res):
        self.calls.append((model, low_res, mime))
        r = self.script.pop(0)
        if isinstance(r, Exception):
            raise r
        return r


HOT = {"hotspots": [
    {"label": "Water stain", "box_2d": [100, 200, 300, 600], "category": "ceiling_water_damage", "severity": "high",
     "evidence_visible": "brown ring on tile", "inspector_must_verify": "Check roof above"},
    {"label": "bad box", "box_2d": [5, 5, 5, 5], "category": "other", "severity": "low",
     "evidence_visible": "", "inspector_must_verify": ""},
    {"label": "Weird", "box_2d": [0, 0, 1000, 500], "category": "nonsense", "severity": "extreme",
     "evidence_visible": "x", "inspector_must_verify": ""}]}


def img(tmp_path):
    p = tmp_path / "x.jpg"
    p.write_bytes(b"\xff\xd8fake")
    return p


def test_gemini_converts_boxes_and_validates(tmp_path):
    c = FakeGemini([HOT])
    r = hs.detect_defects(img(tmp_path), c, models=("A", "B"))
    assert r["mode"] == "live" and len(r["findings"]) == 2  # zero-area box dropped
    f = r["findings"][0]
    assert validate_finding(f) == []
    assert f["evidence"]["region"] == {"x": .2, "y": .1, "w": .4, "h": .2}
    assert f["verificationStep"] == "Check roof above" and f["category"] == "ceiling_water_damage"
    g = r["findings"][1]
    assert g["category"] == "other" and g["severity"] == "unknown" and validate_finding(g) == []
    assert c.calls == [("A", True, "image/jpeg")]


@pytest.mark.parametrize("msg", ["429 RESOURCE_EXHAUSTED", "503 UNAVAILABLE"])
def test_gemini_falls_back_on_busy(tmp_path, msg):
    c = FakeGemini([RuntimeError(msg), HOT])
    r = hs.detect_defects(img(tmp_path), c, low_res=False, models=("A", "B"))
    assert [x[0] for x in c.calls] == ["A", "B"] and len(r["findings"]) == 2 and c.calls[0][1] is False


def test_gemini_other_errors_propagate(tmp_path):
    with pytest.raises(RuntimeError):
        hs.detect_defects(img(tmp_path), FakeGemini([RuntimeError("400 bad")]), models=("A", "B"))


def test_gemini_mock_mode_without_key(tmp_path, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    import types
    monkeypatch.setitem(sys.modules, "dotenv", types.SimpleNamespace(load_dotenv=lambda *a, **k: None))
    assert hs.default_gemini_client() is None
    r = hs.detect_defects(img(tmp_path), None)
    assert r["mode"] == "mock" and "MOCK" in r["notice"] and validate_finding(r["findings"][0]) == []


def test_malformed_gemini_payload_is_empty(tmp_path):
    assert hs.detect_defects(img(tmp_path), FakeGemini([{"hotspots": "nope"}]))["findings"] == []
    assert hs.parse_json('```json\n{"a":1}\n```') == {"a": 1}


def test_anthropic_path_still_importable():
    assert parse_findings_json('[{"title":"x"}]') == [{"title": "x"}]
