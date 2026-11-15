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


def test_failed_reanchor_drops_a_stale_anchor(tmp_path):
    _make(tmp_path)
    f = _finding(); f["evidence"]["ref"] = "nope.jpg"
    f["anchor"] = {"x": 9.0, "y": 9.0, "z": 9.0}  # left over from an earlier run
    r = B.build(tmp_path, [f])
    g = r["findings"][0]
    assert "anchor" not in g and g["surfaceStatus"] == "inferred" and r["pinned"] == 0


def test_seen_index_is_built_once_per_bundle(tmp_path, monkeypatch):
    import scipy.spatial as sp
    _make(tmp_path)
    monkeypatch.setattr(B, "seen_means", lambda bundle: np.random.default_rng(0).uniform(-3, 3, (500, 3)))
    built = []
    real = sp.cKDTree
    monkeypatch.setattr(sp, "cKDTree", lambda *a, **k: (built.append(1), real(*a, **k))[1])
    B.build(tmp_path, [_finding(), _finding({"x": 0.3, "y": 0.5, "w": 0.2, "h": 0.2}), _finding({"x": 0.6, "y": 0.6, "w": 0.1, "h": 0.1})])
    assert len(built) <= 1
