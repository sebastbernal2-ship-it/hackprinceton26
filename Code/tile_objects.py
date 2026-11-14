#!/usr/bin/env python3
r"""
tile_objects.py - cut every furniture object out of Matterport's full-quality furnished mesh (3D Tiles) and save
it as a textured, movable model; label objects with Matterport's own AI object annotations.

Inputs (repo root):
    assets_<sid>/tiles/furnished_mesh.npz       from tiles_mesh.py
    assets_<sid>/tiles/defurnished_mesh.npz     from tiles_mesh.py (falls back to mesh_diff/empty_room.obj)
    pano_<sid>/mesh_diff/objects.json           object boxes (mesh_furniture.py + pano_pipeline.py)
    assets_<sid>/object_annotations_furnished.json   optional, from fetch_tiles.py
Outputs in pano_<sid>/mesh_diff/:
    objects_tiles/obj_###.glb   textured model, local frame (origin = box centre x,y and floor z; z up; unrotated)
    scene_tiles.json            per object: file, label (+source), triangles, refined size; studio/editor prefer these

A triangle belongs to an object when it lies inside the object's (padded) box and is NOT part of the empty house
(farther than --tol from the defurnished mesh).

    python Code\tile_objects.py
    python Code\tile_objects.py --ids 13 21 --pad 0.2
"""
import argparse, glob, io, json, math, os, struct, sys
import numpy as np
from PIL import Image


# ------------------------------------------------------------------ helpers
class NearSet:
    def __init__(self, P, r, cell=0.03):
        self.cell, self.o = cell, P.min(0) - 1
        self.S = np.unique(self.pack(self.key(P)))
        k = int(math.ceil(r / cell))
        self.off = np.array([(i, j, l) for i in range(-k, k + 1) for j in range(-k, k + 1) for l in range(-k, k + 1)
                             if i * i + j * j + l * l <= k * k + 1])

    def key(self, X):
        return np.floor((X - self.o) / self.cell).astype(np.int64)

    @staticmethod
    def pack(I):
        return (I[:, 0] + 4) * 2 ** 42 + (I[:, 1] + 4) * 2 ** 21 + (I[:, 2] + 4)

    def near(self, Q):
        I = self.key(Q); hit = np.zeros(len(Q), bool)
        for o in self.off:
            kk = self.pack(I + o)
            pos = np.clip(np.searchsorted(self.S, kk), 0, len(self.S) - 1)
            hit |= self.S[pos] == kk
        return hit


def surface_samples(V, F, spacing=0.03, cap=4_000_000):
    tri = V[F]
    area = 0.5 * np.linalg.norm(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1)
    n = np.clip(np.ceil(area / spacing ** 2), 1, 400).astype(int)
    if n.sum() > cap:
        n = np.maximum(1, (n * cap / n.sum()).astype(int))
    t = np.repeat(np.arange(len(F)), n)
    rng = np.random.default_rng(0); r1, r2 = rng.random(len(t)), rng.random(len(t)); s = np.sqrt(r1)
    return np.vstack([V, (1 - s)[:, None] * tri[t, 0] + (s * (1 - r2))[:, None] * tri[t, 1] + (s * r2)[:, None] * tri[t, 2]])


def load_obj(path):
    V, F = [], []
    for line in open(path, errors="ignore"):
        if line.startswith("v "):
            V.append([float(x) for x in line.split()[1:4]])
        elif line.startswith("f "):
            ix = [int(t.split("/")[0]) - 1 for t in line.split()[1:]]
            for k in range(1, len(ix) - 1):
                F.append((ix[0], ix[k], ix[k + 1]))
    return np.array(V, float), np.array(F, int)


