#!/usr/bin/env python3
r"""
refine_objects.py - clean the furniture models cut from the Matterport mesh and PREDICT the parts the scan never saw
(sofa backs against a wall, the far side of a cabinet, table legs hidden behind chairs, holes in table tops).

Every object model from segment_furniture.py / tile_objects.py goes through:

  1. cleanup     degenerate / duplicate triangles, stretched 'curtain' slivers (scanner artefacts between surfaces)
  2. small holes boundary loops shorter than --hole-perim are closed (textured when the loop lies in one texture)
  3. smoothing   light Taubin smoothing (no shrinking), boundary vertices fixed, displacement capped
  4. shape prior by kind -> an occupancy volume of what the piece most likely is:
       solid  (sofa, bed, cabinet, wardrobe, dresser, nightstand, wall unit, shelf, armchair):
              its footprint filled from the floor up to its scanned top (seat, backrest, mattress); free space the
              cameras saw under an overhang (a coffee table merged into the piece, a raised frame) is carved away
       legged (table, coffee/side table, desk, chair, stool):
              the top / seat slab (measured thickness) + the legs: scanned legs, missing ones mirrored from them (or a
              pedestal / 4 corner legs when none were seen); 'webbing' the scanner stretched between legs is removed
  5. natural surface: the volume is blurred and meshed (marching cubes) -> a closed surface with rounded edges.
     Only its unseen parts are kept:
       - covered: a real surface (this piece's or a NEIGHBOUR's) lies along the patch normal within --reach -> dropped,
         so nothing is drawn twice and nothing covers the piece next to it
       - seen empty: >= --min-views scan positions had a clear view of the spot (plan walls, this piece and its
         neighbours block the view; the tripod blind cone below a camera, --nadir, never counts) -> dropped
       - then a majority vote makes coherent patches and pieces < --min-patch are dropped
     Colour = median colour of the nearby real surface facing the same way, with a little top-light shading.
  (--mirror additionally copies the mirrored real surface into gaps; off by default because scans are only roughly
   symmetric, so the copy lands a few cm beside the real surface and looks like a duplicate.)

Inputs  pano_<sid>/mesh_diff/{scene_tiles.json, objects.json, plan.json, pano_poses.json|panos.json, objects_tiles/*.glb}
Outputs pano_<sid>/mesh_diff/objects_refined/*.glb   same local frame; real surfaces textured, predicted surfaces in a
                                                     primitive whose material is named "predicted" (vertex colours)
        pano_<sid>/mesh_diff/scene_refined.json      scene_tiles.json + per object: what was cleaned / predicted,
                                                     scanned vs predicted share, confidence. studio.html prefers it.

    python Code\refine_objects.py
    python Code\refine_objects.py --ids 0 4 31 --gap 0.05
    python Code\refine_objects.py --no-predict          # cleanup only
"""
import argparse, io, json, math, os, struct, sys, time
import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.sparse import coo_matrix
from scipy.spatial import ConvexHull, cKDTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tile_objects import write_glb  # noqa: E402

SOLID = {"sofa", "armchair", "bed", "cabinet", "wardrobe", "dresser", "nightstand", "wall unit", "shelf"}
LEGGED = {"table", "coffee table", "side table", "desk", "chair", "stool"}
TABLES = {"table", "coffee table", "side table", "desk"}
MIRROR_FRONT_BACK = {"table", "coffee table", "side table", "desk", "stool", "lamp", "floor lamp"}


# ------------------------------------------------------------------ GLB in
def read_glb(path):
    b = open(path, "rb").read()
    off, js, binoff = 12, None, None
    while off + 8 <= len(b):
        n, t = struct.unpack_from("<II", b, off)
        if t == 0x4E4F534A:
            js = json.loads(b[off + 8:off + 8 + n].decode("utf-8"))
        elif t == 0x004E4942:
            binoff = off + 8
        off += 8 + n + ((-n) % 4)

    def view(i):
        v = js["bufferViews"][i]; o = binoff + v.get("byteOffset", 0)
        return b[o:o + v["byteLength"]]

    def acc(i):
        a = js["accessors"][i]; v = js["bufferViews"][a["bufferView"]]
        nc = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
        dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[a["componentType"]]
        x = np.frombuffer(b, dt, a["count"] * nc, binoff + v.get("byteOffset", 0) + a.get("byteOffset", 0))
        return x.reshape(-1, nc) if nc > 1 else x

    prims = []
    for p in js["meshes"][0]["primitives"]:
        d = {"P": acc(p["attributes"]["POSITION"]).astype(float), "F": acc(p["indices"]).reshape(-1, 3).astype(np.int64),
             "UV": None, "img": None, "jpeg": None, "color": (0.62, 0.6, 0.57)}
        if "TEXCOORD_0" in p["attributes"]:
            d["UV"] = acc(p["attributes"]["TEXCOORD_0"]).astype(float)
        m = js["materials"][p["material"]]
        if m.get("name") == "predicted":                    # an already refined file: never refine twice
            continue
        pbr = m.get("pbrMetallicRoughness", {})
        if "baseColorTexture" in pbr:
            img = js["images"][js["textures"][pbr["baseColorTexture"]["index"]]["source"]]
            d["jpeg"] = view(img["bufferView"])
            d["img"] = np.asarray(Image.open(io.BytesIO(d["jpeg"])).convert("RGB"), np.float32) / 255
        elif "baseColorFactor" in pbr:
            d["color"] = tuple(pbr["baseColorFactor"][:3])
        d["src"] = np.zeros(len(d["F"]), np.int8)           # 0 scanned, 1 mirrored, 2 hole fill
        prims.append(d)
    return prims


# ------------------------------------------------------------------ mesh helpers
def gather(prims):
    voff = np.r_[0, np.cumsum([len(p["P"]) for p in prims])]
    V = np.vstack([p["P"] for p in prims]) if prims else np.zeros((0, 3))
    F = np.vstack([p["F"] + voff[i] for i, p in enumerate(prims)]) if prims else np.zeros((0, 3), np.int64)
    return V, F, voff


def drop_faces(prims, bad):
    k = 0
    for p in prims:
        m = len(p["F"]); keep = ~bad[k:k + m]
        p["F"], p["src"] = p["F"][keep], p["src"][keep]; k += m


def weld(V, q=1e-3):
    _, inv = np.unique(np.round(V / q).astype(np.int64), axis=0, return_inverse=True)
    return inv.reshape(-1)


def edge_counts(FW, nW):
    E = FW[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2)
    und = np.sort(E, 1); key = und[:, 0] * nW + und[:, 1]
    _, inv, cnt = np.unique(key, return_inverse=True, return_counts=True)
    return E, cnt[inv.reshape(-1)]


