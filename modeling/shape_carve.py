#!/usr/bin/env python3
r"""
shape_carve.py - recover the real 3D shape of each furniture object by silhouette carving (visual hull).

For every object box from mesh_diff/objects.json:
  1. fill the (padded) box with small voxels
  2. for every panorama that can see it, project each voxel into the "furniture mask"
     (furnished panorama differs from defurnished panorama) and delete voxels that land on empty room
     - voxels hidden behind the house (walls, other rooms) are not judged by that view (depth test)
  3. mesh the surviving voxels, smooth them, and colour them from the furnished photos

Inputs (made by run_all.py / texture_bake.py): mesh_diff/objects.json, empty_room.obj, pano_poses.json, panos/*.jpg
Outputs in mesh_diff/:
  objects_shape/obj_###.obj   coloured shape, local frame (origin = box centre x,y and floor z, unrotated)
  scene_shapes.json           list of shapes + quality numbers (editor3d.html prefers these over boxes)
  shape_debug/obj_###.jpg     per-view contact sheet: photo crop | mask | carved shape projected (for tuning)

    python Code\shape_carve.py                          # all furniture
    python Code\shape_carve.py --ids 13 21 9 --debug    # a few objects, with debug sheets
Needs numpy + Pillow only.
"""
import argparse, json, math, os, sys, time
import numpy as np
from PIL import Image, ImageFilter

# ------------------------------------------------------------------ settings (tune here or by flags)
DEFAULTS = dict(
    voxel=0.03,          # m: voxel size
    pad=0.12,             # m: grow the box this much each side (boxes are approximate)
    pad_top=0.10,
    mask_w=1024,          # px width of the equirect used for masks
    mask_mode="both",     # diff = furnished vs defurnished photo | consistency = other views disagree | both = AND
    diff_thresh=30,       # colour difference (0-255) vs the defurnished photo
    consist_thresh=38,    # colour difference vs the best-agreeing other panorama
    consist_views=6,      # compare with up to this many nearest panoramas
    mask_dilate=2,        # px: grow the mask (forgiving to small pose errors)
    mask_close=5,         # px: fill holes/speckle inside furniture regions (morphological closing)
    max_dist=7.0,         # m: ignore panoramas farther than this from the object
    min_views=1,          # need at least this many judging views, else keep the box
    allow_misses=1,       # a voxel always survives this many "empty" votes
    miss_frac=0.35,       # ...and survives if at most this fraction of its judging views say "empty"
    smooth=4,             # Laplacian smoothing iterations of the voxel mesh
    min_keep=0.04,        # if less than this fraction of the box survives, keep the box (carving failed)
)


# ------------------------------------------------------------------ io
def load_obj(path):
    V, F = [], []
    for line in open(path, errors="ignore"):
        if line.startswith("v "):
            V.append([float(x) for x in line.split()[1:4]])
        elif line.startswith("f "):
            idx = [int(t.split("/")[0]) - 1 for t in line.split()[1:]]
            for k in range(1, len(idx) - 1):
                F.append((idx[0], idx[k], idx[k + 1]))
    return np.array(V, float), np.array(F, int)


def write_obj(path, V, F, C, name):
    with open(path, "w") as fh:
        fh.write(f"o {name}\n")
        fh.write("".join(f"v {v[0]:.4f} {v[1]:.4f} {v[2]:.4f} {c[0]:.3f} {c[1]:.3f} {c[2]:.3f}\n" for v, c in zip(V, C)))
        fh.write("".join(f"f {f[0]+1} {f[1]+1} {f[2]+1}\n" for f in F))


