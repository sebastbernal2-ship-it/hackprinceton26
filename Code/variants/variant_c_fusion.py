#!/usr/bin/env python3
r"""
variant_c_fusion.py - method C: volumetric fusion of each scanned furniture piece into ONE closed mesh, coloured from
the real (furnished) panoramas taken at the scan positions.

Per piece (local frame of the scan cut: origin = box centre x,y and floor z, z up):
  1. surface samples of the scanned cut (+ texture colours); normals ORIENTED by the scan cameras that see each
     triangle (global panoramic depth buffers of the furnished scene = empty room + every piece), unseen triangles
     take the orientation of their seen neighbours
  2. voxel volume (~1.5 cm). Near the scan (band tau): implicit MLS signed distance  f(x) = sum w (x-p).n / sum w
     (fills small holes, merges thin double layers). Behind a one-sided surface this gives a slab of thickness tau,
     so open shells (a table top, a chair back, a wardrobe seen from the front only) become closed solids.
  3. shape prior beyond the band: solid kinds (sofa, bed, cabinet, wardrobe, dresser, nightstand, wall unit, shelf)
     fill their footprint from the floor up to the scanned top; everything else (tables, chairs, lamps, decor) is
     empty there, so legs, chair backs and open space under tops survive.
  4. space carving: prior voxels that >= --min-views cameras could see (closer than the furnished-scene depth in that
     direction, outside the tripod nadir cone) are empty.
  5. enclosed cavities filled, tiny debris dropped, light smoothing -> skimage marching cubes -> one closed mesh with
     outward winding.
  6. colour per vertex: best panoramas (facing, distance, not occluded by the scene or the new mesh itself) sampled
     from the furnished equirect photos (convention of texture_bake.py, verified); vertices on the scanned surface
     blend in the scan texture; vertices no camera saw take the nearest scan colour facing the same way.

    python Code\variants\variant_c_fusion.py                # all 120 objects
    python Code\variants\variant_c_fusion.py --ids 0 8 2    # only some (others keep previous output / raw)
Writes pano_<sid>/mesh_diff/objects_variant_c/*.glb and scene_variant_c.json.
"""
import argparse, json, math, os, shutil, sys, time
import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.spatial import cKDTree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from refine_objects import read_glb, to_local, footprint, srgb_to_linear  # noqa: E402
from tile_objects import write_glb  # noqa: E402

SOLID = {"sofa", "armchair", "bed", "cabinet", "wardrobe", "dresser", "nightstand", "wall unit", "shelf"}
BOXY = {"cabinet", "wardrobe", "dresser", "nightstand"}

DH, DW = 512, 1024           # depth-buffer resolution (equirect over world heading)
NADIR = math.radians(55)     # tripod blind cone: rays more than this below the horizon are not trusted


# ------------------------------------------------------------------ helpers
def to_world(o, P):
    b = o["box"]; a = math.radians(b["yaw_deg"]); c, s = math.cos(a), math.sin(a)
    return np.c_[P[:, 0] * c - P[:, 1] * s + b["centre"][0], P[:, 0] * s + P[:, 1] * c + b["centre"][1], P[:, 2] + o["floor_z"]]


def rot_world(o, N):
    b = o["box"]; a = math.radians(b["yaw_deg"]); c, s = math.cos(a), math.sin(a)
    return np.c_[N[:, 0] * c - N[:, 1] * s, N[:, 0] * s + N[:, 1] * c, N[:, 2]]


