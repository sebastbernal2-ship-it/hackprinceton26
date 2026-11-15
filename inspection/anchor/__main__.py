"""python -m inspection.anchor --findings f.json --depth-dir d --poses poses.json [--reality r.json] --out out.json

findings.json: a list or {"findings": [...]} of DefectFinding records (evidence.ref = image file name,
evidence.region = normalized box). Depth for image X is <depth-dir>/<stem of X>.npy.
poses.json: {"<image file name or stem>": {width,height,fx,fy,cx,cy,position,quaternion}} (OpenGL, room metres).
"""
import argparse
import json
from pathlib import Path

from .geometry import anchor_box, camera_from_json, load_depth
from .reality import annotate, cost_totals


def _load(path):
    return json.loads(Path(path).read_text())


def run(findings, depth_dir, poses, reality=None, include_inferred=False) -> dict:
    anchors, cache = {}, {}
    for f in findings:
        ev = f.get("evidence") or {}
        ref = str(ev.get("ref", ""))
        stem = Path(ref).stem
        cam = camera_from_json(poses.get(ref) or poses.get(stem))
        if stem not in cache:
            p = Path(depth_dir) / f"{stem}.npy" if depth_dir else None
            try:
                cache[stem] = load_depth(p) if p and p.is_file() else None
            except (ValueError, OSError):
                cache[stem] = None
        anchors[f["id"]] = anchor_box(ev.get("region"), cam, cache[stem])
    done = annotate(findings, anchors, reality)
    return {"findings": done, "totals": cost_totals(done, include_inferred),
            "anchored": sum(1 for f in done if f["anchor"]["position"]), "total": len(done)}


def main(argv=None):
    ap = argparse.ArgumentParser(prog="python -m inspection.anchor")
    ap.add_argument("--findings", required=True); ap.add_argument("--depth-dir", required=True)
    ap.add_argument("--poses", required=True); ap.add_argument("--reality"); ap.add_argument("--out", required=True)
    ap.add_argument("--include-inferred", action="store_true", help="count inferred findings in cost totals")
    a = ap.parse_args(argv)
    data = _load(a.findings)
    findings = data["findings"] if isinstance(data, dict) else data
    reality = _load(a.reality) if a.reality else None
    out = run(findings, a.depth_dir, _load(a.poses), reality, a.include_inferred)
    Path(a.out).write_text(json.dumps(out, indent=2))
    by = {}
    for f in out["findings"]:
        by[f["reality"]] = by.get(f["reality"], 0) + 1
    print(json.dumps({"anchored": out["anchored"], "total": out["total"], "reality": by, "totals": out["totals"]}))


if __name__ == "__main__":
    main()