# ------------------------------------------------------------------ GLB writer
def write_glb(path, prims):
    """prims: list of dict(P=(n,3) float32, UV=(n,2) or None, F=(m,3) uint32, image=bytes|None, color=(r,g,b))"""
    bin_parts, views, accs, meshes_p, mats, texs, imgs = [], [], [], [], [], [], []
    off = 0

    def add_view(data, target=None):
        nonlocal off
        pad = (-len(data)) % 4
        bin_parts.append(data + b"\0" * pad)
        v = {"buffer": 0, "byteOffset": off, "byteLength": len(data)}
        if target:
            v["target"] = target
        views.append(v); off += len(data) + pad
        return len(views) - 1

    for p in prims:
        P = np.ascontiguousarray(p["P"], np.float32)
        iv = add_view(P.tobytes(), 34962)
        accs.append({"bufferView": iv, "componentType": 5126, "count": len(P), "type": "VEC3",
                     "min": P.min(0).tolist(), "max": P.max(0).tolist()})
        attrs = {"POSITION": len(accs) - 1}
        if p.get("UV") is not None:
            iv = add_view(np.ascontiguousarray(p["UV"], np.float32).tobytes(), 34962)
            accs.append({"bufferView": iv, "componentType": 5126, "count": len(P), "type": "VEC2"}); attrs["TEXCOORD_0"] = len(accs) - 1
        Fi = np.ascontiguousarray(p["F"], np.uint32).ravel()
        iv = add_view(Fi.tobytes(), 34963)
        accs.append({"bufferView": iv, "componentType": 5125, "count": len(Fi), "type": "SCALAR"})
        ind = len(accs) - 1
        mat = {"pbrMetallicRoughness": {"metallicFactor": 0, "roughnessFactor": 1}, "doubleSided": True,
               "extensions": {"KHR_materials_unlit": {}}}
        if p.get("image") is not None:
            iv = add_view(p["image"])
            imgs.append({"bufferView": iv, "mimeType": "image/jpeg"}); texs.append({"source": len(imgs) - 1})
            mat["pbrMetallicRoughness"]["baseColorTexture"] = {"index": len(texs) - 1}
        else:
            mat["pbrMetallicRoughness"]["baseColorFactor"] = list(p.get("color", (0.6, 0.6, 0.6))) + [1]
        mats.append(mat)
        meshes_p.append({"attributes": attrs, "indices": ind, "material": len(mats) - 1})
    js = {"asset": {"version": "2.0", "generator": "hackprinceton tile_objects.py"},
          "extensionsUsed": ["KHR_materials_unlit"], "scene": 0, "scenes": [{"nodes": [0]}],
          "nodes": [{"mesh": 0, "extras": {"up": "z", "frame": "local: box centre x,y; floor z; unrotated"}}],
          "meshes": [{"primitives": meshes_p}], "materials": mats, "accessors": accs, "bufferViews": views,
          "buffers": [{"byteLength": off}]}
    if imgs:
        js["images"], js["textures"] = imgs, texs
    j = json.dumps(js, separators=(",", ":")).encode("utf-8"); j += b" " * ((-len(j)) % 4)
    b = b"".join(bin_parts)
    out = struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(j) + 8 + len(b))
    out += struct.pack("<II", len(j), 0x4E4F534A) + j + struct.pack("<II", len(b), 0x004E4942) + b
    open(path, "wb").write(out)


def textured_prims(Vl, F, UV, T, texfiles, texdir, max_px=1024):
    prims = []
    for tid in np.unique(T):
        sel = T == tid
        Fs = F[sel]
        used = np.unique(Fs)
        remap = np.full(F.max() + 1, -1); remap[used] = np.arange(len(used))
        P = Vl[used]; Fl = remap[Fs]
        if tid < 0 or UV is None:
            prims.append({"P": P, "F": Fl, "UV": None, "color": (0.62, 0.6, 0.57)}); continue
        uv = UV[used].copy()
        im = Image.open(os.path.join(texdir, texfiles[tid])).convert("RGB"); W, H = im.size
        u0, v0 = np.clip(uv.min(0), 0, 1); u1, v1 = np.clip(uv.max(0), 0, 1)
        x0, x1 = int(math.floor(u0 * W)), int(math.ceil(u1 * W)); y0, y1 = int(math.floor(v0 * H)), int(math.ceil(v1 * H))
        x1, y1 = max(x1, x0 + 2), max(y1, y0 + 2)
        crop = im.crop((x0, y0, x1, y1))
        uv[:, 0] = (uv[:, 0] * W - x0) / (x1 - x0)
        uv[:, 1] = (uv[:, 1] * H - y0) / (y1 - y0)
        if max(crop.size) > max_px:
            crop.thumbnail((max_px, max_px))
        buf = io.BytesIO(); crop.save(buf, "JPEG", quality=88)
        prims.append({"P": P, "F": Fl, "UV": uv, "image": buf.getvalue()})
    return prims