def tri_area(T):
    return 0.5 * np.linalg.norm(np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]), axis=1)


def srgb_to_linear(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


# ------------------------------------------------------------------ 1-3 cleanup
def clean(prims, a):
    V, F, _ = gather(prims)
    if not len(F):
        return {}
    W = weld(V); FW = W[F]; T = V[F]
    cr = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]); dbl = np.linalg.norm(cr, axis=1)
    nz = np.abs(cr[:, 2]) / np.maximum(dbl, 1e-12)
    longest = np.linalg.norm(T - np.roll(T, 1, axis=1), axis=2).max(1)
    alt = dbl / np.maximum(longest, 1e-12)
    degen = (dbl < 2e-8) | (FW[:, 0] == FW[:, 1]) | (FW[:, 1] == FW[:, 2]) | (FW[:, 0] == FW[:, 2])
    sliver = (longest > a.sliver_len) & (longest > a.sliver_ratio * alt) & (nz < 0.9) & ~degen
    _, first = np.unique(np.sort(FW, 1), axis=0, return_index=True)
    dup = np.ones(len(F), bool); dup[first] = False; dup &= ~degen
    drop_faces(prims, degen | sliver | dup)
    return {"degenerate_or_duplicate": int((degen | dup).sum()), "stretched_slivers": int(sliver.sum())}


def fill_small_holes(prims, a, pred):
    """Close boundary loops shorter than --hole-perim with a fan. Textured when the whole loop lies in one texture."""
    V, F, voff = gather(prims)
    if not len(F):
        return 0
    W = weld(V); nW = W.max() + 1; FW = W[F]
    rep = np.zeros(nW, np.int64); rep[W] = np.arange(len(W)); Pw = V[rep]
    E, cnt = edge_counts(FW, nW)
    bd = E[cnt == 1]
    outc = np.bincount(bd[:, 0], minlength=nW)
    nxt = {int(u): int(v) for u, v in bd if outc[u] == 1}
    order = np.argsort(W, kind="stable"); starts = np.searchsorted(W[order], np.arange(nW + 1))
    prim_of = lambda g: np.searchsorted(voff, g, side="right") - 1
    seen, filled = set(), 0
    for s in list(nxt):
        if s in seen:
            continue
        loop, cur, ok = [s], nxt[s], True
        while cur != s:
            if cur in seen or cur not in nxt or len(loop) > 400:
                ok = False; break
            loop.append(cur); cur = nxt[cur]
        seen.update(loop)
        if not ok or len(loop) < 3:
            continue
        L = np.array(loop); P = Pw[L]
        if np.linalg.norm(P - np.roll(P, -1, 0), axis=1).sum() > a.hole_perim:
            continue
        nL = len(L)
        # the one primitive (texture) that holds every loop vertex, if any
        members = [order[starts[w]:starts[w + 1]] for w in L]
        common = set(prim_of(members[0]).tolist())
        for m in members[1:]:
            common &= set(prim_of(m).tolist())
        done = False
        for pi in sorted(common):
            p = prims[pi]
            loc = np.array([m[prim_of(m) == pi][0] - voff[pi] for m in members])
            if p["UV"] is not None and np.ptp(p["UV"][loc], 0).max() > 0.3:
                continue                                    # loop crosses a texture-atlas seam
            c = len(p["P"])
            p["P"] = np.vstack([p["P"], p["P"][loc].mean(0)])
            if p["UV"] is not None:
                p["UV"] = np.vstack([p["UV"], p["UV"][loc].mean(0)])
            nf = np.c_[np.roll(loc, -1), loc, np.full(nL, c)]   # boundary edge u->v gets the new face v,u,c
            p["F"] = np.vstack([p["F"], nf]); p["src"] = np.r_[p["src"], np.full(nL, 2, np.int8)]
            done = True; break
        if not done:
            c = P.mean(0)
            pred.add_tris(np.stack([np.roll(P, -1, 0), P, np.repeat(c[None], nL, 0)], 1), 1.0, "hole")
        filled += 1
    return filled


def smooth(prims, iters, cap=0.012):
    V, F, voff = gather(prims)
    if iters <= 0 or not len(F):
        return
    W = weld(V); nW = W.max() + 1; FW = W[F]
    rep = np.zeros(nW, np.int64); rep[W] = np.arange(len(W)); P0 = V[rep]
    E, cnt = edge_counts(FW, nW)
    fixed = np.zeros(nW, bool); fixed[E[cnt == 1].ravel()] = True
    und = np.unique(np.sort(E, 1), axis=0)
    A = coo_matrix((np.ones(len(und)), (und[:, 0], und[:, 1])), shape=(nW, nW)); A = (A + A.T).tocsr()
    deg = np.asarray(A.sum(1)).ravel(); mov = (deg > 0) & ~fixed
    P = P0.copy()
    for _ in range(iters):
        for f in (0.5, -0.53):
            Lp = A @ P / np.maximum(deg, 1)[:, None] - P
            P[mov] += f * Lp[mov]
    d = P - P0; n = np.linalg.norm(d, axis=1, keepdims=True)
    P = P0 + d * np.minimum(1, cap / np.maximum(n, 1e-12))
    Vn = P[W]
    for i, p in enumerate(prims):
        p["P"] = Vn[voff[i]:voff[i + 1]]


# ------------------------------------------------------------------ surface samples (+ colour from the texture)
def sample(prims, spacing, cap=300_000, seed=0):
    rng = np.random.default_rng(seed)
    tot = sum(tri_area(p["P"][p["F"]]).sum() for p in prims if len(p["F"]))
    sp = max(spacing, math.sqrt(tot / cap)) if tot else spacing
    X, N, C, SRC = [], [], [], []
    for p in prims:
        if not len(p["F"]):
            continue
        T = p["P"][p["F"]]; cr = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0])
        ar = 0.5 * np.linalg.norm(cr, axis=1)
        n = np.clip(np.ceil(ar / sp ** 2), 1, 4000).astype(int)
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
        SRC.append(p["src"][t])
    if not X:
        return np.zeros((0, 3)), np.zeros((0, 3)), np.zeros((0, 3)), np.zeros(0, np.int8)
    return np.vstack(X), np.vstack(N), np.vstack(C), np.concatenate(SRC)


