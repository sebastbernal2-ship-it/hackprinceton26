"""Glue: capture bundle (capture/run.py output) -> findings the walkthrough viewer can pin.

  python -m inspection.anchor.bundle BUNDLE_DIR [--findings f.json] [--out BUNDLE_DIR/findings.json] [--max-frames N]

Reads BUNDLE_DIR/{cameras.json, depth.npz, frames/, world-seen.spz}. Findings come from --findings (DefectFinding
list whose evidence.ref is a frame name like 003.jpg) or, if omitted, from inspection.hotspots.detect_defects run on
each frame (live Gemini with GEMINI_API_KEY, otherwise ONE labelled MOCK stub per frame).
Each finding is anchored by metric depth (inspection.anchor.geometry), then gated: it is surfaceStatus "captured"
only if the anchor lies within 0.25 m of a SEEN splat (capture.reality.pin_is_supported); otherwise "inferred".
No anchor -> no pin. Output uses the viewer's shape: anchor {x,y,z}, surfaceStatus.
"""
from __future__ import annotations

import argparse
import json
import tempfile
from pathlib import Path

import numpy as np

from .geometry import anchor_box, camera_from_json


def load_bundle(bundle: Path) -> tuple[dict, np.ndarray]:
    cams = json.loads((bundle / "cameras.json").read_text())["cameras"]
    depth = np.load(bundle / "depth.npz")["depth"].astype(np.float32)
    if depth.shape[0] != len(cams):
        raise ValueError(f"{depth.shape[0]} depth maps for {len(cams)} cameras")
    poses = {}
    for c in cams:
        name = Path(c["image"]).name
        poses[name] = {k: c[k] for k in ("width", "height", "fx", "fy", "cx", "cy", "position", "quaternion")}
    return poses, depth


def seen_means(bundle: Path) -> np.ndarray:
    from capture import splat_io as sio  # imported lazily: needs numpy only
    p = bundle / "world-seen.spz"
    return sio.read_spz(p).means if p.is_file() else np.zeros((0, 3))


def build(bundle: Path, findings: list[dict], radius: float = 0.25) -> dict:
    from capture.reality import pin_is_supported
    poses, depth = load_bundle(bundle)
    names = list(poses)
    seen = seen_means(bundle)
    tree = None
    if len(seen):
        from scipy.spatial import cKDTree

        tree = cKDTree(np.asarray(seen, np.float64))  # built once for the whole bundle
    out, pinned, captured = [], 0, 0
    for f in findings:
        ref = Path(str((f.get("evidence") or {}).get("ref", ""))).name
        g = dict(f)
        g.setdefault("roomId", None)  # viewer requires these keys
        g.setdefault("costLineItemIds", [])
        a = None
        if ref in poses:
            a = anchor_box((f.get("evidence") or {}).get("region"), camera_from_json(poses[ref]), depth[names.index(ref)])
        pos = (a or {}).get("position")
        if pos:
            pinned += 1
            ok = bool(len(seen) and pin_is_supported(np.array([pos]), seen, radius, tree)[0])
            g["anchor"] = {"x": pos[0], "y": pos[1], "z": pos[2]}
            g["surfaceStatus"] = "captured" if ok else "inferred"
            captured += ok
        else:
            g.pop("anchor", None)  # never keep a position that this run could not validate
            g["surfaceStatus"] = "inferred"
            g["anchorReason"] = (a or {}).get("reason") or "frame has no camera pose"
        out.append(g)
    return {"findings": out, "pinned": pinned, "capturedPins": captured, "total": len(out)}


def detect(bundle: Path, max_frames: int | None) -> tuple[list[dict], str]:
    from inspection import hotspots
    client = hotspots.default_gemini_client()
    frames = sorted((bundle / "frames").glob("*.jpg"))[:max_frames]
    res, mode = [], "mock"
    for i, fr in enumerate(frames):
        r = hotspots.detect_defects(fr, client, prefix=f"f{i:03d}")
        res += r["findings"]
        mode = r["mode"]
    return res, mode


def main(argv=None):
    ap = argparse.ArgumentParser(prog="python -m inspection.anchor.bundle")
    ap.add_argument("bundle")
    ap.add_argument("--findings")
    ap.add_argument("--out")
    ap.add_argument("--max-frames", type=int)
    a = ap.parse_args(argv)
    b = Path(a.bundle)
    if a.findings:
        d = json.loads(Path(a.findings).read_text())
        findings, mode = (d["findings"] if isinstance(d, dict) else d), "file"
    else:
        findings, mode = detect(b, a.max_frames)
    res = build(b, findings)
    res["mode"] = mode
    out = Path(a.out) if a.out else b / "findings.json"
    out.write_text(json.dumps(res, indent=2))
    print(json.dumps({k: res[k] for k in ("mode", "total", "pinned", "capturedPins")}), "->", out)


if __name__ == "__main__":
    main()
