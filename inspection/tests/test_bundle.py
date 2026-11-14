import json
from pathlib import Path

import numpy as np

from inspection.anchor import bundle as B


def _make(tmp: Path):
    cam = {"index": 0, "image": "frames/000.jpg", "position": [0, 1.5, 0], "quaternion": [0, 0, 0, 1],
           "fx": 100, "fy": 100, "cx": 50, "cy": 50, "width": 100, "height": 100}
    (tmp / "cameras.json").write_text(json.dumps({"cameras": [cam]}))
    np.savez(tmp / "depth.npz", depth=np.full((1, 100, 100), 3.0, np.float16))


def _finding(region=None):
    return {"id": "a", "evidence": {"ref": "000.jpg", "region": region or {"x": 0.4, "y": 0.4, "w": 0.2, "h": 0.2}}}


def test_anchor_gate_without_seen_splats_is_inferred(tmp_path):
    _make(tmp_path)
    r = B.build(tmp_path, [_finding()])
    f = r["findings"][0]
    assert r["pinned"] == 1 and r["capturedPins"] == 0
    assert abs(f["anchor"]["z"] - (-2.95)) < 0.01 and f["surfaceStatus"] == "inferred"


def test_unknown_frame_gets_no_pin(tmp_path):
    _make(tmp_path)
    f = _finding(); f["evidence"]["ref"] = "nope.jpg"
    r = B.build(tmp_path, [f])
    assert "anchor" not in r["findings"][0] and r["pinned"] == 0
