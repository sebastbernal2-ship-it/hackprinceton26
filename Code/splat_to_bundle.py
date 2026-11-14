#!/usr/bin/env python3
"""
splat_to_bundle.py - Shrink a Gaussian-splat .ply into a small, AI-friendly bundle.

An 8M-Gaussian splat (~550 MB) cannot go into an LLM. This produces:
  views/top.jpg, views/orbit_XX.jpg   rendered images a vision model can read (~1.4k tokens each)
  stats.json                           compact numbers: bounds, ground level, footprint, heights, palette
  points_ds.ply                        ~300k-point coloured cloud for programmatic tools
  manifest.json                        what's in the bundle + (optional) merged Matterport metadata

Input: standard 3DGS binary little-endian .ply (x y z ... f_dc_0..2 opacity scale_0..2 rot_0..3).
Needs only numpy + pillow. CPU only.

  python splat_to_bundle.py splat.ply --out bundle --up z --meta meta.json
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image

TYPES = {"char": "i1", "uchar": "u1", "short": "i2", "ushort": "u2", "int": "i4",
         "uint": "u4", "float": "f4", "double": "f8", "int8": "i1", "uint8": "u1",
         "int16": "i2", "uint16": "u2", "int32": "i4", "uint32": "u4",
         "float32": "f4", "float64": "f8"}
SH0 = 0.28209479177387814


def read_ply(path):
    with open(path, "rb") as f:
        props, n, fmt = [], 0, None
        while True:
            line = f.readline()
            if not line:
                sys.exit("bad ply header")
            t = line.decode("ascii", "ignore").split()
            if t[:1] == ["format"]:
                fmt = t[1]
            elif t[:2] == ["element", "vertex"]:
                n = int(t[2])
            elif t[:1] == ["property"] and len(t) == 3 and t[1] in TYPES:
                props.append((t[2], "<" + TYPES[t[1]]))
            elif t[:1] == ["end_header"]:
                break
        off = f.tell()
    if fmt != "binary_little_endian":
        sys.exit(f"unsupported ply format {fmt}")
    import os as _os
    itemsize = sum(np.dtype(t).itemsize for _, t in props)
    n = min(n, (_os.path.getsize(path) - off) // itemsize)   # tolerate a partial (range-downloaded) file
    names = [p[0] for p in props]
    for need in ["x", "y", "z", "f_dc_0", "opacity", "scale_0"]:
        if need not in names:
            sys.exit(f"missing property {need}; is this a standard 3DGS .ply "
                     f"(compressed/.spz/.sog need converting first)? got {names[:12]}")
    return np.memmap(path, dtype=np.dtype(props), mode="r", offset=off, shape=(n,))


def up_matrix(spec, P):
    """Rows map world -> (x', y', z') with z' = up. spec: x,y,z,-x,-y,-z,auto."""
    if spec == "auto":
        ext = np.percentile(P, 99, 0) - np.percentile(P, 1, 0)
        spec = "xyz"[int(np.argmin(ext))]
    sign = -1.0 if spec.startswith("-") else 1.0
    up = "xyz".index(spec[-1])
    others = [i for i in range(3) if i != up]
    M = np.zeros((3, 3))
    M[0, others[0]] = 1
    M[1, others[1]] = 1
    M[2, up] = sign
    if np.linalg.det(M) < 0:
        M[1] *= -1
    return M, spec


def voxel_downsample(P, C, target):
    lo = P.min(0)
    ext = (P.max(0) - lo).max()
    vs = ext / 400.0
    for _ in range(12):
        idx = np.floor((P - lo) / vs).astype(np.int64)
        key = (idx[:, 0] * 100003 + idx[:, 1]) * 100003 + idx[:, 2]
        uk, inv, cnt = np.unique(key, return_inverse=True, return_counts=True)
        if len(uk) <= target * 1.3 and len(uk) >= target * 0.5:
            break
        vs *= (len(uk) / target) ** (1 / 3)
    Pn = np.zeros((len(uk), 3))
    Cn = np.zeros((len(uk), 3))
    for k in range(3):
        Pn[:, k] = np.bincount(inv, P[:, k], len(uk)) / cnt
        Cn[:, k] = np.bincount(inv, C[:, k].astype(float), len(uk)) / cnt
    return Pn.astype(np.float32), Cn.astype(np.float32), float(vs)


def paint(u, v, near, C, W, H, k=1, bg=(255, 255, 255)):
    img = np.empty((H, W, 3), np.uint8)
    img[:] = bg
    order = np.argsort(near)               # far first, near last (last write wins)
    u, v, C = u[order], v[order], C[order]
    for dx in range(-k, k + 1):
        for dy in range(-k, k + 1):
            uu, vv = u + dx, v + dy
            m = (uu >= 0) & (uu < W) & (vv >= 0) & (vv < H)
            img[vv[m], uu[m]] = C[m]
    return img


def render_top(P, C, lo, hi, size, k=1):
    sc = (size - 1) / max(hi[0] - lo[0], hi[1] - lo[1])
    W = int((hi[0] - lo[0]) * sc) + 1
    H = int((hi[1] - lo[1]) * sc) + 1
    u = ((P[:, 0] - lo[0]) * sc).astype(int)
    v = ((hi[1] - P[:, 1]) * sc).astype(int)
    return paint(u, v, P[:, 2], C, W, H, k), sc


def render_persp(P, C, center, radius, az, el, size, k=1, fov=55):
    pos = center + radius * np.array([np.cos(el) * np.cos(az), np.cos(el) * np.sin(az), np.sin(el)])
    fwd = center - pos
    fwd /= np.linalg.norm(fwd)
    right = np.cross(fwd, [0, 0, 1.0])
    right /= np.linalg.norm(right)
    upc = np.cross(right, fwd)
    d = P - pos
    z = d @ fwd
    ok = z > 0.1
    d, z, Cc = d[ok], z[ok], C[ok]
    f = size / 2 / np.tan(np.radians(fov) / 2)
    u = (size / 2 + f * (d @ right) / z).astype(int)
    v = (size / 2 - f * (d @ upc) / z).astype(int)
    return paint(u, v, -z, Cc, size, size, k)


def palette(C, n=6):
    q = (C // 32).astype(int)
    key = q[:, 0] * 64 + q[:, 1] * 8 + q[:, 2]
    uk, cnt = np.unique(key, return_counts=True)
    top = np.argsort(-cnt)[:n]
    out = []
    for i in top:
        r, g, b = (uk[i] // 64) * 32 + 16, ((uk[i] // 8) % 8) * 32 + 16, (uk[i] % 8) * 32 + 16
        out.append({"rgb": [int(r), int(g), int(b)], "hex": f"#{r:02x}{g:02x}{b:02x}",
                    "share": round(float(cnt[i] / cnt.sum()), 3)})
    return out


def write_ply(path, P, C):
    with open(path, "wb") as f:
        f.write((f"ply\nformat binary_little_endian 1.0\nelement vertex {len(P)}\n"
                 "property float x\nproperty float y\nproperty float z\n"
                 "property uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n").encode())
        rec = np.empty(len(P), dtype=[("p", "<f4", 3), ("c", "u1", 3)])
        rec["p"], rec["c"] = P, np.clip(C, 0, 255).astype(np.uint8)
        f.write(rec.tobytes())


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("ply")
    ap.add_argument("--out", default="bundle")
    ap.add_argument("--up", default="z", help="up axis: x,y,z,-x,-y,-z or auto (Matterport frame is z-up)")
    ap.add_argument("--min-opacity", type=float, default=0.3)
    ap.add_argument("--points", type=int, default=300_000, help="target size of downsampled cloud")
    ap.add_argument("--render-points", type=int, default=2_500_000, help="points used for rendering")
    ap.add_argument("--size", type=int, default=1024)
    ap.add_argument("--orbits", type=int, default=6)
    ap.add_argument("--meta", help="JSON with Matterport metadata (address, rooms, notes...) to embed")
    a = ap.parse_args()

    os.makedirs(os.path.join(a.out, "views"), exist_ok=True)
    g = read_ply(a.ply)
    n_total = len(g)
    print(f"{n_total:,} gaussians")

    # --- filter floaters: low opacity, huge blobs, far outliers --------------------------
    op = 1 / (1 + np.exp(-np.asarray(g["opacity"], np.float32)))
    smax = np.exp(np.maximum.reduce([np.asarray(g[f"scale_{i}"], np.float32) for i in range(3)]))
    keep = (op >= a.min_opacity) & (smax <= np.percentile(smax, 99.5))
    P = np.stack([np.asarray(g[c], np.float32) for c in "xyz"], 1)[keep]
    C = np.stack([np.asarray(g[f"f_dc_{i}"], np.float32) for i in range(3)], 1)[keep]
    C = np.clip((0.5 + SH0 * C) * 255, 0, 255)
    del g
    M, up = up_matrix(a.up, P)
    P = (P @ M.T).astype(np.float32)
    lo, hi = np.percentile(P, 0.5, 0), np.percentile(P, 99.5, 0)
    inb = np.all((P >= lo - 0.1 * (hi - lo)) & (P <= hi + 0.1 * (hi - lo)), 1)
    P, C = P[inb], C[inb]
    print(f"kept {len(P):,} after filtering (up axis: {up})")

    # --- stats ---------------------------------------------------------------------------
    ground = float(np.percentile(P[:, 2], 2))
    h = P[:, 2] - ground
    lo, hi = np.percentile(P, 0.5, 0), np.percentile(P, 99.5, 0)
    cell = 1.0
    gx = ((P[:, 0] - lo[0]) / cell).astype(int)
    gy = ((P[:, 1] - lo[1]) / cell).astype(int)
    tall = h > 2.0
    occ = np.zeros((gx.max() + 1, gy.max() + 1), np.uint8)
    cnt = np.zeros_like(occ, dtype=np.int32)
    np.add.at(cnt, (gx[tall], gy[tall]), 1)
    occ = cnt >= 20
    xs, ys = np.where(occ)
    stats = {
        "gaussians_total": int(n_total), "gaussians_kept": int(len(P)), "up_axis_used": up,
        "units": "same as splat file (Matterport/model frame = metres)",
        "bounds_p0.5_p99.5": {"min": lo.astype(float).round(2).tolist(), "max": hi.astype(float).round(2).tolist(),
                              "size": (hi - lo).astype(float).round(2).tolist()},
        "ground_z_est": round(ground, 2),
        "height_above_ground_percentiles_m": {str(p): round(float(np.percentile(h, p)), 2)
                                              for p in (5, 25, 50, 75, 95, 99)},
        "structure_footprint": {
            "method": "1 m cells with >=20 gaussians above 2 m (includes trees/walls, not only the house)",
            "area_m2": int(occ.sum()),
            "bbox_xy": [[float(lo[0] + xs.min()), float(lo[1] + ys.min())],
                        [float(lo[0] + xs.max() + 1), float(lo[1] + ys.max() + 1)]] if len(xs) else None},
        "colour_palette": palette(C),
        "view_scale_note": "top.jpg: pixels_per_metre given in manifest; north=+y is image up",
    }

    # --- compact cloud -------------------------------------------------------------------
    Pd, Cd, vs = voxel_downsample(P, C, a.points)
    write_ply(os.path.join(a.out, "points_ds.ply"), Pd, Cd)
    stats["downsampled_points"] = int(len(Pd))
    stats["voxel_size_m"] = round(vs, 3)

    # --- renders -------------------------------------------------------------------------
    rng = np.random.default_rng(0)
    sel = rng.choice(len(P), min(a.render_points, len(P)), replace=False)
    Pr, Cr = P[sel], C[sel].astype(np.uint8)
    imgs = []
    top, sc = render_top(Pr, Cr, lo, hi, a.size)
    Image.fromarray(top).save(os.path.join(a.out, "views", "top.jpg"), quality=88)
    imgs.append({"file": "views/top.jpg", "type": "top-down orthographic", "pixels_per_metre": round(float(sc), 2),
                 "image_up": "+y", "origin_xy_of_left_top": [float(lo[0]), float(hi[1])]})
    centre = np.array([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, ground + np.percentile(h, 50)])
    radius = 0.9 * float(np.linalg.norm((hi - lo)[:2]))
    for i in range(a.orbits):
        az = 2 * np.pi * i / a.orbits
        im = render_persp(Pr, Cr, centre, radius, az, np.radians(35), a.size)
        fn = f"views/orbit_{i:02d}.jpg"
        Image.fromarray(im).save(os.path.join(a.out, fn), quality=88)
        imgs.append({"file": fn, "type": "perspective, 55deg fov, elevation 35deg",
                     "camera_azimuth_deg": round(float(np.degrees(az)), 1), "looking_at": centre.round(2).tolist()})
    json.dump(stats, open(os.path.join(a.out, "stats.json"), "w"), indent=1)

    meta = json.load(open(a.meta)) if a.meta else None
    manifest = {
        "about": "AI-ready bundle derived from a Gaussian splat. Images are the primary input; stats.json "
                 "gives exact numbers; points_ds.ply is for code tools. Coordinates: z up, metres.",
        "images": imgs, "stats": "stats.json", "points": "points_ds.ply",
        "approx_vision_tokens": f"~{(a.size * a.size) // 750} per image, ~{(a.size * a.size) // 750 * len(imgs):,} total",
        "matterport_metadata": meta,
    }
    json.dump(manifest, open(os.path.join(a.out, "manifest.json"), "w"), indent=1)
    sz = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(a.out) for f in fs) / 1e6
    print(f"bundle -> {a.out}  ({sz:.1f} MB; {manifest['approx_vision_tokens']} vision tokens)")


if __name__ == "__main__":
    main()