def sample_tris(prims, spacing, cap=400_000, seed=0):
    """Surface samples with the index of their triangle (global over prims) and texture colour."""
    rng = np.random.default_rng(seed)
    tot = sum(0.5 * np.linalg.norm(np.cross(p["P"][p["F"]][:, 1] - p["P"][p["F"]][:, 0],
                                             p["P"][p["F"]][:, 2] - p["P"][p["F"]][:, 0]), axis=1).sum() for p in prims if len(p["F"]))
    sp = max(spacing, math.sqrt(tot / cap)) if tot else spacing
    X, N, C, TI = [], [], [], []
    base = 0
    for p in prims:
        if not len(p["F"]):
            continue
        T = p["P"][p["F"]]; cr = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0])
        ar = 0.5 * np.linalg.norm(cr, axis=1)
        ok = ar > 1e-10
        n = np.where(ok, np.clip(np.ceil(ar / sp ** 2), 1, 4000), 0).astype(int)
        t = np.repeat(np.arange(len(T)), n)
        r1, r2 = rng.random(len(t)), rng.random(len(t)); s = np.sqrt(r1)
        bc = np.c_[1 - s, s * (1 - r2), s * r2]
        X.append(np.einsum("nk,nkd->nd", bc, T[t]))
        N.append((cr / np.maximum(2 * ar, 1e-12)[:, None])[t])
        if p["UV"] is not None and p["img"] is not None:
            uv = np.einsum("nk,nkd->nd", bc, p["UV"][p["F"]][t]); h, w = p["img"].shape[:2]
            C.append(p["img"][np.clip(np.rint(uv[:, 1] * (h - 1)), 0, h - 1).astype(int),
                              np.clip(np.rint(uv[:, 0] * (w - 1)), 0, w - 1).astype(int)])
        else:
            C.append(np.tile(np.array(p["color"], np.float32), (len(t), 1)))
        TI.append(t + base); base += len(T)
    if not X:
        return np.zeros((0, 3)), np.zeros((0, 3)), np.zeros((0, 3)), np.zeros(0, int)
    return np.vstack(X), np.vstack(N), np.vstack(C).astype(np.float32), np.concatenate(TI)


def load_obj(path):
    V, F = [], []
    for line in open(path, errors="ignore"):
        if line.startswith("v "):
            V.append([float(x) for x in line.split()[1:4]])
        elif line.startswith("f "):
            idx = [int(t.split("/")[0]) for t in line.split()[1:]]
            idx = [i - 1 if i > 0 else len(V) + i for i in idx]
            for k in range(1, len(idx) - 1):
                F.append((idx[0], idx[k], idx[k + 1]))
    return np.array(V, float), np.array(F, int)


def mesh_samples(V, F, spacing, seed=1):
    rng = np.random.default_rng(seed)
    T = V[F]; ar = 0.5 * np.linalg.norm(np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]), axis=1)
    n = np.clip(np.ceil(ar / spacing ** 2), 1, 20000).astype(int)
    t = np.repeat(np.arange(len(T)), n)
    r1, r2 = rng.random(len(t)), rng.random(len(t)); s = np.sqrt(r1)
    bc = np.c_[1 - s, s * (1 - r2), s * r2]
    return np.einsum("nk,nkd->nd", bc, T[t])