# ------------------------------------------------------------------ what the cameras saw
class Visibility:
    """How many scan positions had a clear view of a point: in range, facing the patch, not behind a plan wall and not
    behind the object's own scanned surface (voxel grid). >= --min-views means 'that spot was seen and is empty'."""

    def __init__(self, cams, A, B, S_obs, voxel=0.03, max_dist=7.0, nadir_deg=35.0):
        self.cams, self.A, self.B, self.vox, self.max_dist = cams, A, B, voxel, max_dist
        self.nadir_cos = math.cos(math.radians(nadir_deg))      # the camera cannot see inside this cone below it
        self.lo = S_obs.min(0) - 2 * voxel
        I = np.floor((S_obs - self.lo) / voxel).astype(int)
        self.shape = I.max(0) + 3
        g = np.zeros(self.shape, bool); g[I[:, 0], I[:, 1], I[:, 2]] = True
        self.g = ndimage.binary_dilation(g, iterations=1)
        self.hi = self.lo + self.shape * voxel

    def wall_block(self, Q2, c2):
        if not len(self.A):
            return np.zeros(len(Q2), bool)
        r = c2[None] - Q2; s = self.B - self.A
        den = r[:, None, 0] * s[None, :, 1] - r[:, None, 1] * s[None, :, 0]
        qa = self.A[None] - Q2[:, None]
        with np.errstate(divide="ignore", invalid="ignore"):
            t = (qa[..., 0] * s[None, :, 1] - qa[..., 1] * s[None, :, 0]) / den
            u = (qa[..., 0] * r[:, None, 1] - qa[..., 1] * r[:, None, 0]) / den
        return ((np.abs(den) > 1e-9) & (t > 1e-3) & (t < 1) & (u >= 0) & (u <= 1)).any(1)

    def count(self, Q, N=None, t0=0.06, chunk=3000):
        cnt = np.zeros(len(Q), int)
        if not len(Q):
            return cnt
        for c in self.cams:
            d = c[None] - Q; dist = np.linalg.norm(d, axis=1); u = d / np.maximum(dist, 1e-9)[:, None]
            ok = (dist < self.max_dist) & (u[:, 2] < self.nadir_cos)   # u points to the camera: straight down = u_z 1
            if N is not None:
                ok &= (u * N).sum(1) > 0.15
            idx = np.flatnonzero(ok)
            if not len(idx):
                continue
            idx = idx[~self.wall_block(Q[idx, :2], c[:2])]
            for k in range(0, len(idx), chunk):
                ch = idx[k:k + chunk]; q, uu = Q[ch], u[ch]
                with np.errstate(divide="ignore", invalid="ignore"):
                    t1, t2 = (self.lo - q) / uu, (self.hi - q) / uu
                tex = np.nan_to_num(np.maximum(t1, t2), nan=np.inf, posinf=np.inf, neginf=np.inf).min(1)
                tmax = np.minimum(tex, dist[ch])
                if tmax.max() <= t0:
                    cnt[ch] += 1; continue
                Ts = np.arange(t0, tmax.max(), self.vox * 0.7)
                pts = q[:, None, :] + uu[:, None, :] * Ts[None, :, None]
                I = np.floor((pts - self.lo) / self.vox).astype(int)
                inb = (Ts[None, :] < tmax[:, None]) & np.all((I >= 0) & (I < self.shape), axis=2)
                hit = np.zeros(inb.shape, bool)
                hit[inb] = self.g[I[inb][:, 0], I[inb][:, 1], I[inb][:, 2]]
                cnt[ch[~hit.any(1)]] += 1
        return cnt


# ------------------------------------------------------------------ predicted surface helpers
def majority(cen, N, keep, r, iters=2):
    """Majority vote of each candidate with its neighbours facing the same way (closes stripes, drops specks)."""
    ax = np.argmax(np.abs(N), 1); key = ax * 2 + (N[np.arange(len(N)), ax] > 0)
    out = keep.copy()
    for kk in np.unique(key):
        idx = np.flatnonzero(key == kk)
        if len(idx) < 3:
            continue
        d, nb = cKDTree(cen[idx]).query(cen[idx], k=min(9, len(idx)), distance_upper_bound=r)
        valid = np.isfinite(d); nb = np.where(valid, nb, 0)
        k_ = out[idx]
        for _ in range(iters):
            k_ = (k_[nb] & valid).sum(1) >= 0.5 * valid.sum(1)
        out[idx] = k_
    return out


class Pred:
    """Predicted triangles: colour either from the nearest real texture (times shade) or fixed."""

    def __init__(self):
        self.T, self.sh, self.col, self.hidden, self.tag = [], [], [], [], []

    def add_tris(self, T, shade, tag, color=None, hidden=False):
        if not len(T):
            return
        self.T.append(np.asarray(T, float)); self.sh.append(np.broadcast_to(np.asarray(shade, float), (len(T),)).copy())
        self.col.append(None if color is None else np.broadcast_to(np.asarray(color, float), (len(T), 3)).copy())
        self.hidden.append(np.broadcast_to(np.asarray(hidden, bool), (len(T),)).copy()); self.tag.append(tag)

    def area(self, visible_only=True):
        return float(sum(tri_area(T)[~h].sum() if visible_only else tri_area(T).sum() for T, h in zip(self.T, self.hidden)))

    def primitive(self, S, C, Ns=None):
        """Colour = median colour of the nearby scanned surface that faces the same way (robust to the dark,
        smeared texels that ring scan holes); falls back to all nearby samples."""
        if not self.T:
            return None
        T = np.concatenate(self.T); sh = np.concatenate(self.sh)
        V = T.reshape(-1, 3)
        if len(S):
            cr = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0])
            nv = np.repeat(cr / np.maximum(np.linalg.norm(cr, axis=1, keepdims=True), 1e-12), 3, 0)
            k = min(48, len(S))
            _, i = cKDTree(S).query(V, k=k); i = i.reshape(len(V), k)
            Cn = C[i].astype(float)
            if Ns is not None:
                agree = (Ns[i] * nv[:, None, :]).sum(2) > 0.5
                agree[agree.sum(1) < 4] = True
                Cn = np.where(agree[..., None], Cn, np.nan)
            col = np.nanmedian(Cn, axis=1)
        else:
            col = np.full((len(V), 3), 0.6)
        k = 0
        for T_, c in zip(self.T, self.col):
            if c is not None:
                col[3 * k:3 * (k + len(T_))] = np.repeat(c, 3, 0)
            k += len(T_)
        col = col * np.repeat(sh, 3)[:, None]
        return {"P": V.astype(np.float32), "F": np.arange(len(V), dtype=np.uint32).reshape(-1, 3),
                "COL": srgb_to_linear(col).astype(np.float32), "name": "predicted"}


# ------------------------------------------------------------------ grids
def grid_for(XY, cell, margin=3):
    lo = XY.min(0) - margin * cell
    shape = (np.floor((XY.max(0) - lo) / cell) + margin + 1).astype(int)
    return lo, shape


