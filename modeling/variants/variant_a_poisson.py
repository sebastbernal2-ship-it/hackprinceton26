#!/usr/bin/env python3
r"""
variant_a_poisson.py - method A: replace every furniture piece by ONE closed, consistently oriented surface
reconstructed implicitly from the scan (no seams by construction), coloured from the scan texture.

Per piece (local frame of the cut GLB: box centre x,y, floor z, z up):
  1. dense surface samples of the scanned cut (+ texture colour); normals unoriented.
  2. free-space carving: every scan camera (pano) gets an equirectangular depth map of what it really saw
     (this piece, every other piece and the plan walls as occluders); voxels a camera saw IN FRONT of a surface
     are empty (>= --min-views cameras; tripod nadir cone ignored).
  3. shape prior -> occupancy mask (sign of the implicit function far from the scan):
       solid kinds on the floor (sofa, bed, cabinet, wardrobe, dresser, ...): footprint outline filled from the
           floor up to the scanned top height map (closed back / sides / base), minus carved free space
       everything else (chairs, tables, lamps, decor): a thin shell band behind the scanned surface, closed over
           small tears, enclosed cavities filled, minus carved free space (legs / rails stay thin)
  4. normals oriented away from the mask interior (gradient of its distance field), then an implicit function
       f = Hoppe signed distance to the oriented scan points near the scan (sub-voxel accurate real surface),
           mask signed distance elsewhere (plausible unseen sides), lightly smoothed
     -> marching cubes -> one watertight, outward-wound mesh (small floaters dropped).
  5. colour: vertex colours from the nearest scanned texels facing the same way (wide average on unseen parts).

    python modeling/variants\variant_a_poisson.py                 # all 120 pieces
    python modeling/variants\variant_a_poisson.py --ids 0 44 105
Outputs pano_<model>/mesh_diff/objects_variant_a/*.glb, pano_<model>/mesh_diff/scene_variant_a.json
"""
import argparse, json, math, os, shutil, sys, time
import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree
from skimage.measure import marching_cubes

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from refine_objects import read_glb, sample, to_local, srgb_to_linear, clean  # noqa: E402
from types import SimpleNamespace
from tile_objects import write_glb  # noqa: E402

SOLID = {"sofa", "armchair", "bed", "cabinet", "wardrobe", "dresser", "nightstand", "wall unit", "shelf"}


# ------------------------------------------------------------------ cameras: depth maps + carving
class Carver:
    def __init__(self, cams, occ, ang=0.006, max_dist=8.0, nadir_deg=35.0):
        self.ang, self.max_dist = ang, max_dist
        self.nadir_el = -math.radians(90 - nadir_deg)
        self.W, self.H = int(math.ceil(2 * math.pi / ang)), int(math.ceil(math.pi / ang))
        self.cams, self.maps = [], []
        for c in cams:
            d = occ - c; r = np.linalg.norm(d, axis=1)
            k = (r < max_dist) & (r > 0.05)
            if not k.any():
                continue
            iu, iv = self._bins(d[k], r[k])
            dm = np.full(self.W * self.H, np.inf, np.float32)
            np.minimum.at(dm, iv * self.W + iu, r[k].astype(np.float32))
            dm = ndimage.minimum_filter(dm.reshape(self.H, self.W), size=3, mode="wrap")
            self.cams.append(c); self.maps.append(dm)

    def _bins(self, d, r):
        az = np.arctan2(d[:, 1], d[:, 0]); el = np.arcsin(np.clip(d[:, 2] / np.maximum(r, 1e-9), -1, 1))
        iu = np.clip(((az + math.pi) / self.ang).astype(np.int64), 0, self.W - 1)
        iv = np.clip(((el + math.pi / 2) / self.ang).astype(np.int64), 0, self.H - 1)
        return iu, iv

    def count_empty(self, Q, margin):
        cnt = np.zeros(len(Q), np.int16)
        for c, dm in zip(self.cams, self.maps):
            d = Q - c; r = np.linalg.norm(d, axis=1)
            iu, iv = self._bins(d, r)
            el = np.arcsin(np.clip(d[:, 2] / np.maximum(r, 1e-9), -1, 1))
            cnt += ((r < dm[iv, iu] - margin) & (el > self.nadir_el) & (r < self.max_dist)).astype(np.int16)
        return cnt

    def sees(self, P, tol):
        """number of cameras that see point P (its depth matches the depth map)."""
        cnt = np.zeros(len(P), np.int16)
        for c, dm in zip(self.cams, self.maps):
            d = P - c; r = np.linalg.norm(d, axis=1); iu, iv = self._bins(d, r)
            cnt += (r < dm[iv, iu] + tol).astype(np.int16)
        return cnt


