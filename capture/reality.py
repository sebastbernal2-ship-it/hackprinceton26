"""Reality check: split a reconstructed room into what the cameras SAW and what the model IMAGINED.

Adapted from Deja-View pipeline/reality_split.py (single input camera) to a multi-view walkthrough: a splat is
SEEN when at least one input view sees it, i.e. it projects inside that view's frame and nothing in front of it
hides it from that camera (its depth along the view axis is no further than that view's reference depth there,
plus a tolerance). Everything else (outside every frame, or hidden in every view that covers it) is IMAGINED.

Findings (defect pins) must sit on SEEN surfaces: `surface_support` and `pin_is_supported` check a 3D point
against the seen splats.

Pure numpy/scipy; all positions are in the viewer frame (metres, +Y up, floor at y = 0).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from . import splat_io as sio

REALITY_VERSION = 1
DEFAULT_ABS_TOL = 0.08  # metres behind the reference surface that still count as that surface
DEFAULT_REL_TOL = 0.06  # plus this fraction of the reference depth (depth maps get coarser with distance)
NEAR = 0.05  # metres in front of the camera
ZBUFFER_LONG_SIDE = 256


@dataclass
class View:
    """Pinhole camera in the viewer frame. Pixel i spans [i, i+1). c2w is OpenGL (looks down -Z, +Y up)."""

    width: int
    height: int
    fx: float
    fy: float
    cx: float
    cy: float
    c2w: np.ndarray
    name: str = ""
    depth: np.ndarray | None = None  # optional stored z-depth (metres) covering the image; 0 = no data


def _filter3(d: np.ndarray, op) -> np.ndarray:
    """3x3 min or max filter of a depth map where 0 or inf (no data) counts as infinitely far."""
    x = np.where(d > 0, d, np.inf).astype(np.float32)
    out = x.copy()
    h, w = x.shape
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx == 0 and dy == 0:
                continue
            ys, yd = slice(max(dy, 0), h + min(dy, 0)), slice(max(-dy, 0), h + min(-dy, 0))
            xs, xd = slice(max(dx, 0), w + min(dx, 0)), slice(max(-dx, 0), w + min(-dx, 0))
            op(out[yd, xd], x[ys, xs], out=out[yd, xd])
    return out


def max3(d: np.ndarray) -> np.ndarray:
    """Edge leniency: a splat just behind a silhouette is compared with the far side of the edge."""
    return _filter3(d, np.maximum)


def close_see_through(d: np.ndarray) -> np.ndarray:
    """Morphological closing of the near surface: a z-buffer of discrete splats has pinholes where farther
    splats show through a surface; this fills them and keeps object outlines."""
    out = _filter3(_filter3(d, np.minimum), np.maximum)
    out[~np.isfinite(out)] = 0.0
    return out


def reference_depth(splats_viewer: sio.Splats, view: View, long_side: int = ZBUFFER_LONG_SIDE) -> np.ndarray:
    """Depth the view saw: z-buffer of the splats from that camera (closed), holes filled from stored depth if any."""
    s = min(1.0, long_side / max(view.width, view.height))
    dw, dh = max(8, int(round(view.width * s))), max(8, int(round(view.height * s)))
    sx, sy = dw / view.width, dh / view.height
    z = sio.render_points(splats_viewer, view.c2w, view.fx * sx, view.fy * sy, view.cx * sx, view.cy * sy, dw, dh,
                          min_opacity=0.3, max_radius=5, fill_holes=True).depth
    return close_see_through(z.astype(np.float32))


def project_points(means: np.ndarray, view: View) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Returns (u, v, z, in_front); z positive along the view axis."""
    P = np.asarray(means, np.float64)
    w2c = np.linalg.inv(view.c2w)
    pc = P @ w2c[:3, :3].T + w2c[:3, 3]
    z = -pc[:, 2]
    in_front = np.isfinite(z) & (z > NEAR)
    zs = np.where(in_front, z, 1.0)
    u = view.cx + view.fx * pc[:, 0] / zs
    v = view.cy - view.fy * pc[:, 1] / zs
    in_front &= np.isfinite(u) & np.isfinite(v)
    return u, v, z, in_front