# ------------------------------------------------------------------ cameras: panoramas + depth buffers
class Cams:
    def __init__(self, md, panos, eq_w=2048):
        self.md, self.eq_w = md, eq_w
        self.items = [dict(id=p["id"], label=p.get("label"), cam=np.array(p["position"], float), yaw=math.radians(p["yaw_deg"]),
                           mirror=p["mirror"], file=os.path.join(md, p["furnished"]), img=None, depth=None)
                      for p in panos if p.get("furnished") and os.path.exists(os.path.join(md, p["furnished"]))]
        self.pos = np.array([c["cam"] for c in self.items])

    @staticmethod
    def dirpix(D):
        r = np.linalg.norm(D, axis=1)
        th = np.arctan2(D[:, 1], D[:, 0]); lat = np.arcsin(np.clip(D[:, 2] / np.maximum(r, 1e-9), -1, 1))
        row = np.clip(((np.pi / 2 - lat) / np.pi * DH).astype(int), 0, DH - 1)
        col = np.clip(((th + np.pi) / (2 * np.pi) * DW).astype(int), 0, DW - 1)
        return row, col, r, lat

    def build_depth(self, Pw, max_r=14.0):
        for c in self.items:
            D = Pw - c["cam"]
            k = np.flatnonzero(np.abs(D).max(1) < max_r)
            row, col, r, _ = self.dirpix(D[k])
            o = np.argsort(-r)                                  # far first: the nearest write wins
            buf = np.full(DH * DW, np.inf, np.float32)
            buf[(row * DW + col)[o]] = r[o]
            buf = buf.reshape(DH, DW)
            buf = ndimage.minimum_filter(buf, size=3, mode="wrap")
            c["depth"] = buf

    def depth_at(self, c, Pw, extra=None):
        row, col, r, lat = self.dirpix(Pw - c["cam"])
        d = c["depth"][row, col]
        if extra is not None:
            d = np.minimum(d, extra[row, col])
        return d, r, lat

    def splat(self, c, Pw):
        row, col, r, _ = self.dirpix(Pw - c["cam"])
        o = np.argsort(-r)
        buf = np.full(DH * DW, np.inf, np.float32); buf[(row * DW + col)[o]] = r[o]
        return ndimage.minimum_filter(buf.reshape(DH, DW), size=3, mode="wrap")

    def image(self, c):
        if c["img"] is None:
            im = Image.open(c["file"]).convert("RGB")
            if im.width != self.eq_w:
                im = im.resize((self.eq_w, self.eq_w // 2), Image.BOX)
            c["img"] = np.asarray(im)
        return c["img"]

    def colour(self, c, Pw):
        """texture_bake.Panos.sample convention: lon = ((heading - yaw) * mirror) wrapped; col 0 = lon -pi; row 0 = up.
        Bilinear lookup."""
        d = Pw - c["cam"]
        theta = np.arctan2(d[:, 1], d[:, 0])
        lon = ((theta - c["yaw"]) * c["mirror"] + np.pi) % (2 * np.pi) - np.pi
        lat = np.arctan2(d[:, 2], np.hypot(d[:, 0], d[:, 1]))
        img = self.image(c); H, W = img.shape[:2]
        x = (lon + np.pi) / (2 * np.pi) * W - 0.5; y = (np.pi / 2 - lat) / np.pi * H - 0.5
        x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int); fx = (x - x0)[:, None]; fy = (y - y0)[:, None]
        x1 = (x0 + 1) % W; x0 %= W; y0 = np.clip(y0, 0, H - 1); y1 = np.clip(y0 + 1, 0, H - 1)
        im = img.astype(np.float32) if False else img
        c00 = im[y0, x0].astype(np.float32); c01 = im[y0, x1].astype(np.float32)
        c10 = im[y1, x0].astype(np.float32); c11 = im[y1, x1].astype(np.float32)
        out = (c00 * (1 - fx) + c01 * fx) * (1 - fy) + (c10 * (1 - fx) + c11 * fx) * fy
        return out / 255.0


# ------------------------------------------------------------------ 1 normals oriented by the cameras
def orient(Sw, Nw, TI, cams, a):
    """+1/-1 per sample: flip so the normal faces the cameras that see that triangle."""
    vote = np.zeros(len(Sw))
    nseen = np.zeros(len(Sw), int)
    for c in cams.items:
        d, r, lat = cams.depth_at(c, Sw)
        ok = (r < a.max_dist) & (r <= d * 1.02 + 0.03) & (lat > -NADIR)
        if not ok.any():
            continue
        u = (c["cam"] - Sw[ok]) / r[ok, None]
        cos = (u * Nw[ok]).sum(1)
        vote[ok] += cos / (r[ok] ** 2 + 0.5)
        nseen[ok] += 1
    nt = TI.max() + 1
    tv = np.bincount(TI, vote, nt)
    tc = np.bincount(TI, (nseen > 0).astype(float), nt)
    sgn = np.zeros(len(Sw))
    known = tc[TI] > 0
    sgn[known] = np.where(tv[TI[known]] >= 0, 1.0, -1.0)
    # unseen triangles: agree with oriented neighbours (same side of thin parts: only close & similar normals)
    unk = np.flatnonzero(~known)
    if len(unk) and known.any():
        kn = np.flatnonzero(known)
        On = Nw[kn] * sgn[kn, None]
        tree = cKDTree(Sw[kn])
        dd, ii = tree.query(Sw[unk], k=min(8, len(kn)), distance_upper_bound=0.06)
        if ii.ndim == 1:
            dd, ii = dd[:, None], ii[:, None]
        val = np.isfinite(dd); ii = np.where(val, ii, 0)
        dots = (On[ii] * Nw[unk][:, None, :]).sum(2) * val
        s = np.where(dots.sum(1) >= 0, 1.0, -1.0)
        s[~val.any(1)] = 1.0
        # per triangle majority
        tv2 = np.bincount(TI[unk], s, nt)
        sgn[unk] = np.where(tv2[TI[unk]] >= 0, 1.0, -1.0)
    sgn[sgn == 0] = 1.0
    return sgn, float((nseen > 0).mean())


# ------------------------------------------------------------------ 2-5 fusion
def fuse(S, N, kind, on_floor, o, cams, a, stats):
    vox = a.vox
    zfloor = 0.0 if on_floor else None
    lo = S.min(0) - 4 * vox; hi = S.max(0) + 4 * vox
    if on_floor:
        lo[2] = -2 * vox
    shp = np.ceil((hi - lo) / vox).astype(int) + 1
    while np.prod(shp) > a.max_voxels:
        vox *= 1.12
        lo = S.min(0) - 4 * vox; hi = S.max(0) + 4 * vox
        if on_floor:
            lo[2] = -2 * vox
        shp = np.ceil((hi - lo) / vox).astype(int) + 1
    stats["voxel_m"] = round(vox, 4)
    tau = a.band_vox * vox
    h = a.h_vox * vox
    gx, gy, gz = [lo[i] + np.arange(shp[i]) * vox for i in range(3)]
    G = np.stack(np.meshgrid(gx, gy, gz, indexing="ij"), -1).reshape(-1, 3)

    # --- band: MLS signed distance
    tree = cKDTree(S)
    dist, idx = tree.query(G, k=a.knn, distance_upper_bound=tau, workers=-1)
    band = np.isfinite(dist[:, 0])
    f = np.full(len(G), np.nan, np.float32)
    bi = np.flatnonzero(band)
    dd, ii = dist[bi], idx[bi]
    val = np.isfinite(dd); ii = np.where(val, ii, 0)
    w = np.exp(-(np.where(val, dd, 0) ** 2) / h ** 2) * val
    sd = ((G[bi][:, None, :] - S[ii]) * N[ii]).sum(2)
    f[bi] = (w * sd).sum(1) / np.maximum(w.sum(1), 1e-12)
    del dist, idx

    # --- prior
    prior = np.zeros(len(G), bool)
    prior_type = "none (scan slab)"
    if kind in SOLID and on_floor:
        flo, fshape, mask, Hf = footprint(S, 0.0, vox)
        if kind in BOXY and mask.sum() > 20:            # rectangular footprint for case goods
            I = np.argwhere(mask)
            r0, r1 = np.percentile(I, 1, 0).astype(int), np.percentile(I, 99, 0).astype(int)
            rect = np.zeros_like(mask); rect[r0[0]:r1[0] + 1, r0[1]:r1[1] + 1] = True
            if mask.sum() > 0.6 * rect.sum():
                mask = rect | mask
        ci = np.floor((G[:, :2] - flo) / vox).astype(int)
        inb = (ci[:, 0] >= 0) & (ci[:, 1] >= 0) & (ci[:, 0] < fshape[0]) & (ci[:, 1] < fshape[1])
        cc = np.clip(ci, 0, np.array(fshape) - 1)
        prior = inb & mask[cc[:, 0], cc[:, 1]] & (G[:, 2] <= Hf[cc[:, 0], cc[:, 1]]) & (G[:, 2] >= 0)
        prior_type = "solid: footprint from floor to scanned top"
    stats["prior"] = prior_type

    # --- space carving of prior voxels outside the band
    test = np.flatnonzero(prior & ~band)
    carved = 0
    if len(test):
        Gw = to_world(o, G[test])
        cnt = np.zeros(len(test), int)
        for c in cams.items:
            if np.linalg.norm(c["cam"][:2] - Gw[:, :2].mean(0)) > a.max_dist + 3:
                continue
            d, r, lat = cams.depth_at(c, Gw)
            cnt += (r < a.max_dist) & (lat > -NADIR) & (r < d * 0.97 - a.carve_margin)
        free = cnt >= a.min_views
        prior[test[free]] = False
        carved = int(free.sum())
    stats["carved_voxels"] = carved

    # --- combine
    F = np.where(band, f, np.where(prior, -tau, tau)).astype(np.float32)
    # inside the prior, the band may only push surfaces OUT where the scan is consistent: keep MLS (it's the scan)
    if on_floor:
        F[G[:, 2] < -0.5 * vox] = tau                     # nothing below the floor
    F = F.reshape(shp)
    inside = F < 0
    if prior.any() and a.core:                            # solid interior: scan junk inside cannot open pockets
        inside |= ndimage.binary_erosion(prior.reshape(shp), iterations=a.core)
    if a.close:                                           # seal cracks / pockets thinner than ~2 voxels
        inside = ndimage.binary_closing(np.pad(inside, a.close + 1), iterations=a.close)[(slice(a.close + 1, -a.close - 1),) * 3]
    inside = ndimage.binary_fill_holes(inside)            # enclosed cavities (scan junk inside) -> solid
    lab, n = ndimage.label(inside)
    if n == 0:
        return None, None, stats
    sz = np.bincount(lab.ravel())[1:]
    keep = 1 + np.flatnonzero(sz >= max(a.min_comp, a.min_comp_frac * sz.max()))
    inside = np.isin(lab, keep)
    stats["components"] = int(len(keep))
    F = np.where(inside, np.minimum(F, -0.3 * vox), np.maximum(F, 0.3 * vox)).astype(np.float32)
    F = np.clip(F, -tau, tau)
    if a.sigma > 0:
        Fs = ndimage.gaussian_filter(F, a.sigma)
        # don't let the blur dissolve thin parts: keep sign of the unblurred volume where it is decisive
        F = np.where(inside, np.minimum(Fs, -0.15 * vox), np.maximum(Fs, 0.15 * vox)) if a.keep_thin else Fs
    F = np.pad(F, 1, constant_values=tau)
    from skimage.measure import marching_cubes
    v, faces, nrm, _ = marching_cubes(F, 0.0)
    v = lo + (v - 1) * vox
    # outward winding: face normal should point up the field (field positive outside)
    T = v[faces]
    cr = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0])
    gr = np.stack(np.gradient(F), -1)
    gi = np.clip(np.rint((T.mean(1) - lo) / vox + 1).astype(int), 0, np.array(F.shape) - 1)
    g = gr[gi[:, 0], gi[:, 1], gi[:, 2]]
    if (cr * g).sum(1).sum() < 0:
        faces = faces[:, [0, 2, 1]]
    stats["volume_m3"] = round(float(inside.sum() * vox ** 3), 3)
    return v, faces.astype(np.int64), stats