def wall_points(walls_l, step=0.03, z0=-0.1, z1=2.8):
    out = []
    for a, b in walls_l:
        L = np.linalg.norm(b - a); n = max(2, int(L / step) + 1)
        t = np.linspace(0, 1, n); xy = a[None] + t[:, None] * (b - a)[None]
        zs = np.arange(z0, z1, step)
        out.append(np.c_[np.repeat(xy, len(zs), 0), np.tile(zs, n)])
    return np.vstack(out) if out else np.zeros((0, 3))


# ------------------------------------------------------------------ one piece
def reconstruct(prims, o, cams_l, occ_other, a):
    kind = (o.get("kind") or "").lower()
    on_floor = o.get("on_floor", True) is not False
    cl = clean(prims, SimpleNamespace(sliver_len=0.15, sliver_ratio=12))   # scanner 'curtain' slivers (streaky texture)
    S, N, C, _ = sample(prims, a.spacing, cap=a.cap)
    if len(S) < 200:
        return None, {"skipped": "too little surface"}
    ext = S.max(0) - S.min(0)
    h = float(np.clip(ext.max() / a.res, a.hmin, a.hmax))
    solid = kind in SOLID and on_floor
    t_band = max(a.band, 1.5 * h)
    lo = S.min(0) - (t_band + 4 * h); hi = S.max(0) + (t_band + 4 * h)
    if on_floor:
        lo[2] = -2 * h
    shape = np.ceil((hi - lo) / h).astype(int) + 1
    gi = lambda P: np.floor((P - lo) / h + 0.5).astype(int)
    centres = lambda idx: lo + idx * h

    # unsigned distance to the scan (voxel EDT, exact KD distance near the surface)
    occ = np.zeros(shape, bool); I = gi(S); occ[I[:, 0], I[:, 1], I[:, 2]] = True
    Dv, near_idx = ndimage.distance_transform_edt(~occ, return_indices=True)
    Dv = Dv * h

    # --- prior occupancy
    if solid:
        XY = I[:, :2]
        top = np.full(shape[:2], -1, int); np.maximum.at(top, (XY[:, 0], XY[:, 1]), I[:, 2])
        foot = top >= 0
        r = max(1, int(round(a.foot_close / h)))
        st = ndimage.generate_binary_structure(2, 1)
        foot = ndimage.binary_closing(np.pad(foot, r + 1), st, iterations=r)[r + 1:-r - 1, r + 1:-r - 1]
        foot = ndimage.binary_fill_holes(foot)
        foot = ndimage.binary_opening(foot, st, iterations=1) | (top >= 0)
        foot = ndimage.gaussian_filter(foot.astype(np.float32), 1.5) > 0.5          # smooth outline (no flutes)
        # height map: missing columns take the nearest scanned column's top; light median
        has = top >= 0
        _, ind = ndimage.distance_transform_edt(~has, return_indices=True)
        topf = top[ind[0], ind[1]]
        topf = np.maximum(ndimage.median_filter(topf, size=3), 0)
        z = np.arange(shape[2])[None, None, :]
        M = foot[:, :, None] & (z <= topf[:, :, None]) & (z >= gi(np.array([[0, 0, 0.0]]))[0, 2])
        M |= Dv < t_band
    else:
        M = Dv < t_band
        r = max(1, int(round(a.close / h)))
        M = ndimage.binary_closing(np.pad(M, r + 1), iterations=r)[r + 1:-r - 1, r + 1:-r - 1, r + 1:-r - 1]
    M = ndimage.binary_fill_holes(M)

    # --- free-space carving by the scan cameras
    info = {"kind": kind or None, "voxel_m": round(h, 4), "cleanup": cl, "prior": "solid footprint" if solid else "shell band"}
    carver = None
    if len(cams_l):
        rmax = np.linalg.norm(cams_l[:, None, :] - np.array([lo, hi])[None], axis=2).max()
        carver = Carver(cams_l, np.vstack([S, occ_other]), max_dist=a.max_dist)
        idx = np.argwhere(M)
        empty = carver.count_empty(centres(idx), margin=a.margin * h) >= a.min_views
        M[tuple(idx[empty].T)] = False
        info["cameras"] = len(carver.cams); info["carved_vox"] = int(empty.sum())
    if on_floor:
        M[:, :, :max(0, gi(np.array([[0, 0, 0.0]]))[0, 2] - 1)] = False        # nothing below the floor
    # keep sizeable components only
    lab, nl = ndimage.label(M)
    if nl > 1:
        sz = np.bincount(lab.ravel()); sz[0] = 0
        keep = sz >= max(a.min_comp, 0.01 * sz.max())
        M = keep[lab]
    M = ndimage.binary_fill_holes(M)
    if not M.any():
        return None, {"skipped": "empty mask"}

    # --- mask signed distance (negative inside)
    Dm = (ndimage.distance_transform_edt(~M) - ndimage.distance_transform_edt(M)) * h
    Dm = np.where(M, Dm + 0.5 * h, Dm - 0.5 * h)                      # M inside: edt(M)>0 -> negative
    Dms = ndimage.gaussian_filter(Dm, 1.0)

    # --- orient scan normals away from the mask interior (+ camera vote where cameras see the point)
    G = np.stack(np.gradient(Dms), 0)
    Pi = (S - lo) / h
    g = np.stack([ndimage.map_coordinates(G[k], Pi.T, order=1, mode="nearest") for k in range(3)], 1)
    sgn = np.sign((N * g).sum(1)); sgn[sgn == 0] = 1
    N = N * sgn[:, None]

    # --- implicit function: Hoppe signed distance near the scan, mask distance elsewhere
    F = Dms.copy()
    band = Dv < a.hoppe * h
    bidx = np.argwhere(band)
    X = centres(bidx)
    tree = cKDTree(S)
    d, nn = tree.query(X, k=8, workers=-1)
    w = 1 / (d + 0.3 * h)
    hop = ((((X[:, None, :] - S[nn]) * N[nn]).sum(2)) * w).sum(1) / w.sum(1)
    # blend: trust the scan fully at the surface, fade to the mask field at the band edge
    t = np.clip(d[:, 0] / (a.hoppe * h), 0, 1) ** 2
    F[tuple(bidx.T)] = (1 - t) * hop + t * Dms[tuple(bidx.T)]
    F = ndimage.gaussian_filter(F, a.sigma)
    # topology clean-up on the sampled field: no enclosed bubbles (would read as inner shells), no specks
    ins = F < 0
    cav = ndimage.binary_fill_holes(ins) & ~ins
    F[cav] = -0.3 * h
    ins |= cav
    lab, nl = ndimage.label(ins)
    if nl > 1:
        sz = np.bincount(lab.ravel()); sz[0] = 0
        small = (sz < max(a.min_comp, 0.01 * sz.max()))[lab] & ins
        F[small] = 0.3 * h
    info["cavities_filled"] = int(cav.sum())
    F = np.pad(F, 1, constant_values=h * 5)
    if on_floor:
        zf = gi(np.array([[0, 0, 0.0]]))[0, 2] + 1                    # flat base exactly at the floor
        F[:, :, :zf] = np.maximum(F[:, :, :zf], 0.5 * h)
    if F.min() >= 0:
        return None, {"skipped": "no inside"}
    V, Fc, Nv, _ = marching_cubes(F, 0.0, spacing=(h, h, h))
    V = V + lo - h
    # drop tiny floating components
    Fc = Fc.astype(np.int64)
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components
    E = np.r_[Fc[:, [0, 1]], Fc[:, [1, 2]]]
    ncomp, cl = connected_components(coo_matrix((np.ones(len(E)), (E[:, 0], E[:, 1])), shape=(len(V), len(V))), directed=False)
    if ncomp > 1:
        cnt = np.bincount(cl[Fc[:, 0]], minlength=ncomp)
        good = cnt >= max(a.min_tris, 0.005 * cnt.max())
        Fc = Fc[good[cl[Fc[:, 0]]]]
    used, Fl = np.unique(Fc, return_inverse=True); Fl = Fl.reshape(-1, 3); V = V[used]
    # outward winding: signed volume must be positive
    T = V[Fl]
    vol = np.einsum("ij,ij->i", T[:, 0], np.cross(T[:, 1], T[:, 2])).sum() / 6
    if vol < 0:
        Fl = Fl[:, ::-1]
    # vertex normals (area weighted)
    T = V[Fl]; fn = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0])
    VN = np.zeros_like(V)
    for k in range(3):
        np.add.at(VN, Fl[:, k], fn)
    VN /= np.maximum(np.linalg.norm(VN, axis=1, keepdims=True), 1e-12)

    # --- colour from the scan
    COL = colour(V, Fl, VN, S, N, C, tree, h)
    info.update(verts=int(len(V)), tris=int(len(Fl)), volume_m3=round(abs(float(vol)), 4),
                scanned_vert_share=round(float((tree.query(V, workers=-1)[0] < 1.5 * h).mean()), 3))
    return {"P": V.astype(np.float32), "F": Fl.astype(np.uint32), "UV": None,
            "COL": srgb_to_linear(COL).astype(np.float32), "color": (1, 1, 1), "name": "variant_a"}, info