def classify_seen(means: np.ndarray, view: View, depth: np.ndarray,
                  abs_tol: float = DEFAULT_ABS_TOL, rel_tol: float = DEFAULT_REL_TOL, margin: float = 0.0) -> np.ndarray:
    """Boolean mask: True where the splat centre is SEEN by `view` given reference `depth` (covering the image).
    `margin` shrinks the usable frame by that fraction on every side (edges of a frame are unreliable)."""
    u, v, z, ok = project_points(means, view)
    x0, x1 = margin * view.width, (1 - margin) * view.width
    y0, y1 = margin * view.height, (1 - margin) * view.height
    ok &= (u >= x0) & (u < x1) & (v >= y0) & (v < y1)
    dh, dw = depth.shape
    col = np.clip(np.floor(np.where(ok, u, 0) * dw / view.width), 0, dw - 1).astype(np.int64)
    row = np.clip(np.floor(np.where(ok, v, 0) * dh / view.height), 0, dh - 1).astype(np.int64)
    far = max3(depth)[row, col].astype(np.float64)
    limit = far * (1.0 + rel_tol) + abs_tol  # inf where nothing was in the way
    return ok & (z <= limit)


@dataclass
class RealityResult:
    seen: np.ndarray  # bool [N]
    view_count: np.ndarray  # int [N]: how many views see each splat
    per_view_seen: list[int] = field(default_factory=list)

    @property
    def seen_fraction(self) -> float:
        return float(self.seen.mean()) if len(self.seen) else 0.0


def classify_views(means: np.ndarray, views: list[View], depths: list[np.ndarray],
                   abs_tol: float = DEFAULT_ABS_TOL, rel_tol: float = DEFAULT_REL_TOL, margin: float = 0.02) -> RealityResult:
    """Union over views of `classify_seen`."""
    count = np.zeros(len(means), np.int32)
    per_view = []
    for view, depth in zip(views, depths):
        m = classify_seen(means, view, depth, abs_tol, rel_tol, margin)
        count += m
        per_view.append(int(m.sum()))
    return RealityResult(count > 0, count, per_view)


def surface_support(points: np.ndarray, seen_means: np.ndarray, radius: float = 0.25) -> np.ndarray:
    """Distance (metres) from each 3D point to the nearest SEEN splat; inf when there are none."""
    pts = np.asarray(points, np.float64).reshape(-1, 3)
    if len(seen_means) == 0:
        return np.full(len(pts), np.inf)
    from scipy.spatial import cKDTree

    d, _ = cKDTree(np.asarray(seen_means, np.float64)).query(pts, k=1, distance_upper_bound=max(radius, 1e-6) * 50)
    return d


def pin_is_supported(points: np.ndarray, seen_means: np.ndarray, radius: float = 0.25) -> np.ndarray:
    """True where a pin position lies within `radius` metres of a captured (seen) surface."""
    return surface_support(points, seen_means, radius) <= radius


def reality_report(world_file: str, seen_file: str, imagined_file: str, result: RealityResult, views: list[View],
                   abs_tol: float, rel_tol: float, seconds: float, depth_scale: dict | None = None) -> dict:
    n = len(result.seen)
    n_seen = int(result.seen.sum())
    vc = result.view_count
    return {
        "version": REALITY_VERSION,
        "world": world_file,
        "seen": {"file": seen_file, "count": n_seen},
        "imagined": {"file": imagined_file, "count": n - n_seen},
        "total": n,
        "seenFraction": round(n_seen / max(1, n), 4),
        "viewCountMedianOfSeen": float(np.median(vc[vc > 0])) if (vc > 0).any() else 0.0,
        "views": len(views),
        "perViewSeen": result.per_view_seen,
        "tolerance": {"abs": abs_tol, "rel": rel_tol},
        "rule": "seen = inside at least one input frame and not hidden behind that frame's own reference surface; "
                "findings may only be pinned within `pinRadius` of a seen splat",
        "pinRadius": 0.25,
        "depthScale": depth_scale,
        "seconds": round(seconds, 2),
    }
