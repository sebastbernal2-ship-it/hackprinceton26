#!/usr/bin/env python3
r"""
walk_export.py - pack the furnished house mesh (MatterPak / 3D Tiles, from assets_<sid>/tiles/furnished_mesh.npz)
into a small binary that modeling/walk.html streams straight into the GPU for first-person walking and rearranging.

    python modeling/walk_export.py --model Jxmnkp6KpJN

Movable furniture: the pieces segment_furniture.py cut out of this same mesh (pano_<sid>/mesh_diff/objects.json +
objects_tiles/seg_###.glb) are matched back to their triangles, so walk.html can lift each one out exactly. What was
hidden under and behind a piece was never scanned, so patches of the empty house (empty_room_textured.obj, coloured
from the furniture-removed panoramas) are added around every piece to fill the holes when it moves.

Writes assets_<sid>/walk/:
    mesh.bin    float32 positions (n*3), float32 uv (n*2, bottom-left origin), uint32 indices (m*3)
                [+ patch: float32 positions (k*3), uint8 rgb (k*3, padded to 4 bytes), uint32 indices (j*3)]
                triangles: the house first (sorted by texture), then each piece (sorted by texture)
    meta.json   counts, byte offsets, textures, house groups, pieces, patch, bounding box, scan spots
Textures are not copied: walk.html loads them from assets_<sid>/tiles/furnished_tex/.
Needs numpy + scipy.
"""
import argparse, json, math, struct, sys
from pathlib import Path

import numpy as np

ROOT = Path.cwd()   # working folder holding assets_<sid>/ and pano_<sid>/

def glb_triangles(path):
    """Triangle corner positions of a GLB, shape (n, 3, 3)."""
    b = Path(path).read_bytes()
    off, js, binoff = 12, None, None
    while off < len(b):
        n, t = struct.unpack_from("<II", b, off)
        if t == 0x4E4F534A:
            js = json.loads(b[off + 8: off + 8 + n])
        elif t == 0x004E4942:
            binoff = off + 8
        off += 8 + n + ((4 - n % 4) % 4)
    def acc(i):
        a = js["accessors"][i]; v = js["bufferViews"][a["bufferView"]]
        o = binoff + v.get("byteOffset", 0) + a.get("byteOffset", 0)
        n = a["count"] * {"SCALAR": 1, "VEC2": 2, "VEC3": 3}[a["type"]]
        dt = {5126: "<f4", 5125: "<u4", 5123: "<u2"}[a["componentType"]]
        return np.frombuffer(b, dt, n, o)
    out = []
    for m in js["meshes"]:
        for p in m["primitives"]:
            P = acc(p["attributes"]["POSITION"]).reshape(-1, 3)
            I = acc(p["indices"]).astype(np.int64) if "indices" in p else np.arange(len(P))
            out.append(P[I.reshape(-1, 3)])
    return np.concatenate(out) if out else np.zeros((0, 3, 3), "f4")

def load_colour_obj(path):
    """'v x y z r g b' + 'f a b c' OBJ (texture_bake.py output), parsed fast."""
    lines = Path(path).read_bytes().split(b"\n")
    V = np.array(b" ".join(l[2:] for l in lines if l[:2] == b"v ").split(), "f4").reshape(-1, 6)
    F = [l[2:].split() for l in lines if l[:2] == b"f "]
    F = np.array([[int(t.split(b"/")[0]) for t in f[:3]] for f in F], np.int64) - 1
    return V[:, :3], V[:, 3:], F