def colour(V, Fl, VN, S, N, C, tree, h):
    """scanned parts: nearest texels facing the same way; unseen parts: blend of nearby scanned colours facing the same way
    (else the piece's median colour for that facing), smooth, slightly darkened."""
    d, nn = tree.query(V, k=12, workers=-1)
    facing = np.clip((N[nn] * VN[:, None, :]).sum(2), 0, 1)
    w = facing ** 2 / (d + 0.004) ** 2 + 1e-6 / (d + 0.004)
    col = (C[nn] * w[..., None]).sum(1) / w.sum(1)[:, None]
    far = d[:, 0] > 2.0 * h
    if far.any() and (~far).any():
        # unseen parts: a wide Gaussian blend of the scanned colours around them (no streaks), faded in with the
        # distance from the scan and slightly darkened like a shaded back side
        k = np.flatnonzero(~far)
        rng = np.random.default_rng(0)
        ks = k if len(k) <= 6000 else rng.choice(k, 6000, replace=False)
        kt = cKDTree(V[ks])
        dk, nk = kt.query(V[far], k=min(96, len(ks)), workers=-1)
        dk = np.atleast_2d(dk); nk = np.atleast_2d(nk)
        dot = np.clip((VN[ks][nk] * VN[far][:, None, :]).sum(2), 0, 1)
        wk = np.exp(-(dk / 0.15) ** 2) * dot ** 2 + 1e-12
        local = (col[ks][nk] * wk[..., None]).sum(1) / wk.sum(1)[:, None]
        # the piece's own colour for that facing (sides / tops / undersides), where no similar surface is near
        def cls(nz):
            return np.where(nz > 0.6, 0, np.where(nz < -0.6, 2, 1))
        ck, cf = cls(VN[k, 2]), cls(VN[far, 2])
        allmed = np.median(col[k], 0)
        med = np.array([np.median(col[k][ck == c], 0) if (ck == c).sum() > 20 else allmed for c in range(3)])
        alpha = (wk.sum(1) / (wk.sum(1) + 0.5))[:, None]
        blur = alpha * local + (1 - alpha) * med[cf]
        t = np.clip((d[far, 0] - 2.0 * h) / (4.0 * h), 0, 1)[:, None]
        col[far] = (1 - t) * col[far] + t * blur * 0.93
    return np.clip(col, 0, 1)