def vertex_normals(V, F):
    n = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    N = np.zeros_like(V)
    for k in range(3):
        np.add.at(N, F[:, k], n)
    return N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)


def taubin(V, F, iters=3):
    from scipy.sparse import coo_matrix
    E = np.r_[F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]
    A = coo_matrix((np.ones(len(E)), (E[:, 0], E[:, 1])), shape=(len(V), len(V))); A = ((A + A.T) > 0).astype(float).tocsr()
    deg = np.asarray(A.sum(1)).ravel()
    P = V.copy()
    for _ in range(iters):
        for lam in (0.5, -0.53):
            P += lam * (A @ P / np.maximum(deg, 1)[:, None] - P)
    return P


# ------------------------------------------------------------------ 6 colour
def colourize(V, Nv, o, S, Ns, Cs, cams, a, stats, F=None):
    Vw = to_world(o, V); Nw = rot_world(o, Nv)
    # self-occlusion buffer per camera from the new mesh (only for cameras in range)
    n = len(V)
    W = []; cols = []
    centre = Vw.mean(0)
    for c in cams.items:
        if np.linalg.norm(c["cam"] - centre) > a.max_dist + 2:
            continue
        u = c["cam"] - Vw; r = np.linalg.norm(u, axis=1); u /= np.maximum(r, 1e-9)[:, None]
        cos = (u * Nw).sum(1)
        ok = (cos > a.min_cos) & (r < a.max_dist)
        if not ok.any():
            continue
        own = cams.splat(c, Vw - u * 0.015)               # mesh pulled 1.5 cm towards the camera: no self-shadow acne
        d, rr, lat = cams.depth_at(c, Vw, own)
        ok &= (rr <= d + 0.035 + 0.01 * rr) & (lat > -math.radians(68))
        k = np.flatnonzero(ok)
        if not len(k):
            continue
        w = np.zeros(n, np.float32); w[k] = cos[k] ** 2 / (r[k] ** 2 + 0.25)
        W.append(w); cols.append((c, k))
    seen = np.zeros(n, bool)
    Cp = np.zeros((n, 3), np.float32)
    if W:
        Wm = np.stack(W, 1)
        best = Wm.max(1, keepdims=True)
        top = np.argsort(-Wm, 1)[:, :2]
        keep = np.zeros_like(Wm, bool); np.put_along_axis(keep, top, True, 1)
        Wm = np.where(keep & (Wm >= 0.5 * best) & (Wm > 0), Wm, 0)
        acc = np.zeros((n, 3), np.float32); ws = np.zeros(n, np.float32)
        for j, (c, k) in enumerate(cols):
            kk = k[Wm[k, j] > 0]
            if not len(kk):
                continue
            acc[kk] += cams.colour(c, Vw[kk]) * Wm[kk, j, None]; ws[kk] += Wm[kk, j]
        seen = ws > 0
        Cp[seen] = acc[seen] / ws[seen, None]
    # scan texture colour: nearest samples facing the same way
    tree = cKDTree(S)
    dd, ii = tree.query(V, k=16, workers=-1)
    agree = (Ns[ii] * Nv[:, None, :]).sum(2) > 0.3
    agree[agree.sum(1) < 2] = True
    wgt = agree * np.exp(-(dd / (2 * a.vox)) ** 2) + 1e-6 * agree
    Cscan = (Cs[ii] * wgt[..., None]).sum(1) / wgt.sum(1)[:, None]
    near = dd[:, 0] < a.scan_near * a.vox
    if a.colour == "pano":
        C = np.where(seen[:, None], Cp, Cscan)
    elif a.colour == "scan":
        C = Cscan.copy()
    else:   # hybrid: scan texture where the surface is the scan (sharp, registered), photos on predicted surfaces
        C = np.where(near[:, None], Cscan, np.where(seen[:, None], Cp, Cscan))
        # soft transition: vertices just beyond the scan band mix
        mid = ~near & seen & (dd[:, 0] < 2 * a.scan_near * a.vox)
        C[mid] = 0.5 * Cscan[mid] + 0.5 * Cp[mid]
    if a.col_smooth and F is not None:                   # de-speckle colours off the scan surface
        from scipy.sparse import coo_matrix
        E = np.r_[F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]
        A = coo_matrix((np.ones(len(E)), (E[:, 0], E[:, 1])), shape=(n, n)); A = ((A + A.T) > 0).astype(np.float32).tocsr()
        deg = np.maximum(np.asarray(A.sum(1)).ravel(), 1)
        mob = ~near
        for _ in range(a.col_smooth):
            Cn = (A @ C) / deg[:, None]
            C[mob] = 0.5 * C[mob] + 0.5 * Cn[mob]
    C[(Nv[:, 2] < -0.7)] *= 0.5                           # undersides: in shadow
    stats["pano_seen_frac"] = round(float(seen.mean()), 3)
    stats["on_scan_frac"] = round(float(near.mean()), 3)
    return np.clip(C, 0, 1)