def cells_of(XY, lo, cell, shape):
    I = np.floor((XY - lo) / cell).astype(int)
    return np.clip(I[:, 0], 0, shape[0] - 1), np.clip(I[:, 1], 0, shape[1] - 1)


def topmap(S, lo, cell, shape):
    H = np.full(shape, -np.inf); I, J = cells_of(S[:, :2], lo, cell, shape)
    np.maximum.at(H, (I, J), S[:, 2])
    return H


def largest_parts(mask, min_cells=4):
    lab, n = ndimage.label(mask)
    if not n:
        return mask
    sz = np.bincount(lab.ravel())[1:]
    return np.isin(lab, 1 + np.flatnonzero(sz >= max(min_cells, 0.05 * sz.max())))


# ------------------------------------------------------------------ 4 symmetry
def best_plane(S, axis, cell, search=0.12):
    lo, shape = grid_for(S[:, :2], cell, 1)
    H = topmap(S, lo, cell, shape); occ = np.isfinite(H)
    I = np.argwhere(occ); n = len(I)
    if n < 20:
        return 0.0, 0.0, 0.0
    coord = lo[axis] + (I[:, axis] + 0.5) * cell
    mid = 0.5 * (coord.min() + coord.max())
    best = (0.0, mid, 0.0)
    for c in np.arange(mid - search, mid + search + 1e-9, cell / 2):
        m = np.rint((2 * c - coord - lo[axis]) / cell - 0.5).astype(int)
        inb = (m >= 0) & (m < shape[axis])
        J = I[inb].copy(); J[:, axis] = m[inb]
        tgt = occ[J[:, 0], J[:, 1]]
        if tgt.sum() < 0.3 * n:
            continue
        Hs = H[I[inb][tgt, 0], I[inb][tgt, 1]]; Ht = H[J[tgt, 0], J[tgt, 1]]
        sc = float((np.abs(Hs - Ht) < 0.06).mean())
        if sc > best[0] + 1e-9:
            best = (sc, float(c), float(tgt.sum() / n))
    return best


def mirror(prims, axis, c, tree, vis, blo, bhi, a):
    cand, cen, nrm, area = [], [], [], []
    for p in prims:
        obs = np.flatnonzero(p["src"] == 0)
        T = p["P"][p["F"][obs]].copy(); T[:, :, axis] = 2 * c - T[:, :, axis]
        ce = T.mean(1)
        near = tree.query(ce, distance_upper_bound=a.gap)[0] < np.inf
        k = ~near & np.all((ce >= blo) & (ce <= bhi), 1)
        Tf = T[k][:, [0, 2, 1]]                           # mirrored = flipped winding
        cr = np.cross(Tf[:, 1] - Tf[:, 0], Tf[:, 2] - Tf[:, 0]); ar = 0.5 * np.linalg.norm(cr, axis=1)
        cand.append((obs[k], Tf)); cen.append(ce[k]); nrm.append(cr / np.maximum(2 * ar, 1e-12)[:, None]); area.append(ar)
    cen, nrm, area = np.vstack(cen), np.vstack(nrm), np.concatenate(area)
    if area.sum() < 0.003:
        return {"result": "nothing missing"}
    free = vis.count(cen + nrm * 0.01, nrm) >= a.min_views if vis is not None else np.zeros(len(cen), bool)
    contra = float(area[free].sum() / area.sum())
    if contra > a.max_contra:
        return {"result": "rejected: cameras saw that side empty (asymmetric)", "contradicted": round(contra, 2)}
    k = 0; added = 0
    for p, (sel, Tf) in zip(prims, cand):
        ok = ~free[k:k + len(sel)]; k += len(sel)
        sel, Tf = sel[ok], Tf[ok]
        if not len(sel):
            continue
        base = len(p["P"])
        p["P"] = np.vstack([p["P"], Tf.reshape(-1, 3)])
        if p["UV"] is not None:
            p["UV"] = np.vstack([p["UV"], p["UV"][p["F"][sel][:, [0, 2, 1]]].reshape(-1, 2)])
        p["F"] = np.vstack([p["F"], base + np.arange(3 * len(sel)).reshape(-1, 3)])
        p["src"] = np.r_[p["src"], np.ones(len(sel), np.int8)]; added += len(sel)
    return {"result": "applied", "triangles": added, "m2": round(float(area[~free].sum()), 3), "contradicted": round(contra, 2)}


# ------------------------------------------------------------------ 5 shape priors -> smooth implicit surface
def implicit_surface(O, lo3, vox, sigma):
    """Blur an occupancy volume and mesh its 0.5 level (marching cubes): a closed, smooth, rounded surface.
    Voxel (i,j,k) has its centre at lo3 + (ijk + 0.5) * vox."""
    from skimage.measure import marching_cubes
    G = ndimage.gaussian_filter(np.pad(O.astype(np.float32), 2), sigma)
    if G.max() < 0.5:
        return np.zeros((0, 3, 3)), np.zeros((0, 3))
    v, f, _, _ = marching_cubes(G, 0.5)
    v = lo3 + (v - 2 + 0.5) * vox
    T = v[f]
    cr = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]); n = cr / np.maximum(np.linalg.norm(cr, axis=1, keepdims=True), 1e-12)
    # outward = towards lower occupancy: check against the volume gradient at the centroids, flip if needed
    grad = np.stack(np.gradient(G), -1)
    idx = np.clip(np.rint((T.mean(1) - lo3) / vox - 0.5 + 2).astype(int), 0, np.array(G.shape) - 1)
    g = grad[idx[:, 0], idx[:, 1], idx[:, 2]]
    if (n * g).sum(1).mean() > 0:                       # normals point up the gradient (inward): flip all
        T = T[:, [0, 2, 1]]; n = -n
    return T, n


