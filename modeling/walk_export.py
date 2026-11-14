#!/usr/bin/env python3
r"""
walk_export.py - pack the furnished house mesh (MatterPak / 3D Tiles, from assets_<sid>/tiles/furnished_mesh.npz)
into a small binary that modeling/walk.html streams straight into the GPU for first-person walking.

    python modeling/walk_export.py --model Jxmnkp6KpJN

Writes assets_<sid>/walk/:
    mesh.bin    float32 positions (n*3), float32 uv (n*2, bottom-left origin), uint32 indices (m*3),
                triangles sorted by texture so each texture is one draw group
    meta.json   counts, byte offsets, texture groups, bounding box, scan spots (from pano_poses.json when present)
Textures are not copied: walk.html loads them from assets_<sid>/tiles/furnished_tex/.
Needs numpy only.
"""
import argparse, json, sys
from pathlib import Path

import numpy as np

ROOT = Path.cwd()   # working folder holding assets_<sid>/ and pano_<sid>/


def pack_mesh(V, F, UV, T, names):
    """Sort triangles by texture index (stable) so each texture is one draw group.
    Returns (V, F_sorted, uv_flipped, groups); groups = [{"tex","start","count"}] in index units (3 per triangle).
    UV v is flipped because the npz uses a top-left origin and WebGL a bottom-left one. T < 0 means untextured."""
    order = np.argsort(T, kind="stable")
    F, T = F[order], T[order]
    uv = UV.copy()
    uv[:, 1] = 1.0 - uv[:, 1]
    groups = []
    for t in np.unique(T):
        idx = np.nonzero(T == t)[0]
        name = str(names[t]) if t >= 0 else ""
        groups.append({"tex": name, "start": int(idx[0]) * 3, "count": int(len(idx)) * 3})
    return V, F, uv, groups


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", required=True)
    a = ap.parse_args()
    sid = a.model
    src = ROOT / f"assets_{sid}" / "tiles" / "furnished_mesh.npz"
    if not src.exists():
        sys.exit(f"{src} is missing - run the matterpak (or tiles) step first")
    d = np.load(src)
    V, F, UV, T, names = d["V"].astype("<f4"), d["F"].astype("<u4"), d["UV"].astype("<f4"), d["T"], d["tex"]

    V, F, uv, groups = pack_mesh(V, F, UV, T, names)

    out = ROOT / f"assets_{sid}" / "walk"
    out.mkdir(parents=True, exist_ok=True)
    with open(out / "mesh.bin", "wb") as fh:
        fh.write(V.tobytes()); fh.write(uv.tobytes()); fh.write(F.tobytes())

    spots = []
    poses = ROOT / f"pano_{sid}" / "mesh_diff" / "pano_poses.json"
    if poses.exists():
        for p in json.loads(poses.read_text())["panos"]:
            spots.append({"id": p["id"], "label": p.get("label"), "position": p["position"],
                          "yaw_deg": p.get("yaw_deg"), "mirror": p.get("mirror"),
                          "furnished": f"/pano_{sid}/mesh_diff/{p['furnished']}" if p.get("furnished") else None})
    meta = {"model": sid, "frame": "model frame (x east, y north, z up), metres",
            "vertices": int(len(V)), "triangles": int(len(F)),
            "offsets": {"position": 0, "uv": int(V.nbytes), "index": int(V.nbytes + uv.nbytes)},
            "texture_dir": f"/assets_{sid}/tiles/furnished_tex/", "groups": groups,
            "bbox": [V.min(0).round(3).tolist(), V.max(0).round(3).tolist()], "spots": spots}
    (out / "meta.json").write_text(json.dumps(meta, indent=1))
    mb = (out / "mesh.bin").stat().st_size / 1e6
    print(f"   wrote {out / 'mesh.bin'} ({len(F)} triangles, {len(groups)} textures, {mb:.0f} MB), "
          f"{len(spots)} scan spots{'' if spots else ' (no pano_poses.json yet - run the bake step for the photo view)'}")


if __name__ == "__main__":
    main()