# ------------------------------------------------------------------ annotations
def load_annotations(path):
    if not path or not os.path.exists(path):
        return []
    out = []
    for a in json.load(open(path)):
        p = a.get("anchorPosition") or {}
        if all(k in p for k in "xyz") and a.get("label"):
            out.append({"label": a["label"], "conf": a.get("confidence") or 0, "pos": np.array([p["x"], p["y"], p["z"]], float),
                        "enabled": a.get("enabled", True)})
    return out


def split_components(V, F, sel, voxel=0.04, spacing=0.02):
    """Group the selected triangles into spatially connected pieces (gaps up to ~1 voxel are bridged, so texture
    seams / duplicated vertices don't split a piece). Returns (label per selected triangle, area per triangle)."""
    from scipy import ndimage
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components
    tri = V[F[sel]]
    area = 0.5 * np.linalg.norm(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1)
    n = np.clip(np.ceil(area / spacing ** 2), 1, 2000).astype(int)
    t = np.repeat(np.arange(len(sel)), n)
    rng = np.random.default_rng(0); r1, r2 = rng.random(len(t)), rng.random(len(t)); s = np.sqrt(r1)
    S = (1 - s)[:, None] * tri[t, 0] + (s * (1 - r2))[:, None] * tri[t, 1] + (s * r2)[:, None] * tri[t, 2]
    S = np.vstack([S, tri.reshape(-1, 3)]); t = np.r_[t, np.repeat(np.arange(len(sel)), 3)]   # + the corners
    I = np.floor((S - S.min(0)) / voxel).astype(int)
    grid = np.zeros(I.max(0) + 1, bool); grid[I[:, 0], I[:, 1], I[:, 2]] = True
    lab, nl = ndimage.label(grid, structure=np.ones((3, 3, 3), bool))
    L = lab[I[:, 0], I[:, 1], I[:, 2]] - 1
    # a triangle whose samples fall in several voxel groups joins them (graph: triangle nodes + group nodes)
    g = coo_matrix((np.ones(len(t)), (t, len(sel) + L)), shape=(len(sel) + nl,) * 2)
    _, comp = connected_components(g, directed=False)
    return comp[:len(sel)], area


def keep_main_pieces(o, V, F, sel, cent, keep_frac=0.08, min_piece_tris=15):
    """Keep the biggest piece centred in the (unpadded) box plus every other sizable piece centred in the box.
    Pieces centred only in the padding are neighbours or wall/floor leftovers. Returns (kept sel, info)."""
    comp, area = split_components(V, F, sel)
    ids = np.unique(comp)
    A = np.array([area[comp == c].sum() for c in ids])
    N = np.array([(comp == c).sum() for c in ids])
    C = np.array([(cent[sel][comp == c] * area[comp == c, None]).sum(0) / max(area[comp == c].sum(), 1e-12) for c in ids])
    inbox = inside(o, C, 0.0)
    if not inbox.any():
        inbox = inside(o, C, 0.05)
    main = int(np.argmax(np.where(inbox, A, -1))) if inbox.any() else int(np.argmax(A))
    keep = (inbox & (A >= keep_frac * A[main]) & (N >= min_piece_tris)); keep[main] = True
    k = np.isin(comp, ids[keep])
    return sel[k], {"pieces": int(len(ids)), "kept_pieces": int(keep.sum()), "dropped_tris": int((~k).sum())}


def inside(o, P, pad=0.25):
    b = o["box"]; ang = math.radians(b["yaw_deg"]); d = P[:, :2] - np.array(b["centre"][:2])
    u = d[:, 0] * math.cos(ang) + d[:, 1] * math.sin(ang); v = -d[:, 0] * math.sin(ang) + d[:, 1] * math.cos(ang)
    z = P[:, 2] - o["floor_z"]
    return (np.abs(u) <= b["size_lwh_m"][0] / 2 + pad) & (np.abs(v) <= b["size_lwh_m"][1] / 2 + pad) & \
           (z >= b["z_bottom"] - pad) & (z <= b["z_top"] + pad)


