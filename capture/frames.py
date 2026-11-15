"""Video -> a handful of sharp, evenly spread frames (pure sampling logic + an OpenCV decoder).

Sampling idea ported from Deja-View pipeline/anysplat_run.py (`choose_views`, sharpest-of-N per slot).
Decoding uses OpenCV's bundled ffmpeg, so no system ffmpeg is needed. Frames are EXIF/rotation-corrected.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np


def candidate_indices(n_frames: int, count: int, oversample: int = 3) -> np.ndarray:
    """Evenly spread frame indices: `count * oversample` candidates over the clip (fewer if the clip is short)."""
    want = min(n_frames, max(1, count * oversample))
    return np.unique(np.linspace(0, n_frames - 1, want).round().astype(int))


def pick_sharpest(scores: np.ndarray, count: int) -> list[int]:
    """Split candidates into `count` consecutive slots and keep the best-scoring one of each (indices into scores)."""
    n = len(scores)
    if n == 0:
        return []
    slots = np.array_split(np.arange(n), min(count, n))
    return [int(slot[int(np.argmax(scores[slot]))]) for slot in slots if len(slot)]


def sharpness(rgb: np.ndarray, long_side: int = 480) -> float:
    """Variance of the Laplacian on a downscaled grey image (higher = sharper)."""
    g = rgb.astype(np.float32).mean(axis=2)
    h, w = g.shape
    step = max(1, int(round(max(h, w) / long_side)))
    g = g[::step, ::step]
    lap = -4 * g[1:-1, 1:-1] + g[:-2, 1:-1] + g[2:, 1:-1] + g[1:-1, :-2] + g[1:-1, 2:]
    return float(lap.var())


def center_square(rgb: np.ndarray, size: int) -> tuple[np.ndarray, dict]:
    """Resize so the short side is `size`, then centre-crop to size x size (the model's preprocessing).
    Returns (uint8 [size,size,3], info) where info maps crop pixels back to the original frame."""
    import cv2

    h, w = rgb.shape[:2]
    s = size / min(w, h)
    nw, nh = max(size, int(round(w * s))), max(size, int(round(h * s)))
    im = cv2.resize(rgb, (nw, nh), interpolation=cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC)
    x0, y0 = (nw - size) // 2, (nh - size) // 2
    return im[y0:y0 + size, x0:x0 + size], {"width": w, "height": h, "scale": nw / w, "x0": x0, "y0": y0}


@dataclass
class VideoMeta:
    n_frames: int
    fps: float
    width: int
    height: int

    @property
    def duration(self) -> float:
        return self.n_frames / self.fps if self.fps else 0.0


def probe(path: str | Path) -> VideoMeta:
    import cv2

    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise RuntimeError(f"cannot open video {path}")
    meta = VideoMeta(int(cap.get(cv2.CAP_PROP_FRAME_COUNT)), float(cap.get(cv2.CAP_PROP_FPS) or 0.0),
                     int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)))
    cap.release()
    return meta


def sample_frames(path: str | Path, count: int, oversample: int = 3,
                  start: float = 0.0, max_seconds: float | None = None) -> tuple[list[np.ndarray], list[int], VideoMeta]:
    """Returns (RGB uint8 frames, their frame indices, meta): `count` frames spread over [start, start+max_seconds],
    the sharpest of `oversample` candidates per slot."""
    import cv2

    meta = probe(path)
    fps = meta.fps or 30.0
    first = int(start * fps)
    last = meta.n_frames - 1
    if max_seconds:
        last = min(last, first + int(max_seconds * fps))
    if last <= first:
        raise RuntimeError(f"no frames in range for {path} ({meta})")
    idx = first + candidate_indices(last - first + 1, count, oversample)
    cap = cv2.VideoCapture(str(path))
    cands: list[np.ndarray] = []
    got: list[int] = []
    for i in idx:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(i))
        ok, bgr = cap.read()
        if ok:
            cands.append(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
            got.append(int(i))
    cap.release()
    if not cands:
        raise RuntimeError(f"could not decode frames from {path}")
    scores = np.array([sharpness(f) for f in cands])
    keep = pick_sharpest(scores, count)
    return [cands[k] for k in keep], [got[k] for k in keep], meta