def match_pieces(sid, V, F):
    """Triangle -> piece index (-1 = house) by matching each piece GLB's triangle centres back to the furnished mesh."""
    from scipy.spatial import cKDTree
    md = ROOT / f"pano_{sid}" / "mesh_diff"
    if not (md / "objects.json").exists() or not (md / "scene_tiles.json").exists():
        return np.full(len(F), -1), []
    objs = {o["id"]: o for o in json.loads((md / "objects.json").read_text())["objects"] if o.get("source") == "mesh_segment"}
    files = {t["id"]: t["file"] for t in json.loads((md / "scene_tiles.json").read_text())["objects"] if t.get("file")}
    pts, own, pieces = [], [], []
    for oid, o in objs.items():
        f = files.get(oid)
        if not f or not (md / f).exists():
            continue
        b = o["box"]; c = b["centre"]; a = math.radians(b["yaw_deg"]); ca, sa = math.cos(a), math.sin(a)
        L = glb_triangles(md / f).astype("f8").mean(1)               # local: box centre, floor z, unrotated
        W = np.c_[c[0] + L[:, 0] * ca - L[:, 1] * sa, c[1] + L[:, 0] * sa + L[:, 1] * ca, L[:, 2] + o["floor_z"]]
        pts.append(W); own.append(np.full(len(W), len(pieces)))
        pieces.append(o)
    if not pieces:
        return np.full(len(F), -1), []
    tree = cKDTree(np.vstack(pts)); own = np.concatenate(own)
    d, i = tree.query(V[F].astype("f8").mean(1), distance_upper_bound=0.002)
    return np.where(np.isfinite(d), own[np.minimum(i, len(own) - 1)], -1), pieces

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", required=True)
    ap.add_argument("--patch-margin", type=float, default=0.25, help="m of empty house added around each piece")
    a = ap.parse_args()
    sid = a.model
    src = ROOT / f"assets_{sid}" / "tiles" / "furnished_mesh.npz"
    if not src.exists():
        sys.exit(f"{src} is missing - run the matterpak (or tiles) step first")
    d = np.load(src)
    V, F, UV, T, names = d["V"].astype("<f4"), d["F"].astype("<u4"), d["UV"].astype("<f4"), d["T"], d["tex"]
    uv = UV.copy()
    uv[:, 1] = 1.0 - uv[:, 1]                      # npz uses a top-left origin, WebGL a bottom-left one

    owner, pieces = match_pieces(sid, V, F)
    order = np.lexsort((T, owner))                 # house (-1) first, then piece by piece; textures grouped inside
    F, T, owner = F[order], T[order], owner[order]

    def groups_of(lo, hi):
        out = []
        for t in np.unique(T[lo:hi]):
            idx = lo + np.nonzero(T[lo:hi] == t)[0]
            out.append({"tex": int(t), "start": int(idx[0]) * 3, "count": int(len(idx)) * 3})
        return out
    bounds = np.searchsorted(owner, np.arange(-1, len(pieces) + 1))
    house = groups_of(bounds[0], bounds[1])
    piece_meta = []
    for k, o in enumerate(pieces):
        lo, hi = bounds[k + 1], bounds[k + 2]
        if hi <= lo:
            continue
        b = o["box"]
        piece_meta.append({"id": o["id"], "label": o.get("label"), "kind": o.get("kind"), "layer": o.get("layer"),
                           "room": (o.get("room") or {}).get("label"), "on_floor": bool(o.get("on_floor")),
                           "centre": b["centre"][:2], "yaw_deg": b["yaw_deg"], "size": b["size_lwh_m"],
                           "floor_z": o["floor_z"], "z_bottom": o["floor_z"] + b["z_bottom"], "z_top": o["floor_z"] + b["z_top"],
                           "triangles": int(hi - lo), "groups": groups_of(lo, hi)})

    # empty-house patches around the pieces (fill what was hidden under / behind them)
    patch = None
    er = ROOT / f"pano_{sid}" / "mesh_diff" / "empty_room_textured.obj"
    if piece_meta and er.exists():
        PV, PC, PF = load_colour_obj(er)
        from scipy import ndimage
        cen = PV[PF].mean(1)
        cell, grow = 0.1, max(1, int(round(a.patch_margin / 0.1)))
        tc = V[F].astype("f8").mean(1)
        sel, start = [], 0
        for k_, p in enumerate(piece_meta):           # each piece gets its own fill, shown only once it has moved
            g = p["groups"]; lo, hi = min(x["start"] for x in g) // 3, max(x["start"] + x["count"] for x in g) // 3
            pc = tc[lo:hi, :2]                        # the piece's own footprint (not its box), grown by the margin
            o = pc.min(0) - (grow + 1) * cell
            I = np.floor((pc - o) / cell).astype(int)
            occ = np.zeros(I.max(0) + grow + 2, bool); occ[I[:, 0], I[:, 1]] = True
            occ = ndimage.binary_dilation(occ, iterations=grow)
            J = np.floor((cen[:, :2] - o) / cell).astype(int)
            ok = (J[:, 0] >= 0) & (J[:, 1] >= 0) & (J[:, 0] < occ.shape[0]) & (J[:, 1] < occ.shape[1])
            ok &= (cen[:, 2] > p["floor_z"] - 0.15) & (cen[:, 2] < p["z_top"] + 0.2)
            k = np.nonzero(ok)[0]; k = k[occ[J[k, 0], J[k, 1]]]
            p["fill"] = {"start": start * 3, "count": int(len(k)) * 3}
            sel.append(k); start += len(k)
        sel = np.concatenate(sel)
        used, inv = np.unique(PF[sel], return_inverse=True)
        patch = (PV[used].astype("<f4"), (np.clip(PC[used], 0, 1) * 255).round().astype("u1"), inv.reshape(-1, 3).astype("<u4"))

    out = ROOT / f"assets_{sid}" / "walk"
    out.mkdir(parents=True, exist_ok=True)
    offs = {"position": 0, "uv": int(V.nbytes), "index": int(V.nbytes + uv.nbytes)}
    with open(out / "mesh.bin", "wb") as fh:
        fh.write(V.tobytes()); fh.write(uv.tobytes()); fh.write(F.tobytes())
        pos = fh.tell()
        if patch:
            pv, pc, pf = patch
            rgb = np.zeros((len(pc), 4), "u1"); rgb[:, :3] = pc
            offs.update(patch_position=pos, patch_color=pos + pv.nbytes, patch_index=pos + pv.nbytes + rgb.nbytes)
            fh.write(pv.tobytes()); fh.write(rgb.tobytes()); fh.write(pf.tobytes())

    spots = []
    poses = ROOT / f"pano_{sid}" / "mesh_diff" / "pano_poses.json"
    if poses.exists():
        for p in json.loads(poses.read_text())["panos"]:
            spots.append({"id": p["id"], "label": p.get("label"), "position": p["position"],
                          "yaw_deg": p.get("yaw_deg"), "mirror": p.get("mirror"),
                          "furnished": f"/pano_{sid}/mesh_diff/{p['furnished']}" if p.get("furnished") else None})
    meta = {"model": sid, "frame": "model frame (x east, y north, z up), metres",
            "vertices": int(len(V)), "triangles": int(len(F)), "offsets": offs,
            "texture_dir": f"/assets_{sid}/tiles/furnished_tex/", "textures": [str(n) for n in names],
            "groups": house, "pieces": piece_meta,
            "patch": {"vertices": int(len(patch[0])), "triangles": int(len(patch[2]))} if patch else None,
            "bbox": [V.min(0).round(3).tolist(), V.max(0).round(3).tolist()], "spots": spots}
    (out / "meta.json").write_text(json.dumps(meta, indent=1))
    mb = (out / "mesh.bin").stat().st_size / 1e6
    print(f"   wrote {out / 'mesh.bin'} ({len(F)} triangles, {len(names)} textures, {mb:.0f} MB), "
          f"{len(piece_meta)} movable pieces ({int((owner >= 0).sum())} triangles), "
          f"{meta['patch']['triangles'] if patch else 0} fill triangles, "
          f"{len(spots)} scan spots{'' if spots else ' (no pano_poses.json yet - run the bake step for the photo view)'}")

if __name__ == "__main__":
    main()