def annotation_frame(anns, objs):
    """Annotations may be in the Model API frame or the Showcase frame; pick whichever lands inside more boxes."""
    if not anns:
        return anns, None
    A = np.array([a["pos"] for a in anns])
    cands = {"model frame": A, "showcase frame (x,-z,y)": np.c_[A[:, 0], -A[:, 2], A[:, 1]]}
    best = max(cands, key=lambda k: sum(inside(o, cands[k]).sum() for o in objs))
    for a, p in zip(anns, cands[best]):
        a["pos"] = p
    return anns, best


# ------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", default="Jxmnkp6KpJN")
    ap.add_argument("--ids", type=int, nargs="*")
    ap.add_argument("--pad", type=float, default=0.12, help="grow each object box by this much (m)")
    ap.add_argument("--tol", type=float, default=0.06, help="triangles closer than this to the empty house are house")
    ap.add_argument("--min-tris", type=int, default=40)
    ap.add_argument("--floor-band", type=float, default=0.12, help="up-facing triangles this close above the floor are floor (mesh skirts)")
    ap.add_argument("--wall-band", type=float, default=0.05, help="vertical triangles this close to a plan wall face are wall")
    ap.add_argument("--keep-frac", type=float, default=0.08,
                    help="besides the main piece, keep pieces centred in the box with at least this share of its area")
    ap.add_argument("--no-pieces", action="store_true", help="skip the connected-piece cleanup (old behaviour)")
    a = ap.parse_args()
    tiles = os.path.join(f"assets_{a.model}", "tiles")
    md = os.path.join(f"pano_{a.model}", "mesh_diff")
    fz = os.path.join(tiles, "furnished_mesh.npz")
    if not os.path.exists(fz):
        sys.exit("no furnished_mesh.npz - run fetch_tiles.py and tiles_mesh.py first")
    D = np.load(fz)
    V, F, UV, T, texfiles = D["V"].astype(float), D["F"], D["UV"], D["T"], [str(x) for x in D["tex"]]
    ez = os.path.join(tiles, "defurnished_mesh.npz")
    if os.path.exists(ez):
        E = np.load(ez); Ve, Fe = E["V"].astype(float), E["F"]; src_empty = "defurnished tiles"
    else:
        Ve, Fe = load_obj(os.path.join(md, "empty_room.obj")); src_empty = "defurnished 50k OBJ (coarser: raise --tol)"
    print(f"furnished: {len(F)} tris, {len(texfiles)} textures | empty: {len(Fe)} tris ({src_empty})", flush=True)
    house = NearSet(surface_samples(Ve, Fe), a.tol)
    cent = V[F].mean(1)

    objs = [o for o in json.load(open(os.path.join(md, "objects.json")))["objects"]
            if o.get("layer") in ("furniture", "surface", "floor_covering") and not any(f.startswith("duplicate_of_") for f in o.get("flags") or [])]
    if a.ids:
        objs = [o for o in objs if o["id"] in a.ids]
    anns, aframe = annotation_frame(load_annotations(os.path.join(f"assets_{a.model}", "object_annotations_furnished.json")), objs)
    if anns:
        print(f"{len(anns)} Matterport object annotations ({aframe})")

    od = os.path.join(md, "objects_tiles"); os.makedirs(od, exist_ok=True)
    texdir = os.path.join(tiles, "furnished_tex")
    scene = []
    # one spatial pre-filter for speed: only triangles that are not house
    not_house = ~house.near(cent)
    # the coarse empty mesh misses some floor and wall surface next to furniture: drop flat triangles at floor level
    # and vertical triangles lying on a plan wall (these were the orange shards around furniture bases)
    nrm = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-12)
    floor_z = float(np.median([o["floor_z"] for o in objs])) if objs else 0.0
    floorish = (np.abs(nrm[:, 2]) > 0.45) & (cent[:, 2] < floor_z + a.floor_band)   # flat or slanted 'skirt' to the floor
    plan_p = os.path.join(md, "plan.json")
    wallish = np.zeros(len(F), bool)
    if os.path.exists(plan_p):
        cand = np.where(not_house & (np.abs(nrm[:, 2]) < 0.35))[0]
        dmin = np.full(len(cand), 9.0)
        for w in json.load(open(plan_p))["walls"]:
            A, B = np.array(w["a"], float), np.array(w["b"], float); ab = B - A
            t = np.clip(((cent[cand, :2] - A) @ ab) / max(ab @ ab, 1e-9), 0, 1)
            dmin = np.minimum(dmin, np.linalg.norm(cent[cand, :2] - (A + t[:, None] * ab), axis=1) - (w.get("thickness") or 0.15) / 2)
        wallish[cand[dmin < a.wall_band]] = True
    print(f"dropping {int((not_house & floorish).sum())} floor-level and {int((not_house & wallish).sum())} wall-surface triangles")
    not_house &= ~floorish & ~wallish
    print(f"{not_house.sum()} of {len(F)} furnished triangles are not part of the empty house", flush=True)
    idx_nh = np.where(not_house)[0]
    for o in objs:
        b = o["box"]
        sel = idx_nh[inside(o, cent[idx_nh], a.pad)]
        # drop slivers that only have their centroid in the box (edges far longer than the object itself)
        if len(sel):
            tri = V[F[sel]]
            longest = np.max(np.linalg.norm(tri - np.roll(tri, 1, axis=1), axis=2), axis=1)
            sel = sel[longest <= float(np.linalg.norm(b["size_lwh_m"])) + 2 * a.pad]
        rec = {"id": o["id"], "label": o.get("label"), "label_source": o.get("label_source")}
        if len(sel) >= a.min_tris and not a.no_pieces:
            sel, info = keep_main_pieces(o, V, F, sel, cent, a.keep_frac)
            rec["pieces"] = info
        # Matterport annotation label
        if anns:
            hits = [x for x in anns if inside(o, x["pos"][None], 0.3)[0] and x["enabled"] is not False]
            if hits:
                h = max(hits, key=lambda x: x["conf"])
                rec.update(label=h["label"], label_source="matterport annotation", label_confidence=h["conf"])
        if len(sel) < a.min_tris:
            rec["result"] = f"too few triangles ({len(sel)})"; scene.append(rec)
            print(f"  obj {o['id']:3d} {str(rec['label'] or ''):14s} skipped: {rec['result']}"); continue
        used, Fs = np.unique(F[sel], return_inverse=True)        # compact: only this object's vertices
        Fs = Fs.reshape(-1, 3)
        ang = math.radians(b["yaw_deg"]); c, s_ = math.cos(-ang), math.sin(-ang)
        d = V[used, :2] - np.array(b["centre"][:2])
        Vl = np.c_[d[:, 0] * c - d[:, 1] * s_, d[:, 0] * s_ + d[:, 1] * c, V[used, 2] - o["floor_z"]]
        prims = textured_prims(Vl, Fs, UV[used], T[sel], texfiles, texdir)
        fn = f"objects_tiles/obj_{o['id']:03d}.glb"
        write_glb(os.path.join(md, fn), prims)
        P = Vl
        rec.update(file=fn, result="cut from Matterport mesh", triangles=int(len(Fs)), textured=float((T[sel] >= 0).mean()),
                   refined_size_m=[round(float(x), 3) for x in (np.ptp(P[:, 0]), np.ptp(P[:, 1]), P[:, 2].max())])
        L_, W_, H_ = rec["refined_size_m"]
        if H_ > 2.0 and min(L_, W_) < 0.45:
            rec["flags"] = ["tall_thin: door / curtain / wardrobe front?"]
        scene.append(rec)
        pc = rec.get("pieces") or {}
        print(f"  obj {o['id']:3d} {str(rec['label'] or ''):14s} {len(Fs):7d} tris  size {rec['refined_size_m']}"
              f"  pieces {pc.get('kept_pieces', '-')}/{pc.get('pieces', '-')} (-{pc.get('dropped_tris', 0)} tris)"
              + ("  TALL/THIN" if rec.get("flags") else ""), flush=True)
    json.dump({"frame": "local: origin = box centre (x,y) and floor (z), unrotated, z up", "annotation_frame": aframe,
               "objects": scene}, open(os.path.join(md, "scene_tiles.json"), "w"), indent=1)
    ok = sum(1 for r in scene if r.get("file"))
    print(f"{ok}/{len(scene)} objects cut -> {od}")


if __name__ == "__main__":
    main()