# ------------------------------------------------------------------ per object
def process(path, o, cams, a):
    prims = read_glb(path)
    kind = (o.get("kind") or "").lower()
    stats = {"kind": kind or None}
    S, N, C, TI = sample_tris(prims, a.spacing)
    if len(S) < 200:
        return None, {**stats, "result": "raw copy: too little surface"}
    on_floor = o.get("on_floor", True) is not False
    Sw = to_world(o, S); Nw = rot_world(o, N)
    sgn, seen_frac = orient(Sw, Nw, TI, cams, a)
    N = N * sgn[:, None]
    stats["normals_flipped_frac"] = round(float((sgn < 0).mean()), 3)
    stats["scan_seen_frac"] = round(seen_frac, 3)
    V, F, stats = fuse(S, N, kind, on_floor, o, cams, a, stats)
    if V is None or len(F) < 50:
        return None, {**stats, "result": "raw copy: fusion empty"}
    if a.smooth:
        V = taubin(V, F, a.smooth)
    Nv = vertex_normals(V, F)
    col = colourize(V, Nv, o, S, N, C, cams, a, stats, F)
    prim = {"P": V.astype(np.float32), "F": F.astype(np.uint32), "UV": None, "image": None,
            "COL": srgb_to_linear(col).astype(np.float32), "name": "fused", "color": (1, 1, 1)}
    stats.update(result="fused", vertices=int(len(V)), triangles=int(len(F)))
    return [prim], stats


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", default="zvKHR9DHNjJ")
    ap.add_argument("--ids", type=int, nargs="*")
    ap.add_argument("--vox", type=float, default=0.015)
    ap.add_argument("--max-voxels", type=int, default=2_500_000)
    ap.add_argument("--spacing", type=float, default=0.006, help="scan sample spacing (m)")
    ap.add_argument("--band-vox", type=float, default=3.5, help="MLS band / min. slab thickness in voxels")
    ap.add_argument("--h-vox", type=float, default=1.5, help="MLS kernel width in voxels")
    ap.add_argument("--knn", type=int, default=12)
    ap.add_argument("--sigma", type=float, default=1.0)
    ap.add_argument("--keep-thin", type=int, default=0)
    ap.add_argument("--close", type=int, default=2)
    ap.add_argument("--core", type=int, default=2)
    ap.add_argument("--smooth", type=int, default=2)
    ap.add_argument("--min-views", type=int, default=2)
    ap.add_argument("--carve-margin", type=float, default=0.05)
    ap.add_argument("--max-dist", type=float, default=8.0)
    ap.add_argument("--min-comp", type=int, default=150)
    ap.add_argument("--min-comp-frac", type=float, default=0.02)
    ap.add_argument("--scan-near", type=float, default=1.0, help="vertices this many voxels from the scan count as scanned")
    ap.add_argument("--colour", default="hybrid", choices=["hybrid", "pano", "scan"])
    ap.add_argument("--col-smooth", type=int, default=4)
    ap.add_argument("--min-cos", type=float, default=0.2)
    ap.add_argument("--out", default="objects_variant_c")
    ap.add_argument("--scene-out", default="scene_variant_c.json")
    a = ap.parse_args()

    md = os.path.join(f"pano_{a.model}", "mesh_diff")
    t0 = time.time()
    scene = json.load(open(os.path.join(md, "scene_tiles.json")))
    objs = {o["id"]: o for o in json.load(open(os.path.join(md, "objects.json")))["objects"]}
    cams = Cams(md, json.load(open(os.path.join(md, "pano_poses.json")))["panos"])
    # furnished scene for depth buffers: empty room + every piece's real surface (world)
    pts = []
    Vr, Fr = load_obj(os.path.join(md, "empty_room.obj"))
    pts.append(mesh_samples(Vr, Fr, 0.02))
    for r in scene["objects"]:
        o = objs.get(r["id"])
        if o is None or not r.get("file"):
            continue
        S = sample_tris(read_glb(os.path.join(md, r["file"])), 0.01, cap=150_000)[0]
        if len(S):
            pts.append(to_world(o, S))
    Pw = np.vstack(pts)
    cams.build_depth(Pw)
    print(f"{len(cams.items)} panoramas, depth buffers from {len(Pw)} points ({time.time() - t0:.0f}s)", flush=True)

    od = os.path.join(md, a.out); os.makedirs(od, exist_ok=True)
    out_p = os.path.join(md, a.scene_out)
    prev = {r["id"]: r for r in json.load(open(out_p))["objects"]} if a.ids and os.path.exists(out_p) else {}
    out = []
    for r in scene["objects"]:
        o = objs.get(r["id"])
        if a.ids and r["id"] not in a.ids:
            out.append(prev.get(r["id"], dict(r))); continue
        fn = f"{a.out}/" + os.path.basename(r["file"])
        t = time.time()
        try:
            prims, st = process(os.path.join(md, r["file"]), o, cams, a) if o is not None else (None, {"result": "raw copy: no box"})
        except Exception as e:
            import traceback; traceback.print_exc()
            prims, st = None, {"result": f"raw copy: error {e}"}
        if prims is None:
            shutil.copyfile(os.path.join(md, r["file"]), os.path.join(md, fn))
        else:
            write_glb(os.path.join(md, fn), prims)
        st["seconds"] = round(time.time() - t, 1)
        nr = dict(r); nr.update(file=fn, original_file=r["file"], variant_c=st)
        out.append(nr)
        print(f"  obj {r['id']:3d} {str(r.get('label') or ''):18s} {str(st.get('kind')):12s} {st['result']:28s} "
              f"vox {st.get('voxel_m', '-')}  flip {st.get('normals_flipped_frac', '-')}  carved {st.get('carved_voxels', '-')}  "
              f"pano {st.get('pano_seen_frac', '-')}  {st['seconds']}s", flush=True)
    json.dump({"frame": scene.get("frame"), "method": "variant C: MLS signed distance from camera-oriented scan + shape prior "
               "+ space carving -> marching cubes; vertex colours from furnished panoramas (scan texture on scanned surface)",
               "objects": out}, open(out_p, "w"), indent=1)
    print(f"done in {time.time() - t0:.0f}s -> {out_p}")


if __name__ == "__main__":
    main()