# ------------------------------------------------------------------ projection (same convention as texture_bake)
class View:
    def __init__(self, rec, md, mask_w, diff_thresh, dilate, house_pts):
        self.id, self.label = rec["id"], rec["label"]
        self.cam = np.array(rec["position"], float)
        self.yaw, self.mirror = math.radians(rec["yaw_deg"]), rec["mirror"]
        h = mask_w // 2
        fu = Image.open(os.path.join(md, rec["furnished"])).convert("RGB").resize((mask_w, h), Image.BILINEAR)
        de = Image.open(os.path.join(md, rec["defurnished"])).convert("RGB").resize((mask_w, h), Image.BILINEAR)
        self.photo = np.asarray(fu)
        self.fblur = np.asarray(fu.filter(ImageFilter.GaussianBlur(1.5)), np.float32)
        self.dblur = np.asarray(de.filter(ImageFilter.GaussianBlur(1.5)), np.float32)
        self.H, self.W = h, mask_w
        self.mask = None
        # depth of the empty house from this spot (occlusion + reprojection), same size as the mask
        self.dH, self.dW = h, mask_w
        r, c, d = self.project(house_pts, self.dH, self.dW)
        z = np.full((self.dH, self.dW), np.inf)
        np.minimum.at(z, (r, c), d)
        for _ in range(2):
            z = np.minimum.reduce([z] + [np.roll(np.roll(z, i, 0), j, 1) for i in (-1, 0, 1) for j in (-1, 0, 1)])
        self.depth = z

    def surface_points(self):
        """world point where each pixel's ray meets the empty house"""
        lon = (np.arange(self.W) + 0.5) / self.W * 2 * np.pi - np.pi
        lat = np.pi / 2 - (np.arange(self.H) + 0.5) / self.H * np.pi
        lon, lat = np.meshgrid(lon, lat)
        th = self.yaw + self.mirror * lon
        d = np.stack([np.cos(lat) * np.cos(th), np.cos(lat) * np.sin(th), np.sin(lat)], -1)
        return (self.cam + d * self.depth[..., None]).reshape(-1, 3)


    def project(self, P, H=None, W=None):
        H, W = H or self.H, W or self.W
        d = P - self.cam
        dist = np.linalg.norm(d, axis=1)
        th = np.arctan2(d[:, 1], d[:, 0])
        lon = ((th - self.yaw) * self.mirror + np.pi) % (2 * np.pi) - np.pi
        lat = np.arctan2(d[:, 2], np.hypot(d[:, 0], d[:, 1]))
        col = np.clip(((lon + np.pi) / (2 * np.pi) * W).astype(int), 0, W - 1)
        row = np.clip(((np.pi / 2 - lat) / np.pi * H).astype(int), 0, H - 1)
        return row, col, dist

    def unoccluded(self, P, slack=0.15):
        r, c, d = self.project(P, self.dH, self.dW)
        return d <= self.depth[r, c] * 1.03 + slack


def build_masks(views, P):
    """furniture mask per view. 'consistency': the pixel's colour is not seen on the empty-house surface
    behind it by any other panorama -> something sits in front of the house there."""
    for v in views:
        dd = np.abs(v.fblur - v.dblur).max(2)
        m_diff = dd > P["diff_thresh"]
        m = m_diff
        if P["mask_mode"] in ("consistency", "both"):
            X = v.surface_points()
            fin = np.isfinite(X).all(1)
            cA = v.fblur.reshape(-1, 3)
            best = np.full(len(X), np.inf, np.float32)
            others = sorted((o for o in views if o is not v), key=lambda o: np.linalg.norm(o.cam - v.cam))[:P["consist_views"]]
            for o in others:
                r, c, d = o.project(np.where(fin[:, None], X, o.cam + 1), o.dH, o.dW)
                ok = fin & (d <= o.depth[r, c] * 1.03 + 0.08) & (d < 8)
                if ok.sum() < 1000:
                    continue
                smp = o.fblur[r, c]
                g = np.median((cA[ok] + 5) / (smp[ok] + 5), axis=0)
                diff = np.abs(cA - smp * g).max(1)
                best = np.where(ok, np.minimum(best, diff), best)
            best = best.reshape(v.H, v.W)
            m_con = np.where(np.isfinite(best), best > P["consist_thresh"], m_diff)
            m = m_con if P["mask_mode"] == "consistency" else (m_con & m_diff)
        im = Image.fromarray(m.astype(np.uint8) * 255)
        if P["mask_close"]:
            k = 2 * P["mask_close"] + 1
            im = im.filter(ImageFilter.MaxFilter(k)).filter(ImageFilter.MinFilter(k))
        im = im.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
        if P["mask_dilate"]:
            im = im.filter(ImageFilter.MaxFilter(2 * P["mask_dilate"] + 1))
        v.mask = np.asarray(im) > 0
    for v in views:
        v.fblur = v.dblur = None


# ------------------------------------------------------------------ voxels -> mesh
FACES = [((1, 0, 0), [(1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)]), ((-1, 0, 0), [(0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0)]),
         ((0, 1, 0), [(0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0)]), ((0, -1, 0), [(0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)]),
         ((0, 0, 1), [(0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)]), ((0, 0, -1), [(0, 0, 0), (0, 1, 0), (1, 1, 0), (1, 0, 0)])]


