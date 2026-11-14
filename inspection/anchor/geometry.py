"""Pinhole unprojection of a normalized image region onto a metric depth map.

Ported from the user's Deja-View web/src/viewer/guide/hotspots.ts (sampleDepth, pixelRay, placeHotspot depth
branch), reduced to numpy. Conventions are Deja-View's: OpenGL camera (looks down -Z, +Y up), quaternion
[x, y, z, w], intrinsics in pixels of (width, height), depth maps are z-depth (not ray length), row-major,
top row first, 0 or non-finite = no data. Room frame is metres, +Y up.

An anchor is only ever produced from a real depth sample. No data -> position None, never a guess.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np

STAND_OFF_M = 0.05      # anchor this far in front of the surface (Deja-View standOff)
MIN_DIST_M = 0.15       # nearer than this is noise
MAX_DIST_M = 8.0        # farther than this is not trusted
MIN_HEIGHT_M = 0.03     # pins are not placed below the floor plane


@dataclass(frozen=True)
class Camera:
    width: float
    height: float
    fx: float
    fy: float
    cx: float
    cy: float
    position: tuple[float, float, float]
    quaternion: tuple[float, float, float, float]  # x, y, z, w


def _finite(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and np.isfinite(v)


def camera_from_json(j: dict) -> Camera | None:
    """Camera dict (width,height,fx,[fy,cx,cy],position,quaternion) -> Camera; None when unusable."""
    if not isinstance(j, dict):
        return None
    w, h, fx = j.get("width"), j.get("height"), j.get("fx")
    if not (_finite(w) and _finite(h) and w > 0 and h > 0 and _finite(fx) and fx > 0):
        return None
    pos, quat = j.get("position", [0, 0, 0]), j.get("quaternion", [0, 0, 0, 1])
    if not (isinstance(pos, (list, tuple)) and len(pos) == 3 and all(_finite(x) for x in pos)):
        return None
    if not (isinstance(quat, (list, tuple)) and len(quat) == 4 and all(_finite(x) for x in quat)):
        return None
    n = float(np.linalg.norm(quat))
    if n == 0:
        return None
    fy = j.get("fy")
    return Camera(float(w), float(h), float(fx), float(fy) if _finite(fy) and fy > 0 else float(fx),
                  float(j["cx"]) if _finite(j.get("cx")) else w / 2,
                  float(j["cy"]) if _finite(j.get("cy")) else h / 2,
                  tuple(float(x) for x in pos), tuple(float(x) / n for x in quat))


def load_depth(path: str | Path) -> np.ndarray:
    """Load a .npy depth map as float32 H x W (accepts H x W x 1). Raises ValueError on a bad shape."""
    a = np.load(Path(path), allow_pickle=False)
    if a.ndim == 3 and a.shape[2] == 1:
        a = a[:, :, 0]
    if a.ndim != 2:
        raise ValueError(f"depth must be H x W, got shape {a.shape}")
    return np.ascontiguousarray(a, dtype=np.float32)


def rotate(q, v) -> np.ndarray:
    """Rotate vector v by unit quaternion q = [x, y, z, w]."""
    qv, w = np.asarray(q[:3], float), float(q[3])
    v = np.asarray(v, float)
    t = 2.0 * np.cross(qv, v)
    return v + w * t + np.cross(qv, t)


def pixel_ray(cam: Camera, nx: float, ny: float) -> tuple[np.ndarray, np.ndarray]:
    """(origin, dir) through normalized image position (x right, y down). dir has camera-space z = -1, so
    origin + dir * z_depth is the point at that z-depth."""
    local = np.array([(nx * cam.width - cam.cx) / cam.fx, -(ny * cam.height - cam.cy) / cam.fy, -1.0])
    return np.array(cam.position, float), rotate(cam.quaternion, local)


def unproject(cam: Camera, nx: float, ny: float, depth: float) -> np.ndarray:
    o, d = pixel_ray(cam, nx, ny)
    return o + d * depth


def project(cam: Camera, p) -> tuple[float, float, float] | None:
    """Inverse of unproject: (nx, ny, z_depth), None if behind the camera."""
    q = cam.quaternion
    c = rotate((-q[0], -q[1], -q[2], q[3]), np.asarray(p, float) - np.array(cam.position))
    depth = -c[2]
    if depth <= 1e-6:
        return None
    return ((cam.cx + c[0] / depth * cam.fx) / cam.width, (cam.cy - c[1] / depth * cam.fy) / cam.height, float(depth))


def sample_depth(depth: np.ndarray, nx: float, ny: float, radius: int = 2, percentile: float = 0.3) -> float | None:
    """Low percentile of valid values in a small window (favours the nearer surface); widens x3 once; else None."""
    h, w = depth.shape
    col = int(min(w - 1, max(0, np.floor(nx * w))))
    row = int(min(h - 1, max(0, np.floor(ny * h))))
    for r in (radius, radius * 3):
        win = depth[max(0, row - r):min(h - 1, row + r) + 1, max(0, col - r):min(w - 1, col + r) + 1]
        vals = np.sort(win[np.isfinite(win) & (win > 0)])
        if vals.size:
            return float(vals[min(vals.size - 1, int(np.floor(percentile * vals.size)))])
    return None


def anchor_box(box: dict, cam: Camera | None, depth: np.ndarray | None, stand_off: float = STAND_OFF_M,
               max_dist: float = MAX_DIST_M) -> dict:
    """Anchor a normalized region {x,y,w,h} (0-1, origin top-left) in room metres.

    Returns {position: [x,y,z] | None, source: 'depth' | None, depthM, confidence: 'depth' | 'none', reason}.
    The box centre is the sample point. position is None (never guessed) when the camera, depth map or a valid
    depth sample at the centre is missing.
    """
    def none(reason):
        return {"position": None, "source": None, "depthM": None, "confidence": "none", "reason": reason}
    try:
        nx, ny = float(box["x"]) + float(box["w"]) / 2, float(box["y"]) + float(box["h"]) / 2
    except (KeyError, TypeError, ValueError):
        return none("no region")
    if not (np.isfinite(nx) and np.isfinite(ny)) or not (0 <= nx <= 1 and 0 <= ny <= 1):
        return none("region outside image")
    if cam is None:
        return none("no camera pose")
    if depth is None or depth.size == 0:
        return none("no depth map")
    z = sample_depth(depth, nx, ny)
    if z is None:
        return none("no valid depth at region")
    origin, d = pixel_ray(cam, nx, ny)
    dist = z * float(np.linalg.norm(d))  # z-depth -> distance along the unit ray
    if not (MIN_DIST_M < dist <= max_dist):
        return none(f"depth {z:.2f} m outside trusted range")
    unit = d / np.linalg.norm(d)
    p = origin + unit * max(MIN_DIST_M, dist - stand_off)
    p[1] = max(MIN_HEIGHT_M, p[1])
    return {"position": [round(float(x), 4) for x in p], "source": "depth", "depthM": round(z, 4),
            "confidence": "depth", "reason": None}
