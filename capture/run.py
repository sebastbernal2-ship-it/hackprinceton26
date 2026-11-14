"""Phone video of a space -> scene bundle (splat + poses + metric depth + reality.json + scene.json).

  uv run --no-project ... / capture/.cache/venv/bin/python -m capture.run VIDEO OUT_DIR [--views 24]

Stages (each timed; timings and GPU peak go into OUT_DIR/capture-report.json):
  1 frames   sharp, evenly spread frames (OpenCV decode)
  2 depth    Depth Anything V2 Metric-Indoor per frame (metres)
  3 splat    AnySplat feed-forward: Gaussian splats + camera poses + intrinsics for all frames at once
  4 scale    metric scale = median(DepthAnything depth / splat depth) over the views; floor from RANSAC
  5 reality  seen vs imagined split (reality.py); findings may only be pinned on SEEN surfaces
  6 bundle   world.spz (viewer frame: metres, +Y up, floor y=0), cameras.json, frames/, thumb.jpg, scene.json

Run as a module from the repo root: `python -m capture.run`.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import traceback
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
os.environ.setdefault("HF_HOME", str(HERE / ".cache" / "hf"))
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")

from . import frames as fr  # noqa: E402
from . import reality as rl  # noqa: E402
from . import scene as sc  # noqa: E402
from . import splat_io as sio  # noqa: E402

INPUT_SIZE = 448


def log(msg: str) -> None:
    print(f"[capture] {time.strftime('%H:%M:%S')} {msg}", file=sys.stderr, flush=True)


def metric_scale(file_depths: list[np.ndarray], da_depths: list[np.ndarray], lo: float = 0.3, hi: float = 12.0) -> dict:
    """Metres per reconstruction unit: median over views of median(DA depth / splat depth) on pixels valid in both.
    Pure: inputs are same-shaped z-depth maps per view (0 = no data in the splat render)."""
    ratios = []
    for z, d in zip(file_depths, da_depths):
        ok = (z > 0) & np.isfinite(z) & (d > lo) & (d < hi)
        if ok.sum() >= 50:
            ratios.append(float(np.median(d[ok] / z[ok])))
    if not ratios:
        return {"factor": None, "views": 0}
    r = np.array(ratios)
    return {"factor": float(np.median(r)), "views": len(r), "p25": float(np.percentile(r, 25)), "p75": float(np.percentile(r, 75))}


def view_to_viewer(c2w_gl: np.ndarray, transform: dict) -> np.ndarray:
    """Camera-to-world pose in the reconstruction file frame -> viewer frame (rotation + translation; the
    transform's scale only scales positions, cameras stay rigid)."""
    R, t, s = sio.transform_parts(transform)
    out = np.eye(4)
    out[:3, :3] = R @ c2w_gl[:3, :3]
    out[:3, 3] = s * (R @ c2w_gl[:3, 3]) + t
    return out


def run(video: str | Path, out_dir: str | Path, views: int = 24, depth_model: str = "small",
        max_splats: int = 400_000, camera_height: float = 1.45, start: float = 0.0,
        max_seconds: float | None = None, write_ply: bool = False) -> dict:
    import torch
    from PIL import Image

    out = Path(out_dir)
    (out / "frames").mkdir(parents=True, exist_ok=True)
    timings: dict[str, float] = {}
    t_all = time.time()
    if torch.cuda.is_available():
        torch.cuda.reset_peak_memory_stats()

    def stage(name: str, t0: float) -> None:
        timings[name] = round(time.time() - t0, 2)
        log(f"{name}: {timings[name]}s")

    # 1 frames
    t0 = time.time()
    raw_frames, frame_idx, meta = fr.sample_frames(video, views, start=start, max_seconds=max_seconds)
    crops, infos = zip(*[fr.center_square(f, INPUT_SIZE) for f in raw_frames])
    crops = list(crops)
    stage("frames", t0)
    log(f"{len(crops)} frames from {meta.width}x{meta.height} @ {meta.fps:.1f} fps, {meta.duration:.1f}s")

    # 2 depth (on the same 448 crops AnySplat sees)
    t0 = time.time()
    from .depth import DepthEstimator

    est = DepthEstimator(depth_model, device="cuda" if torch.cuda.is_available() else "cpu")
    da = est(crops)
    del est
    torch.cuda.empty_cache()
    stage("depth", t0)

    # 3 splat
    t0 = time.time()
    from .anysplat import get_model

    model = get_model()
    model.load()
    views_arr = np.stack([c.astype(np.float32) / 255.0 for c in crops])
    splats, c2w_cv, K, infer_s = model.infer(views_arr)
    timings["anysplat_load"] = round(model.load_seconds, 1)
    timings["anysplat_infer"] = round(infer_s, 2)
    stage("splat_total", t0)
    raw_n = len(splats)
    poses_gl = [sio.c2w_cv_to_gl(c) for c in c2w_cv]
    centres = np.array([p[:3, 3] for p in poses_gl])
    splats = splats.subset(sio.prune_indices(splats, max_splats, cameras=centres))
    log(f"{raw_n} splats -> {len(splats)} after pruning")

    # 4 scale + floor
    t0 = time.time()
    S = INPUT_SIZE
    zs, ds = [], []
    sub = np.unique(np.linspace(0, len(poses_gl) - 1, min(8, len(poses_gl))).round().astype(int))
    rw = S // 4
    for i in sub:
        k = K[i]
        sx = rw / S
        z = sio.render_points(splats, poses_gl[i], k[0, 0] * S * sx, k[1, 1] * S * sx, k[0, 2] * S * sx, k[1, 2] * S * sx, rw, rw,
                              min_opacity=0.3, max_radius=4).depth
        zs.append(z.astype(np.float32))
        ds.append(np.asarray(Image.fromarray(da[i]).resize((rw, rw), Image.BILINEAR), np.float32))
    ms = metric_scale(zs, ds)
    log(f"metric scale (Depth Anything / splat depth): {ms}")
    place = sio.place_world(splats.means, splats.opacities, poses_gl[0], camera_height=camera_height,
                            scale_limits=(1e-4, 1e4), fallback_scale=None, fallback_median_distance=2.5,
                            scale_override=ms["factor"])
    floor_found = place["floor"]["found"]
    method = "depth-anything-metric" if ms["factor"] else ("assumed-camera-height" if floor_found else "median-distance")
    cam_h = (place["cameraHeightFile"] or 0.0) * place["scale"] if floor_found else None
    log(f"floor found={floor_found}, camera height {cam_h} m (a handheld phone is about 1.2-1.7 m)")
    stage("scale_floor", t0)

    # 5 reality
    t0 = time.time()
    R, tt, s = sio.transform_parts(place["transform"])
    sv = sio.transform_splats(splats, R, tt, s)
    vlist = []
    for i, p in enumerate(poses_gl):
        k = K[i]
        vlist.append(rl.View(S, S, float(k[0, 0] * S), float(k[1, 1] * S), float(k[0, 2] * S), float(k[1, 2] * S),
                             view_to_viewer(p, place["transform"]), name=f"{i:03d}"))
    depths = [rl.reference_depth(sv, v) for v in vlist]
    res = rl.classify_views(sv.means, vlist, depths)
    seen_idx, imag_idx = np.nonzero(res.seen)[0], np.nonzero(~res.seen)[0]
    deg = min(sv.sh_degree, 3)
    sio.write_spz(out / "world.spz", sv, sh_degree=deg)
    sio.write_spz(out / "world-seen.spz", sv.subset(seen_idx), sh_degree=deg)
    if len(imag_idx):
        sio.write_spz(out / "world-imagined.spz", sv.subset(imag_idx), sh_degree=deg)
    if write_ply:
        sio.write_ply(out / "world.ply", sv, sh_degree=0)
    report = rl.reality_report("world.spz", "world-seen.spz", "world-imagined.spz" if len(imag_idx) else "", res, vlist,
                               rl.DEFAULT_ABS_TOL, rl.DEFAULT_REL_TOL, time.time() - t0, depth_scale=ms)
    sc.write_json_atomic(out / "reality.json", report)
    stage("reality", t0)
    log(f"reality: {len(seen_idx)}/{len(sv)} splats seen ({report['seenFraction'] * 100:.1f}%)")

    # 6 bundle
    t0 = time.time()
    bounds = sio.robust_bounds(sv.means[res.seen] if res.seen.any() else sv.means)
    cams = []
    for i, v in enumerate(vlist):
        Rv = v.c2w[:3, :3]
        info = infos[i]
        cams.append({"index": i, "sourceFrame": frame_idx[i], "image": f"frames/{i:03d}.jpg",
                     "position": [round(float(x), 5) for x in v.c2w[:3, 3]], "quaternion": sio.matrix_to_quat_xyzw(Rv),
                     "fx": round(v.fx, 3), "fy": round(v.fy, 3), "cx": round(v.cx, 3), "cy": round(v.cy, 3),
                     "width": S, "height": S, "crop": info})
        Image.fromarray(crops[i]).save(out / "frames" / f"{i:03d}.jpg", quality=92)
    sc.write_json_atomic(out / "cameras.json", {"convention": "OpenGL cameras (look down -Z, +Y up) in the viewer frame, "
                                                "metres; intrinsics in pixels of the width x height crop", "cameras": cams})
    np.savez_compressed(out / "depth.npz", depth=np.stack(da).astype(np.float16), unit="metres")
    first = vlist[0]
    thumb = sio.render_points(sv, first.c2w, first.fx, first.fy, first.cx, first.cy, S, S).rgb
    sio.save_jpeg(out / "thumb.jpg", thumb, quality=86)
    scene = sc.build_scene(
        world_file="world.spz", splat_count=len(sv), bounds=bounds, floor_found=floor_found,
        spawn={"position": [float(x) for x in vlist[0].c2w[:3, 3]], "yaw": place["spawn"]["yaw"]},
        scale={"method": method, "factor": place["scale"], "cameraHeight": cam_h, "depthScale": ms},
        capture={"views": len(vlist), "video": Path(video).name, "videoSize": [meta.width, meta.height], "fps": meta.fps,
                 "duration": round(meta.duration, 2), "depthModel": f"Depth Anything V2 Metric-Indoor-{depth_model}",
                 "reconstruction": "AnySplat (lhjiang/anysplat)", "seenFraction": report["seenFraction"]},
        thumb="thumb.jpg")
    sc.write_json_atomic(out / "scene.json", scene)
    stage("bundle", t0)

    timings["total"] = round(time.time() - t_all, 2)
    sizes = {p.name: p.stat().st_size for p in sorted(out.glob("*")) if p.is_file()}
    sizes["frames/"] = sum(p.stat().st_size for p in (out / "frames").glob("*"))
    peak = torch.cuda.max_memory_allocated() / 2**30 if torch.cuda.is_available() else None
    rep = {"timings": timings, "peakVramGiB": round(peak, 2) if peak else None, "bytes": sizes,
           "rawSplats": raw_n, "keptSplats": len(sv), "floor": place["floor"], "scale": ms, "cameraHeightM": cam_h}
    sc.write_json_atomic(out / "capture-report.json", rep)
    log(json.dumps(rep))
    return rep


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Phone video of a space -> walkthrough scene bundle")
    ap.add_argument("video")
    ap.add_argument("out")
    ap.add_argument("--views", type=int, default=24, help="frames fed to AnySplat (VRAM and time grow with this)")
    ap.add_argument("--depth-model", default="small", choices=["small", "base", "large"])
    ap.add_argument("--max-splats", type=int, default=400_000)
    ap.add_argument("--camera-height", type=float, default=1.45, help="used only when no depth scale is available")
    ap.add_argument("--start", type=float, default=0.0)
    ap.add_argument("--max-seconds", type=float, default=None)
    ap.add_argument("--ply", action="store_true", help="also write world.ply (large)")
    a = ap.parse_args(argv)
    try:
        run(a.video, a.out, a.views, a.depth_model, a.max_splats, a.camera_height, a.start, a.max_seconds, a.ply)
    except Exception:
        traceback.print_exc()
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