def voxel_mesh(occ, origin, vs, smooth):
    nx, ny, nz = occ.shape
    pad = np.pad(occ, 1)
    verts, faces, index = [], [], {}
    for (dx, dy, dz), quad in FACES:
        nb = pad[1 + dx:1 + dx + nx, 1 + dy:1 + dy + ny, 1 + dz:1 + dz + nz]
        I = np.argwhere(occ & ~nb)
        for i, j, k in I:
            ids = []
            for qx, qy, qz in quad:
                key = (i + qx, j + qy, k + qz)
                if key not in index:
                    index[key] = len(verts)
                    verts.append(key)
                ids.append(index[key])
            faces += [(ids[0], ids[1], ids[2]), (ids[0], ids[2], ids[3])]
    if not faces:
        return np.zeros((0, 3)), np.zeros((0, 3), int)
    V = np.array(verts, float) * vs + origin
    F = np.array(faces, int)
    # Laplacian smoothing (keeps the floor contact flat)
    floor = V[:, 2] <= V[:, 2].min() + 1e-6
    for _ in range(smooth):
        acc = np.zeros_like(V); cnt = np.zeros(len(V))
        for a, b in ((0, 1), (1, 2), (2, 0), (1, 0), (2, 1), (0, 2)):
            np.add.at(acc, F[:, a], V[F[:, b]]); np.add.at(cnt, F[:, a], 1)
        newV = acc / np.maximum(cnt, 1)[:, None]
        newV[floor, 2] = V[floor, 2]
        V = 0.5 * V + 0.5 * newV
    return V, F


def vertex_normals(V, F):
    n = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    N = np.zeros_like(V)
    for k in range(3):
        np.add.at(N, F[:, k], n)
    return N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)


def colour(V, N, views):
    acc = np.zeros((len(V), 3)); w = np.zeros(len(V))
    for v in views:
        d = v.cam - V
        dist = np.linalg.norm(d, axis=1)
        facing = (d * N).sum(1) / np.maximum(dist, 1e-9)
        ok = (facing > 0.1) & v.unoccluded(V, 0.1)
        if not ok.any():
            continue
        r, c, _ = v.project(V[ok], v.photo.shape[0], v.photo.shape[1])
        ww = facing[ok] ** 2 / (dist[ok] ** 2 + 0.3)
        acc[ok] += v.photo[r, c] / 255.0 * ww[:, None]; w[ok] += ww
    C = np.full((len(V), 3), 0.5)
    C[w > 0] = acc[w > 0] / w[w > 0, None]
    C[N[:, 2] < -0.7] *= 0.4
    return C


