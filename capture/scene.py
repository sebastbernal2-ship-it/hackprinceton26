"""scene.json writer: the bundle the walkthrough viewer loads.

Bundle layout (all in one directory):
  scene.json      this file's output (schema below)
  world.spz       the reconstruction, already in the viewer frame: metres, +Y up, floor at y = 0
  world-seen.spz / world-imagined.spz   the same splats split by reality.json
  reality.json    seen vs imagined report
  cameras.json    the input views (position + xyzw quaternion, OpenGL, viewer frame) for flythrough / pin evidence
  thumb.jpg       preview

scene.json: {version, units:"meters", up:"y", world:{file, format, splatCount, transform:identity},
  floorY, floorFound, bounds:{min,max}, spawn:{position,yaw}, scale:{method, factor, cameraHeight},
  cameras:"cameras.json", reality:"reality.json", capture:{...}}
"""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

SCENE_VERSION = 1
IDENTITY_TRANSFORM = {"position": [0.0, 0.0, 0.0], "quaternion": [0.0, 0.0, 0.0, 1.0], "scale": 1.0}


def write_json_atomic(path: Path | str, obj) -> None:
    path = Path(path)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".tmp-", suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(obj, f, indent=2)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def build_scene(*, world_file: str, splat_count: int, bounds: dict, floor_found: bool, spawn: dict,
                scale: dict, capture: dict, thumb: str | None = None, fmt: str = "spz") -> dict:
    """Assemble the scene.json dict. `bounds` is {min:[x,y,z], max:[x,y,z]} in metres in the viewer frame.
    Raises ValueError for a bundle the viewer could not place (empty splats, inverted/non-finite bounds)."""
    if splat_count <= 0:
        raise ValueError("scene has no splats")
    lo, hi = bounds["min"], bounds["max"]
    if len(lo) != 3 or len(hi) != 3 or not all(map(_finite, [*lo, *hi])) or any(h <= l for l, h in zip(lo, hi)):
        raise ValueError(f"bad bounds {bounds}")
    scene = {
        "version": SCENE_VERSION,
        "units": "meters",
        "up": "y",
        "world": {"file": world_file, "format": fmt, "splatCount": int(splat_count), "transform": dict(IDENTITY_TRANSFORM)},
        "floorY": 0.0 if floor_found else None,
        "floorFound": bool(floor_found),
        "bounds": {"min": [float(v) for v in lo], "max": [float(v) for v in hi]},
        "size": [round(float(h - l), 3) for l, h in zip(lo, hi)],
        "spawn": spawn,
        "scale": scale,
        "cameras": "cameras.json",
        "reality": "reality.json",
        "capture": capture,
    }
    if thumb:
        scene["thumb"] = thumb
    return scene


def _finite(v) -> bool:
    try:
        return v == v and abs(float(v)) != float("inf")
    except (TypeError, ValueError):
        return False