# ------------------------------------------------------------------ main
G = {}


def to_world(o, P):
    b = o["box"]; ang = math.radians(b["yaw_deg"]); c, s_ = math.cos(ang), math.sin(ang)
    return np.c_[P[:, 0] * c - P[:, 1] * s_ + b["centre"][0], P[:, 0] * s_ + P[:, 1] * c + b["centre"][1], P[:, 2] + o["floor_z"]]


def init_worker(g):
    G.update(g)


def process(r):
    a, md, o = G["a"], G["md"], G["objs"].get(r["id"])
    t = time.time(); fn = "objects_variant_a/" + os.path.basename(r["file"])
    try:
        prims = read_glb(os.path.join(md, r["file"]))
        cams, walls, Wp, Wo = G["cams"], G["walls"], G["Wp"], G["Wo"]
        cl = to_local(o, cams)
        wl = np.stack([to_local(o, walls[:, 0]), to_local(o, walls[:, 1])], 1) if len(walls) else np.zeros((0, 2, 2))
        occ = np.vstack([to_local(o, Wp[Wo != r["id"]]), wall_points(wl)])
        prim, info = reconstruct(prims, o, cl, occ, a)
    except Exception as e:
        import traceback; traceback.print_exc(); prim, info = None, {"skipped": f"error {e}"}
    if prim is None:
        shutil.copyfile(os.path.join(md, r["file"]), os.path.join(md, fn)); info["copied_raw"] = True
    else:
        write_glb(os.path.join(md, fn), [prim])
    info["seconds"] = round(time.time() - t, 1)
    return fn, info


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", default="zvKHR9DHNjJ")
    ap.add_argument("--ids", type=int, nargs="*")
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--spacing", type=float, default=0.006)
    ap.add_argument("--cap", type=int, default=450_000)
    ap.add_argument("--res", type=float, default=220, help="voxels along the longest side")
    ap.add_argument("--hmin", type=float, default=0.011)
    ap.add_argument("--hmax", type=float, default=0.018)
    ap.add_argument("--band", type=float, default=0.03, help="shell thickness behind a one-sided scan (m)")
    ap.add_argument("--close", type=float, default=0.03, help="tears up to ~2x this are closed (non-solid kinds)")
    ap.add_argument("--foot-close", type=float, default=0.08, help="footprint closing radius (solid kinds)")
    ap.add_argument("--margin", type=float, default=1.0, help="carving stops this many voxels before a seen surface")
    ap.add_argument("--min-views", type=int, default=2)
    ap.add_argument("--max-dist", type=float, default=8.0)
    ap.add_argument("--hoppe", type=float, default=1.5, help="near-scan band (voxels) where the scan points decide")
    ap.add_argument("--sigma", type=float, default=1.2)
    ap.add_argument("--min-comp", type=int, default=60)
    ap.add_argument("--min-tris", type=int, default=150)
    a = ap.parse_args()

    md = os.path.join(f"pano_{a.model}", "mesh_diff")
    scene = json.load(open(os.path.join(md, "scene_tiles.json")))
    objs = {o["id"]: o for o in json.load(open(os.path.join(md, "objects.json")))["objects"]}
    W = [w for w in json.load(open(os.path.join(md, "plan.json")))["walls"] if w.get("physical", True)]
    walls = np.array([[w["a"][:2], w["b"][:2]] for w in W], float).reshape(-1, 2, 2)
    cams = np.array([p["position"] for p in json.load(open(os.path.join(md, "pano_poses.json")))["panos"] if p.get("position")], float)

    t0 = time.time()
    Wp, Wo = [], []                         # every piece's scanned surface in world coordinates (occluders)
    for r in scene["objects"]:
        o = objs.get(r["id"])
        if r.get("file") and o is not None:
            Sw = sample(read_glb(os.path.join(md, r["file"])), 0.02, cap=60_000)[0]
            if len(Sw):
                Wp.append(to_world(o, Sw)); Wo.append(np.full(len(Sw), r["id"]))
    Wp = np.vstack(Wp); Wo = np.concatenate(Wo)
    print(f"{len(scene['objects'])} pieces, {len(cams)} cameras, {len(walls)} walls; occluders {len(Wp)} pts ({time.time() - t0:.0f}s)", flush=True)

    os.makedirs(os.path.join(md, "objects_variant_a"), exist_ok=True)
    out_p = os.path.join(md, "scene_variant_a.json")
    prev = {r["id"]: r for r in json.load(open(out_p))["objects"]} if a.ids and os.path.exists(out_p) else {}
    todo = [r for r in scene["objects"] if (not a.ids or r["id"] in a.ids) and r.get("file") and r["id"] in objs]
    g = dict(a=a, md=md, objs=objs, cams=cams, walls=walls, Wp=Wp, Wo=Wo)
    todo.sort(key=lambda r: -r.get("triangles", 0))          # big pieces first (load balancing)
    res = {}
    if a.workers > 1 and len(todo) > 1:
        from multiprocessing import Pool
        with Pool(min(a.workers, len(todo)), initializer=init_worker, initargs=(g,)) as pool:
            for r, (fn, info) in zip(todo, pool.imap(process, todo)):
                res[r["id"]] = (fn, info); report(r, objs, info)
    else:
        init_worker(g)
        for r in todo:
            fn, info = process(r); res[r["id"]] = (fn, info); report(r, objs, info)
    out = []
    for r in scene["objects"]:
        if r["id"] in res:
            fn, info = res[r["id"]]; nr = dict(r); nr.update(file=fn, original_file=r["file"], variant_a=info); out.append(nr)
        else:
            out.append(prev.get(r["id"], dict(r)))
    json.dump({"frame": scene.get("frame"), "annotation_frame": scene.get("annotation_frame"),
               "method": "variant A: watertight implicit reconstruction (Hoppe signed distance to oriented scan points near "
                         "the scan + camera-carved shape-prior occupancy elsewhere, marching cubes, scan vertex colours "
                         "with harmonic fill on unseen sides)",
               "objects": out}, open(out_p, "w"), indent=1)
    print(f"done in {time.time() - t0:.0f}s -> {out_p}")


def report(r, objs, info):
    print(f"  obj {r['id']:3d} {str(objs[r['id']].get('kind')):12s} {info.get('prior', info.get('skipped')):16s} "
          f"h {info.get('voxel_m', 0):.3f} cams {info.get('cameras', 0):2d} tris {info.get('tris', 0):7d} "
          f"scan-share {info.get('scanned_vert_share', 0):.2f}  {info['seconds']:.1f}s", flush=True)


if __name__ == "__main__":
    main()