def resolve_tris(T, n, cover_tree, vis, a, zbot, stats, tag, extra_drop=None):
    """Keep predicted triangles that (1) have no real surface along their normal within +-a.reach (own scan or a
    neighbour's: no doubled / ghost surfaces), (2) were not seen empty by the cameras; then tidy up into coherent
    patches (majority vote, small pieces dropped). Returns kept triangles, normals, hidden flags."""
    if not len(T):
        return T, n, np.zeros(0, bool)
    cen = T.mean(1); area = tri_area(T)
    hid = (n[:, 2] < -0.8) & (cen[:, 2] < zbot + 0.04)               # the base on the floor: never seen
    cov = np.zeros(len(T), bool)
    if cover_tree is not None:
        for t in np.arange(-a.reach, a.reach + 1e-9, a.cover_r * 0.66):
            cov |= cover_tree.query(cen + n * t, distance_upper_bound=a.cover_r)[0] < np.inf
    if extra_drop is not None:
        cov |= extra_drop
    free = np.zeros(len(T), bool)
    test = np.flatnonzero(~cov & ~hid)
    if vis is not None and len(test):
        free[test] = vis.count(cen[test] + n[test] * 0.01, n[test]) >= a.min_views
    keep = majority(cen, n, ~cov & ~free, 0.06) & ~free & ~cov | (hid & ~cov)
    # drop small isolated predicted pieces
    k = np.flatnonzero(keep)
    if len(k):
        W = weld(T[k].reshape(-1, 3)).reshape(-1, 3)
        nW = W.max() + 1
        E = np.r_[W[:, [0, 1]], W[:, [1, 2]]]
        A = coo_matrix((np.ones(len(E)), (E[:, 0], E[:, 1])), shape=(nW, nW))
        from scipy.sparse.csgraph import connected_components
        _, lab = connected_components(A, directed=False)
        fl = lab[W[:, 0]]; ca = np.bincount(fl, area[k])
        keep[k[ca[fl] < a.min_patch]] = False
    st = stats.setdefault(tag, {"envelope_m2": 0.0, "scanned_m2": 0.0, "seen_empty_m2": 0.0, "predicted_m2": 0.0})
    st["envelope_m2"] += float(area[~hid].sum()); st["scanned_m2"] += float(area[cov & ~hid].sum())
    st["seen_empty_m2"] += float(area[free].sum()); st["predicted_m2"] += float(area[keep & ~hid].sum())
    return T[keep], n[keep], hid[keep]


def add_pred(pred, T, n, hid, tag, color=None):
    shade = 0.8 + 0.2 * n[:, 2]                         # unlit material: a little top-light so shapes read
    pred.add_tris(T[~hid], shade[~hid], tag, color=None if color is None else color)
    pred.add_tris(T[hid], shade[hid], "base", hidden=True)


def footprint(S, zbot, vox):
    lo, shape = grid_for(S[:, :2], vox, 4)
    H = topmap(S, lo, vox, shape)
    occ = H > zbot + 0.03
    mask = largest_parts(ndimage.binary_fill_holes(ndimage.binary_closing(occ, np.ones((3, 3), bool), iterations=2)))
    _, ind = ndimage.distance_transform_edt(~occ, return_indices=True)
    Hf = ndimage.median_filter(H[ind[0], ind[1]], size=5)
    Hf = np.maximum(ndimage.grey_opening(Hf, size=(7, 7)), zbot + 0.03)   # no walls up to stray spikes < ~15 cm wide
    return lo, shape, mask, Hf


def predict_solid(S, zbot, a, vis, cover_tree, pred, stats):
    vox = a.vox
    lo, shape, mask, Hf = footprint(S, zbot, vox)
    nz = int(np.ceil((Hf[mask].max() - zbot) / vox)) + 2
    zc = zbot + (np.arange(nz) + 0.5) * vox
    O = mask[:, :, None] & (zc[None, None, :] <= Hf[:, :, None])
    # space carving under overhangs: where the lowest real surface of a column is high (a table merged into the
    # piece, a raised bed frame), free space the cameras could see under it is cut away again
    carved = 0
    if vis is not None:
        low = np.full(shape, np.inf); np.minimum.at(low, cells_of(S[:, :2], lo, vox, shape), S[:, 2])
        st = 2                                              # carve on a 5 cm lattice
        I, J = np.nonzero(mask & (low > zbot + 0.2))
        keep = (I % st == 0) & (J % st == 0); I, J = I[keep], J[keep]
        if len(I):
            ks = np.arange(0, nz, st)
            II, KK = np.repeat(I, len(ks)), np.tile(ks, len(I)); JJ = np.repeat(J, len(ks))
            ok = zc[KK] < low[II, JJ] - 0.05
            II, JJ, KK = II[ok], JJ[ok], KK[ok]
            P = np.c_[lo[0] + (II + st / 2) * vox, lo[1] + (JJ + st / 2) * vox, zc[KK] + vox / 2]
            free = vis.count(P) >= a.min_views if len(P) else np.zeros(0, bool)
            for i, j, k in zip(II[free], JJ[free], KK[free]):
                O[i:i + st, j:j + st, k:k + st] = False
            carved = int(free.sum())
    T, n = implicit_surface(O, np.array([lo[0], lo[1], zbot]), vox, a.sigma)
    T, n, hid = resolve_tris(T, n, cover_tree, vis, a, zbot, stats, "solid")
    add_pred(pred, T, n, hid, "solid")
    return {"footprint_m2": round(float(mask.sum() * vox * vox), 2), "carved_voxels_5cm": carved}