# ------------------------------------------------------------------ one object
def carve(o, views, P):
    b = o["box"]
    fz = o["floor_z"]
    l, w, _ = b["size_lwh_m"]
    ang = math.radians(b["yaw_deg"])
    ca, sa = math.cos(ang), math.sin(ang)
    vs = P["voxel"]
    x0, x1 = -l / 2 - P["pad"], l / 2 + P["pad"]
    y0, y1 = -w / 2 - P["pad"], w / 2 + P["pad"]
    z0, z1 = max(0.0, b["z_bottom"] - 0.05), b["z_top"] + P["pad_top"]
    xs = np.arange(x0, x1, vs) + vs / 2; ys = np.arange(y0, y1, vs) + vs / 2; zs = np.arange(z0, z1, vs) + vs / 2
    X, Y, Z = np.meshgrid(xs, ys, zs, indexing="ij")
    L = np.stack([X.ravel(), Y.ravel(), Z.ravel()], 1)                         # local
    Wp = np.c_[L[:, 0] * ca - L[:, 1] * sa + b["centre"][0], L[:, 0] * sa + L[:, 1] * ca + b["centre"][1], L[:, 2] + fz]
    centre = np.array([b["centre"][0], b["centre"][1], fz + (z0 + z1) / 2])

    judged = np.zeros(len(L), int); empty = np.zeros(len(L), int); used = []
    for v in views:
        if np.linalg.norm(v.cam[:2] - centre[:2]) > P["max_dist"]:
            continue
        vis = v.unoccluded(Wp)
        if vis.mean() < 0.2:
            continue
        r, c, _ = v.project(Wp)
        inmask = v.mask[r, c]
        if inmask[vis].mean() < 0.05:            # this view shows nothing of the object: its mask is unreliable
            continue
        judged += vis; empty += vis & ~inmask
        used.append(v)
    nviews = len(used)
    misses = np.maximum(P["allow_misses"] if nviews >= 3 else 0, np.floor(P["miss_frac"] * judged))
    keep = (judged >= 1) & (empty <= misses)
    keep |= judged == 0 if nviews >= P["min_views"] else True                 # unseen voxels: keep (cannot judge)
    keep &= ~((judged == 0) & (L[:, 2] > b["z_top"]))                         # but never grow above the box if unseen
    frac = keep.mean()
    info = {"views": nviews, "view_labels": [v.label for v in used], "kept_fraction": round(float(frac), 3)}
    if nviews < P["min_views"] or frac < P["min_keep"]:
        info["result"] = "box (carving not trusted)"
        keep = np.ones(len(L), bool) & (L[:, 0] >= -l / 2) & (L[:, 0] <= l / 2) & (L[:, 1] >= -w / 2) & (L[:, 1] <= w / 2) \
               & (L[:, 2] >= b["z_bottom"]) & (L[:, 2] <= b["z_top"])
    else:
        info["result"] = "carved"
    occ = keep.reshape(X.shape)
    # largest connected component only (drops floating specks)
    occ = largest_component(occ)
    if occ.any():
        idx = np.argwhere(occ)
        zmin = zs[idx[:, 2]].min() - vs / 2
        info["height_m"] = round(float(zs[idx[:, 2]].max() + vs / 2 - zmin), 3)
    origin = np.array([x0, y0, z0])
    Vl, Fl = voxel_mesh(occ, origin, vs, P["smooth"])
    return Vl, Fl, info, (Wp, keep, used, ang, b, fz)


def largest_component(occ):
    lab = np.zeros(occ.shape, int); n = 0; sizes = {}
    for start in map(tuple, np.argwhere(occ)):
        if lab[start]:
            continue
        n += 1; stack = [start]; lab[start] = n; s = 0
        while stack:
            p = stack.pop(); s += 1
            for d in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)):
                q = (p[0] + d[0], p[1] + d[1], p[2] + d[2])
                if all(0 <= q[i] < occ.shape[i] for i in range(3)) and occ[q] and not lab[q]:
                    lab[q] = n; stack.append(q)
        sizes[n] = s
    if not sizes:
        return occ
    best = max(sizes, key=sizes.get)
    return lab == best


def debug_sheet(path, dbg):
    Wp, keep, used, ang, b, fz = dbg
    tiles = []
    for v in used[:6]:
        r, c, _ = v.project(Wp)
        r0, r1 = max(0, r.min() - 20), min(v.H, r.max() + 20)
        cc = c
        if c.max() - c.min() > v.W / 2:                                  # object straddles the seam
            continue
        c0, c1 = max(0, cc.min() - 20), min(v.W, cc.max() + 20)
        photo = np.asarray(Image.fromarray(v.photo).resize((v.W, v.H)))[r0:r1, c0:c1].copy()
        mask = np.repeat(v.mask[r0:r1, c0:c1, None], 3, 2).astype(np.uint8) * 200
        shape = photo.copy() // 3
        rr, cc2, _ = v.project(Wp[keep])
        ok = (rr >= r0) & (rr < r1) & (cc2 >= c0) & (cc2 < c1)
        shape[rr[ok] - r0, cc2[ok] - c0] = [80, 220, 120]
        row = np.hstack([photo, mask, shape])
        im = Image.fromarray(row)
        im = im.resize((min(900, im.width), max(1, int(im.height * min(900, im.width) / im.width))))
        tiles.append(np.asarray(im))
    if not tiles:
        return
    wmax = max(t.shape[1] for t in tiles)
    tiles = [np.pad(t, ((0, 6), (0, wmax - t.shape[1]), (0, 0))) for t in tiles]
    Image.fromarray(np.vstack(tiles)).save(path, quality=85)


