#!/usr/bin/env python3
r"""
shell_from_furnished.py - stand-in "empty house" for scans that have no defurnished view, so segment_furniture.py can
still split the furniture out of the furnished mesh.

Matterport only offers a defurnished (empty) view for some models. Without it, run_all.py's pipeline/meshdiff steps
stop and the walk-through has no movable pieces. This script estimates the empty shell from the furnished mesh itself:

  floor    the lowest strong horizontal surface (upward-facing triangles, area-weighted height histogram)
  ceiling  the highest strong horizontal surface (downward-facing triangles)
  walls    vertical planes with a lot of area that run most of the floor-to-ceiling height; a cabinet side or a
           sofa back is too small or too short to qualify

Everything else is left for segment_furniture.py to treat as furniture. The shell is an ESTIMATE from geometry, not an
observed empty scan: tall built-ins can count as wall, and low wall-hugging items may be missed.

Writes pano_<sid>/mesh_diff/: empty_room.obj, plan.json (room height only, no wall lines), objects_fused.json (no boxes)
and shell_report.json. Never overwrites a real meshdiff output unless --force.

    python modeling/shell_from_furnished.py --model w2JcUVybv9c
"""
import argparse, json, os, sys
import numpy as np


def peaks(z, w, bin_m=0.02):
    """Area-weighted histogram of heights -> (centre, weight) of each bin, heaviest first."""
    lo, hi = z.min(), z.max() + bin_m
    hist, edges = np.histogram(z, bins=max(1, int((hi - lo) / bin_m)), range=(lo, hi), weights=w)
    k = np.convolve(hist, [1, 1, 1], "same")
    idx = np.argsort(-k)
    return [((edges[i] + edges[i + 1]) / 2, k[i]) for i in idx]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", required=True)
    ap.add_argument("--band", type=float, default=0.06, help="m: triangles this close to the floor/ceiling plane are shell")
    ap.add_argument("--wall-area", type=float, default=1.5, help="m2 of a vertical plane before it counts as wall")
    ap.add_argument("--wall-span", type=float, default=0.75, help="share of floor-to-ceiling height a wall plane must cover")
    ap.add_argument("--plane-step", type=float, default=0.05, help="m: wall plane offset bin")
    ap.add_argument("--angle-step", type=float, default=5.0, help="deg: wall plane direction bin")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()

    fz = os.path.join(f"assets_{a.model}", "tiles", "furnished_mesh.npz")
    md = os.path.join(f"pano_{a.model}", "mesh_diff")
    if not os.path.exists(fz):
        sys.exit(f"no {fz} - run matterpak.py (or fetch_tiles.py + tiles_mesh.py) first")
    if os.path.exists(os.path.join(md, "objects_fused.json")) and not a.force:
        rep = os.path.join(md, "shell_report.json")
        if not os.path.exists(rep):
            sys.exit("mesh_diff/objects_fused.json already comes from the real pipeline - not overwriting (use --force)")
    os.makedirs(md, exist_ok=True)

    D = np.load(fz)
    V, F = D["V"].astype(float), D["F"]
    tri = V[F]
    cent = tri.mean(1)
    n = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    area = 0.5 * np.linalg.norm(n, axis=1)
    n /= np.maximum(2 * area[:, None], 1e-12)

    # floor / ceiling: heaviest horizontal surfaces near the bottom / top of the scan
    up, down = n[:, 2] > 0.9, n[:, 2] < -0.9
    zlo, zhi = np.percentile(cent[:, 2], [1, 99])
    floor_c = [p for p in peaks(cent[up, 2], area[up]) if p[0] < zlo + 0.5 * (zhi - zlo)]
    ceil_c = [p for p in peaks(cent[down, 2], area[down]) if p[0] > zlo + 0.5 * (zhi - zlo)]
    if not floor_c:
        sys.exit("could not find a floor plane")
    floor_z = float(floor_c[0][0])
    ceil_z = float(ceil_c[0][0]) if ceil_c else float(zhi)
    height = ceil_z - floor_z
    shell = (up & (np.abs(cent[:, 2] - floor_z) < a.band)) | (down & (np.abs(cent[:, 2] - ceil_z) < a.band))

    # walls: big, tall vertical planes, binned by direction (mod 180) and signed offset
    vert = np.where(np.abs(n[:, 2]) < 0.2)[0]
    ang = np.degrees(np.arctan2(n[vert, 1], n[vert, 0])) % 180.0
    abin = np.round(ang / a.angle_step).astype(int) % int(round(180 / a.angle_step))
    th = np.radians(abin * a.angle_step)
    off = cent[vert, 0] * np.cos(th) + cent[vert, 1] * np.sin(th)
    obin = np.round(off / a.plane_step).astype(int)
    key = abin.astype(np.int64) * 1_000_000 + (obin + 500_000)
    uk, inv = np.unique(key, return_inverse=True)
    plane_area = np.bincount(inv, weights=area[vert])
    zmin = np.full(len(uk), np.inf); zmax = np.full(len(uk), -np.inf)
    np.minimum.at(zmin, inv, tri[vert, :, 2].min(1)); np.maximum.at(zmax, inv, tri[vert, :, 2].max(1))
    # neighbouring offset bins of one wall split its area; pool each bin with its two neighbours
    pooled = plane_area.copy()
    lookup = {k: i for i, k in enumerate(uk)}
    for i, k in enumerate(uk):
        for d in (-1, 1):
            j = lookup.get(k + d)
            if j is not None:
                pooled[i] += plane_area[j]; zmin[i] = min(zmin[i], zmin[j]); zmax[i] = max(zmax[i], zmax[j])
    is_wall = (pooled >= a.wall_area) & ((zmax - zmin) >= a.wall_span * height)
    shell[vert[is_wall[inv]]] = True

    S = F[shell]
    used, remap = np.unique(S, return_inverse=True)
    with open(os.path.join(md, "empty_room.obj"), "w") as fh:
        fh.write("# estimated shell from the furnished mesh (shell_from_furnished.py), not an empty scan\n")
        fh.write("".join(f"v {x:.4f} {y:.4f} {z:.4f}\n" for x, y, z in V[used]))
        fh.write("".join(f"f {i+1} {j+1} {k+1}\n" for i, j, k in remap.reshape(-1, 3)))
    (x0, y0), (x1, y1) = np.percentile(V[:, :2], 0.5, axis=0), np.percentile(V[:, :2], 99.5, axis=0)
    outline = [[round(float(x), 3), round(float(y), 3)] for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))]
    json.dump({"source": "shell_from_furnished.py (estimate)",
               "rooms": [{"id": 0, "label": "space", "height_m": round(height, 3), "polygon": outline}],
               "walls": []}, open(os.path.join(md, "plan.json"), "w"), indent=1)
    json.dump({"source": "shell_from_furnished.py (no panorama boxes)", "objects": []},
              open(os.path.join(md, "objects_fused.json"), "w"), indent=1)
    report = {"model": a.model, "status": "estimated", "floor_z": round(floor_z, 3), "ceiling_z": round(ceil_z, 3),
              "triangles": int(len(F)), "shell_triangles": int(shell.sum()),
              "shell_area_m2": round(float(area[shell].sum()), 1), "wall_planes": int(is_wall.sum()),
              "note": "Shell estimated from the furnished mesh; no defurnished view exists for this model."}
    json.dump(report, open(os.path.join(md, "shell_report.json"), "w"), indent=1)
    print(f"floor {floor_z:.2f} m, ceiling {ceil_z:.2f} m, {int(is_wall.sum())} wall planes, "
          f"{int(shell.sum())} of {len(F)} triangles are shell -> {md}")


if __name__ == "__main__":
    main()