def predict_legged(prims, S, Nr, Cc, zbot, kind, a, vis, cover_tree, pred, stats):
    info = {}
    up = (Nr[:, 2] > 0.8) & (S[:, 2] > zbot + 0.2)
    if up.sum() < 30:
        return {"result": "no top / seat surface found"}
    z = S[up, 2]
    hist, edges = np.histogram(z, np.arange(z.min(), z.max() + 0.04, 0.02))
    hist = np.convolve(hist, [1, 2, 1], "same")
    ht = 0.5 * (edges[np.argmax(hist)] + edges[np.argmax(hist) + 1])
    near_top = up & (np.abs(S[:, 2] - ht) < 0.04)
    ht = float(np.median(S[near_top, 2]))
    cell = a.vox
    lo, shape = grid_for(S[:, :2], cell)
    occ = np.zeros(shape, bool); occ[cells_of(S[near_top, :2], lo, cell, shape)] = True
    mask = largest_parts(ndimage.binary_fill_holes(ndimage.binary_closing(occ, np.ones((3, 3), bool), iterations=2)))
    if kind in TABLES and mask.sum() >= 4:                  # table tops are convex (rectangles, rounds, ovals)
        P = (np.argwhere(mask) + 0.5) * cell + lo
        try:
            hull = ConvexHull(P)
            G = (np.argwhere(np.ones(shape, bool)) + 0.5) * cell + lo
            mask = ((G @ hull.equations[:, :2].T + hull.equations[:, 2]) <= 0.25 * cell).all(1).reshape(shape)
        except Exception:
            pass
    inm = lambda XY: mask[cells_of(XY, lo, cell, shape)]
    down = (Nr[:, 2] < -0.8) & (S[:, 2] < ht - 0.01) & (S[:, 2] > ht - 0.12)
    down &= inm(S[:, :2])
    th = float(np.clip(ht - np.median(S[down, 2]), 0.015, 0.1)) if down.sum() > 20 else 0.035
    info.update(top_height_m=round(ht, 3), top_thickness_m=round(th, 3), top_m2=round(float(mask.sum() * cell * cell), 2))
    # only true holes get a top: a column with real surface near the top height (a sagging cushion, a lower shelf
    # edge, a mis-labelled sofa seat) keeps that surface instead of being covered by a flat plate
    band = np.abs(S[:, 2] - ht) < 0.25
    has = np.zeros(shape, bool); has[cells_of(S[band, :2], lo, cell, shape)] = True
    has = ndimage.binary_dilation(has)

    # ---- legs
    zl0, zl1 = zbot + 0.05, ht - th - 0.04
    legs, panels = [], 0
    if zl1 - zl0 > 0.08:
        L = (S[:, 2] > zl0) & (S[:, 2] < zl1)
        if L.sum():
            c2 = 0.02; lo2, sh2 = grid_for(S[:, :2], c2, 2)
            cnt = np.zeros(sh2, int); I, J = cells_of(S[L, :2], lo2, c2, sh2); np.add.at(cnt, (I, J), 1)
            lab, n = ndimage.label(ndimage.binary_dilation(cnt >= 2))
            li = lab[I, J]; Ls = np.flatnonzero(L)
            for comp in range(1, n + 1):
                m = Ls[li == comp]
                if len(m) < 8:
                    continue
                zs = np.ptp(S[m, 2]); ext = np.ptp(S[m, :2], 0)
                if zs < 0.4 * (zl1 - zl0):
                    continue
                if ext.max() <= 0.25:
                    cxy = S[m, :2].min(0) + ext / 2
                    legs.append({"xy": cxy, "half": np.maximum(ext / 2, 0.012), "color": Cc[m].mean(0), "seen": True})
                else:
                    panels += 1
    tc = (np.argwhere(mask) + 0.5).mean(0) * cell + lo if mask.any() else S[:, :2].mean(0)
    added, rejected = [], 0

    def try_leg(xy, half, color):
        nonlocal rejected
        for l in legs + added:
            if np.linalg.norm(l["xy"] - xy) < 0.12:
                return
        if not inm(xy[None])[0] and not ndimage.binary_dilation(mask)[cells_of(xy[None], lo, cell, shape)][0]:
            return
        pts = np.c_[np.repeat(xy[None], 6, 0), np.linspace(zl0, zl1, 6)]
        if vis is not None and (vis.count(pts) >= a.min_views).sum() >= 4:
            rejected += 1; return                         # cameras saw that spot under the top: no leg there
        added.append({"xy": xy, "half": half, "color": color, "seen": False})

    if zl1 - zl0 > 0.08 and not panels:
        if legs:
            for l in list(legs):
                for fx, fy in ((-1, 1), (1, -1), (-1, -1)):
                    try_leg(np.array([tc[0] + fx * (l["xy"][0] - tc[0]), tc[1] + fy * (l["xy"][1] - tc[1])]), l["half"], l["color"])
            info["legs_basis"] = "mirrored from the legs that were scanned"
        else:
            under = (S[:, 2] < ht - th) & (S[:, 2] > ht - th - 0.15)
            col = Cc[under].mean(0) * 0.85 if under.sum() > 10 else (Cc[near_top].mean(0) * 0.75)
            P = (np.argwhere(mask) + 0.5) * cell + lo
            r = np.linalg.norm(P - tc, axis=1).max() if len(P) else 0
            round_top = len(P) and mask.sum() * cell * cell / (math.pi * r * r + 1e-9) > 0.72 and kind in TABLES
            if round_top:
                try_leg(tc.copy(), np.array([0.06, 0.06]), col); info["legs_basis"] = "guessed: pedestal under a round top"
            elif len(P):
                pmin, pmax = P.min(0) - cell / 2, P.max(0) + cell / 2
                hw = 0.02 if kind in ("chair", "stool") else 0.025
                for fx in (0, 1):
                    for fy in (0, 1):
                        xy = np.array([pmin[0] + 0.05 + hw if fx == 0 else pmax[0] - 0.05 - hw,
                                       pmin[1] + 0.05 + hw if fy == 0 else pmax[1] - 0.05 - hw])
                        try_leg(xy, np.array([hw, hw]), col)
                info["legs_basis"] = "guessed: four corner legs"
            if rejected:                                    # cameras contradict the guess: the support is something else
                added.clear(); info["legs_basis"] = "guess dropped: cameras saw a guessed leg position empty"
    # one occupancy volume: the top slab + every leg (scanned ones too, so the joints are smooth; the cover test
    # removes whatever the scan already has) -> one smooth surface
    nz = int(np.ceil((ht - zbot) / cell)) + 2
    zc = zbot + (np.arange(nz) + 0.5) * cell
    O = mask[:, :, None] & (zc >= ht - th)[None, None, :] & (zc <= ht)[None, None, :]
    G = (np.argwhere(np.ones(shape, bool)) + 0.5) * cell + lo
    for l in legs + added:
        inleg = (np.abs(G - l["xy"]) <= l["half"] + 0.25 * cell).all(1).reshape(shape)
        O |= inleg[:, :, None] & (zc <= ht - th + cell)[None, None, :]
    T, n = implicit_surface(O, np.array([lo[0], lo[1], zbot]), cell, a.sigma * 0.8)
    if len(T):
        ce = T.mean(1)
        flat = np.abs(n[:, 2]) > 0.7
        drop = flat & has[cells_of(ce[:, :2], lo, cell, shape)] & (ce[:, 2] > ht - th - 0.02)
        T, n, hid = resolve_tris(T, n, cover_tree, vis, a, zbot, stats, "top + legs", extra_drop=drop)
        add_pred(pred, T, n, hid, "top + legs")
    info.update(legs_scanned=len(legs), legs_predicted=len(added), legs_rejected_seen_empty=rejected, support_panels=panels)

    # ---- webbing: fake surfaces the scanner stretched between the legs, under the top, away from every leg
    allL = legs + added
    if len(allL) >= 3 and not panels:
        inner = ndimage.binary_erosion(mask, iterations=2)
        dropped = 0
        for p in prims:
            if not len(p["F"]):
                continue
            T = p["P"][p["F"]]; ce = T.mean(1)
            cr = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0])
            nz = np.abs(cr[:, 2]) / np.maximum(np.linalg.norm(cr, axis=1), 1e-12)
            cand_ = (ce[:, 2] > zbot + 0.03) & (ce[:, 2] < ht - th - 0.05) & (nz < 0.6) & inner[cells_of(ce[:, :2], lo, cell, shape)]
            for l in allL:
                d = np.maximum(np.abs(ce[:, :2] - l["xy"]) - l["half"], 0)
                cand_ &= np.linalg.norm(d, axis=1) > 0.05
            p["F"], p["src"] = p["F"][~cand_], p["src"][~cand_]; dropped += int(cand_.sum())
        info["webbing_removed_tris"] = dropped
    return info