# ------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pano-dir", default=None)
    ap.add_argument("--ids", type=int, nargs="*", help="only these object ids")
    ap.add_argument("--layers", nargs="*", default=["furniture", "surface"])
    ap.add_argument("--debug", action="store_true", help="write shape_debug/obj_###.jpg contact sheets")
    for k, v in DEFAULTS.items():
        ap.add_argument("--" + k.replace("_", "-"), type=type(v), default=v)
    a = ap.parse_args()
    P = {k: getattr(a, k) for k in DEFAULTS}
    if not a.pano_dir:
        import glob
        c = [d for d in glob.glob("pano_*") if os.path.isdir(d)]
        if len(c) != 1:
            sys.exit("pass --pano-dir pano_<sid>")
        a.pano_dir = c[0]
    md = os.path.join(a.pano_dir, "mesh_diff")
    t0 = time.time()
    objs = json.load(open(os.path.join(md, "objects.json")))["objects"]
    objs = [o for o in objs if o.get("layer") in a.layers and not any(f.startswith("duplicate_of_") for f in o.get("flags") or [])]
    if a.ids:
        objs = [o for o in objs if o["id"] in a.ids]
    poses = json.load(open(os.path.join(md, "pano_poses.json")))["panos"]
    Vh, Fh = load_obj(os.path.join(md, "empty_room.obj"))
    # dense samples of the empty house for depth maps
    tri = Vh[Fh]
    area = 0.5 * np.linalg.norm(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1)
    n = np.clip((area / 0.0006).astype(int), 1, 20000)
    rng = np.random.default_rng(0)
    t = np.repeat(np.arange(len(Fh)), n); r1, r2 = rng.random(len(t)), rng.random(len(t)); s = np.sqrt(r1)
    house = (1 - s)[:, None] * tri[t, 0] + (s * (1 - r2))[:, None] * tri[t, 1] + (s * r2)[:, None] * tri[t, 2]
    # only panoramas near some object
    centres = np.array([o["box"]["centre"][:2] for o in objs]) if objs else np.zeros((0, 2))
    need = [p for p in poses if p.get("furnished") and p.get("defurnished") and len(centres)
            and np.min(np.linalg.norm(centres - np.array(p["position"][:2]), axis=1)) <= P["max_dist"]]
    print(f"{len(objs)} objects, loading {len(need)} panoramas + masks ...", flush=True)
    views = [View(p, md, P["mask_w"], P["diff_thresh"], P["mask_dilate"], house) for p in need]
    print(f"  building {P['mask_mode']} masks ...", flush=True)
    build_masks(views, P)
    print(f"  ready ({time.time()-t0:.0f}s)", flush=True)

    od = os.path.join(md, "objects_shape"); os.makedirs(od, exist_ok=True)
    dd = os.path.join(md, "shape_debug")
    if a.debug:
        os.makedirs(dd, exist_ok=True)
    sp = os.path.join(md, "scene_shapes.json")
    scene = json.load(open(sp)) if (a.ids and os.path.exists(sp)) else {"objects": []}
    byid = {s["id"]: s for s in scene["objects"]}
    for o in objs:
        Vl, Fl, info, dbg = carve(o, views, P)
        if not len(Fl):
            print(f"  obj {o['id']:3d}: nothing left"); continue
        b = o["box"]; ang = math.radians(b["yaw_deg"])
        Vw = np.c_[Vl[:, 0] * math.cos(ang) - Vl[:, 1] * math.sin(ang) + b["centre"][0],
                   Vl[:, 0] * math.sin(ang) + Vl[:, 1] * math.cos(ang) + b["centre"][1], Vl[:, 2] + o["floor_z"]]
        C = colour(Vw, vertex_normals(Vw, Fl), dbg[2] or views)
        fn = f"objects_shape/obj_{o['id']:03d}.obj"
        write_obj(os.path.join(md, fn), Vl, Fl, C, f"obj_{o['id']:03d}")
        byid[o["id"]] = dict(id=o["id"], file=fn, label=o.get("label"), triangles=int(len(Fl)), **info)
        print(f"  obj {o['id']:3d} {str(o.get('label') or ''):12s} {info['result']:26s} views={info['views']} "
              f"kept={info['kept_fraction']:.2f} tris={len(Fl)}", flush=True)
        if a.debug:
            debug_sheet(os.path.join(dd, f"obj_{o['id']:03d}.jpg"), dbg)
    scene["objects"] = sorted(byid.values(), key=lambda s: s["id"])
    scene["frame"] = "local: origin = box centre (x,y) and floor (z), unrotated; editor rotates by yaw and moves to centre"
    scene["settings"] = P
    json.dump(scene, open(sp, "w"), indent=1)
    print(f"done in {time.time()-t0:.0f}s -> {od}")


if __name__ == "__main__":
    main()