# ------------------------------------------------------------------ one object
def to_local(o, P):
    b = o["box"]; ang = math.radians(b["yaw_deg"]); c, s = math.cos(-ang), math.sin(-ang)
    d = P[:, :2] - np.array(b["centre"][:2])
    xy = np.c_[d[:, 0] * c - d[:, 1] * s, d[:, 0] * s + d[:, 1] * c]
    return np.c_[xy, P[:, 2] - o["floor_z"]] if P.shape[1] == 3 else xy


def refine_one(path, o, cams_w, walls_w, nbr_w, a):
    prims = read_glb(path)
    kind = (o.get("kind") or "").lower()
    rec = {"kind": kind or None}
    tall_thin = any(str(f).startswith("tall_thin") for f in o.get("flags") or [])
    pred = Pred(); stats = {}
    rec["cleanup"] = clean(prims, a)
    rec["cleanup"]["small_holes_filled"] = fill_small_holes(prims, a, pred)
    smooth(prims, a.smooth)
    S, Nr, Cc, src = sample(prims, a.spacing)
    if len(S) < 50:
        rec["prediction"] = "skipped: too little surface"
        return prims, pred, rec, S, Cc, Nr
    on_floor = o.get("on_floor", True) is not False
    zbot = 0.0 if on_floor else float(S[:, 2].min())
    obs_area = float(sum(tri_area(p["P"][p["F"]]).sum() for p in prims if len(p["F"])))
    if a.no_predict or tall_thin or kind not in SOLID | LEGGED | MIRROR_FRONT_BACK | {"small item", "decor"}:
        rec["prediction"] = "skipped: " + ("disabled" if a.no_predict else "tall/thin (door, curtain?)" if tall_thin else f"kind '{kind}'")
        rec["scanned_share"] = 1.0
        return prims, pred, rec, S, Cc, Nr
    cams = to_local(o, cams_w) if len(cams_w) else np.zeros((0, 3))
    cams = cams[np.linalg.norm(cams[:, :2], axis=1) < 9] if len(cams) else cams
    A = to_local(o, walls_w[:, 0, :2]) if len(walls_w) else np.zeros((0, 2))
    B = to_local(o, walls_w[:, 1, :2]) if len(walls_w) else np.zeros((0, 2))
    nbr = to_local(o, nbr_w) if len(nbr_w) else np.zeros((0, 3))     # neighbours' real surfaces (local frame)
    vis = Visibility(cams, A, B, np.vstack([S[src == 0], nbr]), nadir_deg=a.nadir) if len(cams) else None
    rec["cameras_used"] = int(len(cams)); rec["neighbour_points"] = int(len(nbr))
    tree = cKDTree(S)
    b = o["box"]; L_, W_ = b["size_lwh_m"][:2]
    blo = np.array([min(-L_ / 2, S[:, 0].min()) - 0.05, min(-W_ / 2, S[:, 1].min()) - 0.05, zbot - 0.02])
    bhi = np.array([max(L_ / 2, S[:, 0].max()) + 0.05, max(W_ / 2, S[:, 1].max()) + 0.05, S[:, 2].max() + 0.05])

    # 4 symmetry
    rec["symmetry"] = {}
    if a.mirror:                                            # off by default: scans are only roughly symmetric, so
                                                            # a mirrored copy lands beside the real surface (ghosts)
        for axis, name in ((0, "left/right"), (1, "front/back")):
            if axis == 1 and kind not in MIRROR_FRONT_BACK:
                continue
            sc, c, ov = best_plane(S, axis, a.cell)
            r = {"score": round(sc, 2), "plane": round(c, 3), "overlap": round(ov, 2)}
            if sc >= a.sym:
                r.update(mirror(prims, axis, c, tree, vis, blo, bhi, a))
                if r.get("result") == "applied":
                    S, Nr, Cc, src = sample(prims, a.spacing); tree = cKDTree(S)
            else:
                r["result"] = "not symmetric enough"
            rec["symmetry"][name] = r

    # 5 shape prior; the cover test sees this object's scan and every neighbour's
    cover_tree = cKDTree(np.vstack([S, nbr]))
    if kind in SOLID:
        rec["shape_prior"] = {"type": "solid"} | predict_solid(S, zbot, a, vis, cover_tree, pred, stats)
    elif kind in LEGGED:
        rec["shape_prior"] = {"type": "legged"} | predict_legged(prims, S, Nr, Cc, zbot, kind, a, vis, cover_tree, pred, stats)
        S, Nr, Cc, src = sample(prims, a.spacing)            # webbing may have been removed
    else:
        rec["shape_prior"] = {"type": "none (symmetry only)"}
    rec["envelope"] = {k: {kk: round(vv, 3) for kk, vv in v.items()} for k, v in stats.items()}

    mir_area = float(sum(tri_area(p["P"][p["F"][p["src"] == 1]]).sum() for p in prims if len(p["F"])))
    pa = pred.area(visible_only=True)
    tot = obs_area + mir_area + pa
    rec["scanned_m2"], rec["mirrored_m2"], rec["predicted_m2"] = round(obs_area, 3), round(mir_area, 3), round(pa, 3)
    rec["scanned_share"] = round(obs_area / tot, 3) if tot else 1.0
    share = 1 - rec["scanned_share"]
    rec["confidence"] = "high" if share < 0.15 else "medium" if share < 0.35 else "low"
    return prims, pred, rec, S, Cc, Nr


def write_refined(path, prims, pred, S, Cc, Ns=None):
    out = []
    for p in prims:
        if not len(p["F"]):
            continue
        used, Fl = np.unique(p["F"], return_inverse=True); Fl = Fl.reshape(-1, 3)
        d = {"P": p["P"][used].astype(np.float32), "F": Fl.astype(np.uint32),
             "UV": None if p["UV"] is None else p["UV"][used].astype(np.float32)}
        if p["jpeg"] is not None:
            d["image"] = p["jpeg"]
        else:
            d["color"] = p["color"]
        out.append(d)
    pp = pred.primitive(S, Cc, Ns)
    if pp is not None:
        out.append(pp)
    write_glb(path, out)


# ------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", default="zvKHR9DHNjJ")
    ap.add_argument("--ids", type=int, nargs="*")
    ap.add_argument("--cell", type=float, default=0.03, help="grid cell for the symmetry height map (m)")
    ap.add_argument("--vox", type=float, default=0.025, help="voxel size of the predicted (implicit) surface (m)")
    ap.add_argument("--sigma", type=float, default=1.2, help="blur of the occupancy volume in voxels (rounder edges)")
    ap.add_argument("--reach", type=float, default=0.10, help="a real surface this close along a predicted patch's normal covers it (m)")
    ap.add_argument("--cover-r", type=float, default=0.03, help="... within this radius of the normal line (m)")
    ap.add_argument("--min-patch", type=float, default=0.01, help="drop predicted pieces smaller than this (m2)")
    ap.add_argument("--spacing", type=float, default=0.015, help="surface sample spacing (m)")
    ap.add_argument("--gap", type=float, default=0.045, help="a spot farther than this from the scan counts as missing (m)")
    ap.add_argument("--min-views", type=int, default=2, help="scan positions that must see a spot empty to veto a prediction")
    ap.add_argument("--nadir", type=float, default=35, help="blind cone below each scan camera (tripod), degrees")
    ap.add_argument("--sym", type=float, default=0.8, help="min. top-view symmetry score to mirror")
    ap.add_argument("--max-contra", type=float, default=0.35, help="reject a mirror plane when cameras saw this share of the copy as empty")
    ap.add_argument("--smooth", type=int, default=2, help="Taubin smoothing iterations (0 = off)")
    ap.add_argument("--hole-perim", type=float, default=0.4, help="close boundary loops shorter than this (m)")
    ap.add_argument("--sliver-len", type=float, default=0.15, help="slivers: longest edge above this (m) ...")
    ap.add_argument("--sliver-ratio", type=float, default=12, help="... and this many times longer than the triangle is wide")
    ap.add_argument("--no-predict", action="store_true", help="cleanup only")
    ap.add_argument("--mirror", action="store_true", help="also copy the mirrored real surface into gaps (can ghost)")
    a = ap.parse_args()

    md = os.path.join(f"pano_{a.model}", "mesh_diff")
    st_p = os.path.join(md, "scene_tiles.json")
    if not os.path.exists(st_p):
        sys.exit("no scene_tiles.json - run segment_furniture.py / tile_objects.py first")
    scene = json.load(open(st_p))
    objs = {o["id"]: o for o in json.load(open(os.path.join(md, "objects.json")))["objects"]}
    walls = np.zeros((0, 2, 3))
    if os.path.exists(os.path.join(md, "plan.json")):
        W = [w for w in json.load(open(os.path.join(md, "plan.json")))["walls"] if w.get("physical", True)]
        walls = np.array([[[*w["a"][:2], 0], [*w["b"][:2], 0]] for w in W], float).reshape(-1, 2, 3)
    cams = []
    for fn, key in (("pano_poses.json", "panos"), ("panos.json", None)):
        pth = os.path.join(md, fn)
        if os.path.exists(pth):
            J = json.load(open(pth)); J = J[key] if key else J
            cams = [p["position"] for p in J if p.get("position")]
            if cams:
                break
    cams = np.array(cams, float).reshape(-1, 3)
    print(f"{len(scene['objects'])} objects | {len(cams)} scan positions | {len(walls)} plan walls", flush=True)

    # every piece's real surface in world coordinates: predictions must not cover or double a neighbour
    def to_world(o, P):
        b = o["box"]; ang = math.radians(b["yaw_deg"]); c, s_ = math.cos(ang), math.sin(ang)
        return np.c_[P[:, 0] * c - P[:, 1] * s_ + b["centre"][0], P[:, 0] * s_ + P[:, 1] * c + b["centre"][1], P[:, 2] + o["floor_z"]]
    Wp, Wo = [], []
    for r in scene["objects"]:
        o = objs.get(r["id"])
        if r.get("file") and o is not None and os.path.exists(os.path.join(md, r["file"])):
            Sw = sample(read_glb(os.path.join(md, r["file"])), 0.03)[0]
            if len(Sw):
                Wp.append(to_world(o, Sw)); Wo.append(np.full(len(Sw), r["id"]))
    Wp = np.vstack(Wp) if Wp else np.zeros((0, 3)); Wo = np.concatenate(Wo) if Wo else np.zeros(0, int)

    od = os.path.join(md, "objects_refined"); os.makedirs(od, exist_ok=True)
    out_p = os.path.join(md, "scene_refined.json")
    prev = {r["id"]: r for r in json.load(open(out_p))["objects"]} if a.ids and os.path.exists(out_p) else {}
    out = []
    t_all = time.time()
    for r in scene["objects"]:
        o = objs.get(r["id"])
        if (a.ids and r["id"] not in a.ids) or not r.get("file") or o is None:
            out.append(prev.get(r["id"], dict(r))); continue
        t = time.time()
        try:
            own = Wp[Wo == r["id"]]
            if len(own):
                lo_, hi_ = own.min(0) - 0.3, own.max(0) + 0.3
                nb = (Wo != r["id"]) & np.all((Wp >= lo_) & (Wp <= hi_), 1)
            else:
                nb = np.zeros(len(Wp), bool)
            prims, pred, info, S, Cc, Nr = refine_one(os.path.join(md, r["file"]), o, cams, walls, Wp[nb], a)
            fn = "objects_refined/" + os.path.basename(r["file"])
            write_refined(os.path.join(md, fn), prims, pred, S, Cc, Nr)
        except Exception as e:                              # keep the unrefined model rather than stop the run
            import traceback; traceback.print_exc()
            print(f"  obj {r['id']:3d} refine failed ({e}); keeping {r['file']}"); out.append(dict(r)); continue
        nr = dict(r); nr.update(file=fn, original_file=r["file"], refine=info,
                                scanned_share=info.get("scanned_share"), confidence=info.get("confidence"))
        out.append(nr)
        sym = ",".join(k for k, v in (info.get("symmetry") or {}).items() if v.get("result") == "applied") or "-"
        sp = info.get("shape_prior") or {}
        legs = f" legs {sp.get('legs_scanned', 0)}+{sp.get('legs_predicted', 0)}" if sp.get("type") == "legged" else ""
        print(f"  obj {r['id']:3d} {str(r.get('label') or ''):16s} {info.get('kind') or '?':12s} "
              f"scanned {100 * (info.get('scanned_share') or 1):5.1f}%  mirror {sym:22s} "
              f"{sp.get('type', '-'):8s}{legs}  [{info.get('confidence', '-')}]  {time.time() - t:.1f}s", flush=True)
    json.dump({"frame": scene.get("frame"), "method": "refine_objects.py: cleanup + symmetry + shape priors, "
               "each prediction vetoed where >= %d scan positions saw the spot empty" % a.min_views,
               "objects": out}, open(out_p, "w"), indent=1)
    print(f"refined {sum(1 for x in out if x.get('refine'))} objects in {time.time() - t_all:.0f}s -> {out_p}")


if __name__ == "__main__":
    main()
