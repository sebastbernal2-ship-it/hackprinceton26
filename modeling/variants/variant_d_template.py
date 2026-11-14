#!/usr/bin/env python3
r"""
variant_d_template.py - method D: parametric furniture templates fitted to the scan, closed by construction,
textured from the scan and snapped onto the scan where the scan is good.

Per object (local frame of the GLB: box centre x,y, floor z, x = length):
  1. scan samples (points + normals + texture colours), floaters removed (3D connected components)
  2. a template by kind, fitted to the scan:
       seat   (sofa, armchair, bed)      footprint outline from the scan; seat / mattress level from the height
                                         histogram (flat cushions); back, arms, headboard = cells rising above it
                                         (their own smoothed heights); soft rounded edges
       case   (cabinet, wardrobe, dresser, nightstand, wall unit, shelf)
                                         stacked rectangles: per height slice the 4 faces from the scan (normals
                                         facing that side) -> plinth inset, top overhang, mouldings, hutches
       legged (table, coffee/side table, desk, stool)
                                         top slab (top level, outline: rectangle / ellipse / free outline), apron
                                         block, legs (scanned clusters, missing corners mirrored, or a pedestal)
       chair                             seat slab, back panel on the side where the scan rises, arms, legs
       shell  (lamp, decor, small item, and every template that does not fit)
                                         the scanned surface itself thickened into a solid (closed shell)
     All parts are unioned in ONE signed-distance volume (per-part edge rounding) and meshed with marching cubes
     -> a single closed, consistently outward surface: no tears, no open sides, no doubled layers.
  3. fit score: share of scan samples within 4 cm of the template and share of template top surfaces within 6 cm of
     the scan; a template that scores poorly is replaced by the shell model (e.g. a piano labelled 'wardrobe').
  4. snap (hybrid): template vertices move along their normal onto the scanned surface where the scan is close and
     faces the same way (smoothed offset field, capped) -> real cushion bulges, mouldings, etc. Topology unchanged.
  5. colour: dense vertex colours from the nearest scanned texels facing the same way; unseen areas get the colour
     of the same part, diffused smoothly from the seen neighbourhood.

Outputs  pano_<model>/mesh_diff/objects_variant_d/*.glb, pano_<model>/mesh_diff/scene_variant_d.json

    python modeling/variants\variant_d_template.py
    python modeling/variants\variant_d_template.py --ids 0 8 44
"""
import argparse, json, math, os, sys, time
import numpy as np
from scipy import ndimage
from scipy.sparse import coo_matrix, diags
from scipy.spatial import cKDTree
from skimage.measure import marching_cubes

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from refine_objects import read_glb, sample, srgb_to_linear  # noqa: E402
from tile_objects import write_glb  # noqa: E402

SEAT = {"sofa", "armchair", "bed"}
CASE = {"cabinet", "wardrobe", "dresser", "nightstand", "wall unit", "shelf"}
LEGGED = {"table", "coffee table", "side table", "desk", "stool"}
CHAIR = {"chair"}
# a template is kept when: share of scan samples within 4 cm (s1) and of template tops within 6 cm of the scan (s2) are
# high enough, and not too much scan lies > 5 cm outside it (missed parts) or > 6 cm inside it (template overfills)
FIT_LIMITS = {"seat": {"s1": 0.4, "s2": 0.7, "out": 0.25, "in": 0.45},
              "case": {"s1": 0.1, "s2": 0.0, "out": 0.4, "in": 0.5},
              "legged": {"s1": 0.3, "s2": 0.6, "out": 0.35, "in": 0.3},
              "chair": {"s1": 0.2, "s2": 0.6, "out": 0.65, "in": 0.3}}


# ================================================================== scan
def load_scan(path, spacing=0.008):
    prims = read_glb(path)
    S, N, C, _ = sample(prims, spacing, cap=400_000)
    return prims, S, N, C


def drop_floaters(S, vox=0.03, keep=0.04):
    if len(S) < 50:
        return np.ones(len(S), bool)
    I = np.floor((S - S.min(0)) / vox).astype(int)
    shp = I.max(0) + 1
    g = np.zeros(shp, bool); g[I[:, 0], I[:, 1], I[:, 2]] = True
    lab, n = ndimage.label(ndimage.binary_dilation(g), structure=np.ones((3, 3, 3)))
    pl = lab[I[:, 0], I[:, 1], I[:, 2]]
    cnt = np.bincount(pl, minlength=n + 1); cnt[0] = 0
    return cnt[pl] >= keep * cnt.max()


# ================================================================== volume
class Vol:
    def __init__(self, lo, hi, v):
        self.v = v; self.lo = np.asarray(lo, float)
        self.shape = tuple(np.maximum(np.ceil((np.asarray(hi) - self.lo) / v).astype(int), 4))
        self.c = [self.lo[a] + (np.arange(self.shape[a]) + 0.5) * v for a in range(3)]
        self.groups = {}                                    # sigma (m) -> occupancy
        self.lab = np.zeros(self.shape, np.int16)
        self.parts = []

    def rng(self, a, x0, x1):
        c = self.c[a]
        return slice(int(np.searchsorted(c, x0)), int(np.searchsorted(c, x1)))

    def occ(self, sigma):
        if sigma not in self.groups:
            self.groups[sigma] = np.zeros(self.shape, bool)
        return self.groups[sigma]

    def add_mask(self, m, name, sigma):
        if not m.any():
            return
        self.parts.append(name); pid = len(self.parts)
        self.occ(sigma)[m] = True; self.lab[m] = pid

    def add_box(self, x0, x1, y0, y1, z0, z1, name, sigma):
        m = np.zeros(self.shape, bool)
        m[self.rng(0, x0, x1), self.rng(1, y0, y1), self.rng(2, z0, z1)] = True
        self.add_mask(m, name, sigma)

    def add_columns(self, mask2, zbot, ztop, name, sigma):
        """mask2 (nx,ny) bool; zbot/ztop scalars or (nx,ny) arrays."""
        z = self.c[2][None, None, :]
        zb = np.broadcast_to(np.asarray(zbot, float), mask2.shape)[..., None]
        zt = np.broadcast_to(np.asarray(ztop, float), mask2.shape)[..., None]
        self.add_mask(mask2[..., None] & (z > zb) & (z < zt), name, sigma)

    def add_ellipse(self, cx, cy, rx, ry, z0, z1, name, sigma):
        X, Y = np.meshgrid(self.c[0], self.c[1], indexing="ij")
        self.add_columns(((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2 <= 1, z0, z1, name, sigma)

    def sd_at(self, P):
        if getattr(self, "F", None) is None:
            return np.full(len(P), np.inf)
        I = ((P - self.lo) / self.v - 0.5).T
        return ndimage.map_coordinates(self.F, I, order=1, mode="nearest")

    def sdf(self):
        F = None
        for sig, occ in self.groups.items():
            if not occ.any():
                continue
            d = np.where(occ, -(ndimage.distance_transform_edt(occ) - 0.5), ndimage.distance_transform_edt(~occ) - 0.5) * self.v
            s = max(sig / self.v, 0.6)
            d = ndimage.gaussian_filter(d, s)
            F = d if F is None else np.minimum(F, d)
        return F

    def mesh(self):
        F = self.sdf()
        self.F = F
        if F is None or F.min() >= 0:
            return None
        F[[0, -1]] = np.maximum(F[[0, -1]], self.v); F[:, [0, -1]] = np.maximum(F[:, [0, -1]], self.v)
        F[:, :, [0, -1]] = np.maximum(F[:, :, [0, -1]], self.v)
        V, Fc, _, _ = marching_cubes(F.astype(np.float32), 0.0, spacing=(self.v,) * 3)
        V = V + self.lo + 0.5 * self.v
        Fc = Fc.astype(np.int64)
        T = V[Fc]
        vol = np.einsum("ij,ij->i", T[:, 0], np.cross(T[:, 1], T[:, 2])).sum()
        if vol < 0:
            Fc = Fc[:, ::-1]
        # part label per vertex (nearest occupied voxel's label)
        idx = np.clip(np.floor((V - self.lo) / self.v).astype(int), 0, np.array(self.shape) - 1)
        lab = self.lab
        if (lab > 0).any():
            _, ind = ndimage.distance_transform_edt(lab == 0, return_indices=True)
            lab = lab[tuple(ind)]
        return V, Fc, lab[idx[:, 0], idx[:, 1], idx[:, 2]]


# ================================================================== 2D helpers
def disk(r):
    r = max(int(round(r)), 1); y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return x * x + y * y <= r * r


def cells(vol, P):
    i = np.clip(np.floor((P[:, 0] - vol.lo[0]) / vol.v).astype(int), 0, vol.shape[0] - 1)
    j = np.clip(np.floor((P[:, 1] - vol.lo[1]) / vol.v).astype(int), 0, vol.shape[1] - 1)
    return i, j


def count_map(vol, P):
    m = np.zeros(vol.shape[:2]); i, j = cells(vol, P); np.add.at(m, (i, j), 1); return m


def max_map(vol, P, q=None):
    m = np.full(vol.shape[:2], -np.inf); i, j = cells(vol, P); np.maximum.at(m, (i, j), P[:, 2]); return m


def clean_mask(m, close=3, open_=1, keep=0.15):
    m = ndimage.binary_closing(m, disk(close), border_value=0)
    m = ndimage.binary_fill_holes(m)
    if open_:
        m = ndimage.binary_opening(m, disk(open_))
    lab, n = ndimage.label(m)
    if n == 0:
        return m
    cnt = np.bincount(lab.ravel()); cnt[0] = 0
    return np.isin(lab, np.flatnonzero(cnt >= keep * cnt.max()))


def fill_nearest(H, valid):
    if not valid.any():
        return np.zeros_like(H)
    _, ind = ndimage.distance_transform_edt(~valid, return_indices=True)
    return H[tuple(ind)]


def regular_outline(vol, m):
    """rectangle / ellipse when the outline is close to one, else the outline itself."""
    if not m.any():
        return m, "none"
    ii, jj = np.nonzero(m)
    i0, i1, j0, j1 = ii.min(), ii.max(), jj.min(), jj.max()
    box = np.zeros_like(m); box[i0:i1 + 1, j0:j1 + 1] = True
    a = m.sum() / box.sum()
    X, Y = np.meshgrid(np.arange(m.shape[0]), np.arange(m.shape[1]), indexing="ij")
    cx, cy, rx, ry = (i0 + i1) / 2, (j0 + j1) / 2, (i1 - i0 + 1) / 2, (j1 - j0 + 1) / 2
    ell = ((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2 <= 1
    iou_e = (ell & m).sum() / max((ell | m).sum(), 1)
    if a > 0.88:
        return box, "rectangle"
    if iou_e > 0.9:
        return ell, "ellipse"
    from scipy.spatial import ConvexHull
    try:
        sol = m.sum() / max(ConvexHull(np.c_[ii, jj]).volume + 0.5 * (len(ii) ** 0.5) * 4, 1)
    except Exception:
        sol = 1.0
    return m, ("outline" if sol > 0.75 else "partial outline")


# ================================================================== templates
def tpl_seat(vol, S, N, kind, z0):
    up = S[:, 2] > z0 + 0.05
    cnt = count_map(vol, S[up])
    foot = clean_mask(cnt > 0, close=3, open_=2)
    H = max_map(vol, S[up])
    Hs = ndimage.median_filter(np.where(np.isfinite(H), H, np.nan), size=5)
    valid = np.isfinite(Hs) & foot
    if valid.sum() < 20:
        return None
    Hf = fill_nearest(np.nan_to_num(Hs, nan=0.0), valid)
    Hf = ndimage.median_filter(Hf, size=5)
    lo_, hi_ = (0.3, 0.85) if kind == "bed" else (0.25, 0.7)
    hv = Hf[foot]
    b = np.arange(lo_, hi_, 0.02)
    hist, _ = np.histogram(hv, b)
    if hist.max() < 0.08 * foot.sum():
        return None
    seat = b[np.argmax(hist)] + 0.01
    sel = np.abs(hv - seat) < 0.06
    seat = float(np.median(hv[sel]))
    level = np.where(np.abs(Hf - seat) < 0.09, seat, Hf)
    high = foot & (level > seat + 0.09)
    low = foot & (level < seat - 0.09)
    flat = foot & ~high & ~low
    soft = 0.03 if kind != "bed" else 0.025
    vol.add_columns(flat, z0, seat, "seat" if kind != "bed" else "mattress", soft)
    if high.any():
        lab, n = ndimage.label(high)
        for k in range(1, n + 1):
            m = lab == k
            if m.sum() < 6:
                continue
            hh = ndimage.median_filter(np.where(m, level, 0), size=7)
            hh = np.where(m, np.maximum(hh, seat + 0.05), 0)
            vol.add_columns(m, z0, hh, "back/arm" if kind != "bed" else "headboard", soft)
    if low.any():
        m = low & (level > z0 + 0.06)
        vol.add_columns(m, z0, level, "base", 0.02)
    return {"seat_z": round(seat, 3), "high_cells": int(high.sum()), "foot_cells": int(foot.sum())}


def tpl_case(vol, S, N, z0, dz=0.03):
    """carcass box (+ plinth inset, + top overhang / cap, + a set-back upper body such as a hutch)."""
    glob = np.r_[np.percentile(S[:, 0], [0.7, 99.3]), np.percentile(S[:, 1], [0.7, 99.3])][[0, 1, 2, 3]]
    ztop = float(np.percentile(S[:, 2], 99.6))
    zs = np.arange(z0, ztop - 1e-6, dz)
    if len(zs) < 4:
        return None
    side = np.full((len(zs), 4), np.nan)                   # -x +x -y +y outer faces per slice
    for k, z in enumerate(zs):
        m = (S[:, 2] >= z) & (S[:, 2] < z + dz)
        for s_, (ax, sg) in enumerate(((0, -1), (0, 1), (1, -1), (1, 1))):
            mm = m & (N[:, ax] * sg > 0.6)
            if mm.sum() >= 6:
                side[k, s_] = np.percentile(S[mm, ax], 97 if sg > 0 else 3)
    sgn = np.array([-1, 1, -1, 1])
    body_rng = (zs > z0 + 0.15) & (zs < ztop - 0.08)
    carc = glob.copy()
    for s_ in range(4):
        col = side[body_rng, s_]
        if np.isfinite(col).sum() >= 3:
            carc[s_] = np.nanpercentile(col, 50 + 25 * sgn[s_])     # outer quartile of the observed face
    carc = np.where(sgn > 0, np.minimum(carc, glob), np.maximum(carc, glob))
    if carc[1] - carc[0] < 0.05 or carc[3] - carc[2] < 0.05:
        return None
    rec = {"top_z": round(ztop, 3)}
    # set-back upper body (hutch / mirror / piano top): 2-segment split of the depth faces
    best = None
    for k in range(4, len(zs) - 3):
        lo_v, hi_v = np.nanmedian(side[:k], 0), np.nanmedian(side[k:], 0)
        d = (lo_v - hi_v) * sgn                              # > 0: upper part set back
        if np.isfinite(d).any() and np.nanmax(d) > 0.08 and np.isfinite(side[k:]).sum() >= 8:
            sc = np.nanmax(d)
            if best is None or sc > best[0] + 0.02:
                best = (sc, k, hi_v)
    zsplit = ztop
    if best is not None:
        k, hi_v = best[1], best[2]
        up = carc.copy()
        for s_ in range(4):
            if np.isfinite(hi_v[s_]) and (carc[s_] - hi_v[s_]) * sgn[s_] > 0.08:
                up[s_] = hi_v[s_]
        if up[1] - up[0] > 0.04 and up[3] - up[2] > 0.04:
            zsplit = float(zs[k])
            vol.add_box(up[0], up[1], up[2], up[3], zsplit - 0.02, ztop, "upper body", 0.008)
            rec["upper_body_from_z"] = round(zsplit, 3)
    # plinth: the lowest slices set back on a face
    pl = carc.copy(); hp = 0.0
    low = zs < z0 + 0.16
    for s_ in range(4):
        col = side[low, s_]
        if np.isfinite(col).sum() >= 2:
            inset = (carc[s_] - np.nanmedian(col)) * sgn[s_]
            if 0.012 < inset < 0.12:
                pl[s_] = carc[s_] - sgn[s_] * inset; hp = 0.08
    for s_ in range(4):
        col = side[:, s_]
        ok = np.isfinite(col) & ((carc[s_] - col) * sgn[s_] > 0.012)
        if pl[s_] != carc[s_]:
            run = 0
            while run < len(zs) and (ok[run] or not np.isfinite(col[run])) and zs[run] < z0 + 0.2:
                run += 1
            hp = max(hp, min(zs[run - 1] + dz, 0.2) - z0 if run else hp)
    # top overhang
    cap = carc.copy(); hc = 0.0
    topm = zs > min(zsplit, ztop) - 0.07
    if best is None:
        for s_ in range(4):
            col = side[topm, s_]
            if np.isfinite(col).sum() >= 1:
                ov = (np.nanmax(col * sgn[s_]) - carc[s_] * sgn[s_])
                if 0.012 < ov < 0.08:
                    cap[s_] = carc[s_] + sgn[s_] * ov; hc = 0.035
    zb = z0 + hp if hp else z0
    if hp:
        vol.add_box(pl[0], pl[1], pl[2], pl[3], z0, zb + 0.01, "plinth", 0.006)
        rec["plinth_h"] = round(hp, 3)
    zc = zsplit if best is not None else ztop
    vol.add_box(carc[0], carc[1], carc[2], carc[3], zb, zc - hc, "carcass", 0.008)
    if hc:
        vol.add_box(cap[0], cap[1], cap[2], cap[3], zc - hc - 0.005, zc, "top", 0.006)
        rec["top_overhang"] = True
    rec["carcass_lwh"] = [round(carc[1] - carc[0], 3), round(carc[3] - carc[2], 3), round(zc - zb, 3)]
    return rec


def top_level(S, N, zmin=0.15, zmax=None):
    upm = (N[:, 2] > 0.8) & (S[:, 2] > zmin)
    if zmax is not None:
        upm &= S[:, 2] < zmax
    if upm.sum() < 20:
        return None
    z = S[upm, 2]
    b = np.arange(z.min(), z.max() + 0.02, 0.01)
    h, _ = np.histogram(z, b)
    k = int(np.argmax(h))
    zz = z[np.abs(z - b[k] - 0.005) < 0.02]
    return float(np.percentile(zz, 80))


def find_legs(vol, S, zlo, zhi, outline):
    band = (S[:, 2] > zlo) & (S[:, 2] < zhi)
    if band.sum() < 10 or zhi - zlo < 0.06:
        return [], 0.0
    cm = count_map(vol, S[band]) >= 2
    cm = ndimage.binary_closing(cm, disk(1))
    lab, n = ndimage.label(cm)
    legs = []
    area_band = ndimage.binary_fill_holes(ndimage.binary_closing(cm, disk(3))).sum()
    for k in range(1, n + 1):
        ii, jj = np.nonzero(lab == k)
        ex, ey = (np.ptp(ii) + 1) * vol.v, (np.ptp(jj) + 1) * vol.v
        if ex > 0.16 or ey > 0.16:
            continue
        sel = band.copy(); ci, cj = cells(vol, S[band]); inside = lab[ci, cj] == k
        zz = S[band][inside, 2]
        if len(zz) < 8 or np.ptp(zz) < 0.35 * (zhi - zlo):
            continue
        legs.append((vol.c[0][ii].mean(), vol.c[1][jj].mean(), float(np.clip(ex, 0.035, 0.1)), float(np.clip(ey, 0.035, 0.1))))
    return legs, area_band / max(outline.sum(), 1)


def corner_legs(legs, x0, x1, y0, y1):
    """complete a 4-leg layout from the legs that were scanned (mirror across the centre lines)."""
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    near = [l for l in legs if abs(abs(l[0] - cx) - (x1 - x0) / 2) < 0.25 * (x1 - x0) + 0.05
            and abs(abs(l[1] - cy) - (y1 - y0) / 2) < 0.25 * (y1 - y0) + 0.05]
    if near:
        dx = float(np.median([abs(l[0] - cx) for l in near])); dy = float(np.median([abs(l[1] - cy) for l in near]))
        sx = float(np.median([l[2] for l in near])); sy = float(np.median([l[3] for l in near]))
    else:
        sx = sy = 0.045; dx = (x1 - x0) / 2 - 0.05; dy = (y1 - y0) / 2 - 0.05
    return [(cx + a * dx, cy + b * dy, sx, sy) for a in (-1, 1) for b in (-1, 1)], len(near)


def tpl_legged(vol, S, N, kind, z0):
    zt = top_level(S, N, zmin=z0 + 0.12)
    if zt is None:
        return None
    near = np.abs(S[:, 2] - zt) < 0.04
    outline = clean_mask(count_map(vol, S[near]) > 0, close=3, open_=1)
    if outline.sum() < 10:
        return None
    outline, shape = regular_outline(vol, outline)
    if shape == "partial outline":                          # crescent / fragment: the top was only partly scanned
        return None
    ii, jj = np.nonzero(outline)
    x0, x1 = vol.c[0][ii].min(), vol.c[0][ii].max(); y0, y1 = vol.c[1][jj].min(), vol.c[1][jj].max()
    # edge band below the top: apron / drawer box depth
    oi, oj = cells(vol, S)
    ring = ndimage.binary_dilation(outline, disk(2)) & ~ndimage.binary_erosion(outline, disk(3))
    eb = ring[oi, oj] & (np.abs(N[:, 2]) < 0.5) & (S[:, 2] < zt) & (S[:, 2] > zt - 0.3)
    t_edge = float(np.clip(zt - np.percentile(S[eb, 2], 15), 0.025, 0.25)) if eb.sum() > 15 else 0.04
    t_top = min(t_edge, 0.045)
    rec = {"top_z": round(zt, 3), "outline": shape, "edge_depth": round(t_edge, 3)}
    vol.add_columns(outline, zt - t_top, zt, "top", 0.01)
    under = zt - t_edge
    legs, band_share = find_legs(vol, S, z0 + 0.03, under - 0.03, outline)
    ring_low = float(np.percentile(S[eb, 2], 5)) if eb.sum() > 15 else zt
    if (band_share > 0.45 or ring_low < z0 + 0.12) and under > z0 + 0.06 and t_edge > 0.2:   # sides down to the floor: pouf, chest
        foot = ndimage.binary_erosion(outline, disk(1)) if outline.sum() > 40 else outline
        vol.add_columns(foot, z0, zt - t_top + 0.005, "body", 0.02)
        rec["base"] = "solid"
        return rec
    if t_edge > t_top + 0.01:
        inset = ndimage.binary_erosion(outline, disk(max(1, round(0.025 / vol.v))))
        vol.add_columns(inset, under, zt - t_top + 0.005, "apron", 0.006)
    if under <= z0 + 0.04:
        return rec
    if len(legs) >= 4:
        use, rec["legs"] = legs[:8], f"{len(legs)} scanned"
    elif len(legs) == 1 and legs[0][2] > 0.08 and abs(legs[0][0] - (x0 + x1) / 2) < 0.15 * (x1 - x0) + 0.03:
        l = legs[0]; use = [(l[0], l[1], max(l[2], 0.12), max(l[3], 0.12))]; rec["legs"] = "pedestal"
    else:
        use, k = corner_legs(legs, x0, x1, y0, y1); rec["legs"] = f"{k} scanned + {4 - min(k, 4)} mirrored/placed"
        use = inside_legs(vol, use, outline)
    for n, (x, y, sx, sy) in enumerate(use):
        vol.add_box(x - sx / 2, x + sx / 2, y - sy / 2, y + sy / 2, z0, under + 0.01, f"leg{n}", 0.004)
    return rec


def inside_legs(vol, legs, outline):
    """pull legs into the outline (round / free-form tops) so none stands outside the top."""
    ii, jj = np.nonzero(outline)
    cx, cy = vol.c[0][ii].mean(), vol.c[1][jj].mean()
    out = []
    for x, y, sx, sy in legs:
        for t in np.linspace(0, 1, 21):
            px, py = x + (cx - x) * t, y + (cy - y) * t
            i0, j0 = cells(vol, np.array([[px - sx / 2, py - sy / 2, 0], [px + sx / 2, py + sy / 2, 0]]))
            if outline[i0[0]:i0[1] + 1, j0[0]:j0[1] + 1].all():
                break
        out.append((px, py, sx, sy))
    return out


def tpl_chair(vol, S, N, z0):
    """seat slab + legs; back posts (rear legs carried up), back panel, top rail; arms with front posts."""
    zs = top_level(S, N, zmin=z0 + 0.25, zmax=z0 + 0.7)
    if zs is None:
        return None
    near = np.abs(S[:, 2] - zs) < 0.04
    seat = clean_mask(count_map(vol, S[near]) > 0, close=3, open_=1)
    if seat.sum() < 10:
        return None
    seat, shape = regular_outline(vol, seat)
    if shape == "partial outline":
        return None
    ii, jj = np.nonzero(seat)
    x0, x1 = vol.c[0][ii].min(), vol.c[0][ii].max(); y0, y1 = vol.c[1][jj].min(), vol.c[1][jj].max()
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    ext = (x0, x1, y0, y1)
    rec = {"seat_z": round(zs, 3), "seat_outline": shape}
    t_seat = 0.045
    vol.add_columns(seat, zs - t_seat, zs, "seat", 0.012)
    under = zs - t_seat
    legs, band_share = find_legs(vol, S, z0 + 0.03, under - 0.04, seat)
    use, k = (legs, len(legs)) if len(legs) >= 4 else corner_legs(legs, x0, x1, y0, y1)
    if len(use) > 4:                                        # a chair has 4 legs: the ones nearest the seat corners
        cs = [(x, y) for x in (x0, x1) for y in (y0, y1)]
        use = [min(use, key=lambda l: (l[0] - c[0]) ** 2 + (l[1] - c[1]) ** 2) for c in cs]
    use = inside_legs(vol, use, seat)
    rec["legs"] = f"{min(k, 4)} scanned"
    hi = S[:, 2] > zs + 0.15
    back = None
    if hi.sum() > 30:
        P = S[hi]
        frac = [np.mean(P[:, 0] < cx - 0.25 * (x1 - x0)), np.mean(P[:, 0] > cx + 0.25 * (x1 - x0)),
                np.mean(P[:, 1] < cy - 0.25 * (y1 - y0)), np.mean(P[:, 1] > cy + 0.25 * (y1 - y0))]
        s_ = int(np.argmax(frac)); ax = 0 if s_ < 2 else 1; sg = -1 if s_ % 2 == 0 else 1
        if frac[s_] > 0.4:
            q = P[(P[:, ax] - (cx, cy)[ax]) * sg > 0.2 * (ext[2 * ax + 1] - ext[2 * ax])]
            zb = float(np.percentile(q[:, 2], 98)) if len(q) > 20 else None
            if zb is not None and zb > zs + 0.2:
                back = (ax, sg, zb)
    if back is not None:
        ax, sg, zb = back; oax = 1 - ax
        edge = ext[2 * ax + (sg > 0)]
        th = 0.035
        p0, p1 = (edge, edge + th) if sg < 0 else (edge - th, edge)
        o0, o1 = ext[2 * oax], ext[2 * oax + 1]
        post = float(np.median([l[2 + oax] for l in use])) if use else 0.045
        post = float(np.clip(post, 0.035, 0.07))

        def box(a0, a1, b0, b1, z_0, z_1, name, sig):            # a along ax, b along the other axis
            if ax == 0:
                vol.add_box(a0, a1, b0, b1, z_0, z_1, name, sig)
            else:
                vol.add_box(b0, b1, a0, a1, z_0, z_1, name, sig)
        pa0, pa1 = (edge, edge + post) if sg < 0 else (edge - post, edge)
        box(pa0, pa1, o0, o0 + post, z0, zb, "back post", 0.005)
        box(pa0, pa1, o1 - post, o1, z0, zb, "back post", 0.005)
        box(p0, p1, o0 + post * 0.5, o1 - post * 0.5, zs + 0.08, zb - 0.01, "back panel", 0.01)
        box(pa0, pa1, o0, o1, zb - 0.06, zb, "top rail", 0.01)
        rec["back"] = {"side": "-+"[sg > 0] + "xy"[ax], "top_z": round(zb, 3)}
        # front legs only (rear legs are the back posts)
        use = [l for l in use if (l[ax] - (cx, cy)[ax]) * sg < 0] or use
        for sg2, e in ((-1, ext[2 * oax]), (1, ext[2 * oax + 1])):
            am = (S[:, 2] > zs + 0.12) & (S[:, 2] < zb - 0.05) & ((S[:, oax] - e) * sg2 > -0.08) & ((S[:, oax] - e) * sg2 < 0.06)
            if am.sum() > 40:
                za = float(np.percentile(S[am, 2], 90))
                a0, a1 = np.percentile(S[am, ax], [3, 97])
                if a1 - a0 > 0.4 * (ext[2 * ax + 1] - ext[2 * ax]) and za > zs + 0.12:
                    lo_o, hi_o = (e, e + 0.05) if sg2 < 0 else (e - 0.05, e)
                    front = ext[2 * ax] if sg > 0 else ext[2 * ax + 1]
                    box(min(a0, a1), max(a0, a1), lo_o, hi_o, za - 0.04, za, "arm", 0.01)
                    fa0, fa1 = (front, front + 0.04) if sg > 0 else (front - 0.04, front)
                    box(fa0, fa1, lo_o + 0.005, hi_o - 0.005, zs - 0.01, za, "arm post", 0.006)
                    rec["arms"] = rec.get("arms", 0) + 1
    for n, (x, y, sx, sy) in enumerate(use):
        vol.add_box(x - sx / 2, x + sx / 2, y - sy / 2, y + sy / 2, z0, under + 0.01, f"leg{n}", 0.004)
    return rec


def tpl_shell(vol, S, thick=1):
    I = np.floor((S - vol.lo) / vol.v).astype(int)
    I = np.clip(I, 0, np.array(vol.shape) - 1)
    g = np.zeros(vol.shape, bool); g[I[:, 0], I[:, 1], I[:, 2]] = True
    g = ndimage.binary_dilation(g, iterations=thick)
    g = ndimage.binary_closing(g, iterations=2)
    g = ndimage.binary_fill_holes(g)
    for k in range(g.shape[2]):                             # closed outlines per height slice
        g[:, :, k] = ndimage.binary_fill_holes(g[:, :, k])
    vol.add_mask(g, "shell", 0.006)
    return {"thickness_vox": thick}


# ================================================================== mesh ops
def adjacency(F, n):
    E = np.r_[F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]
    A = coo_matrix((np.ones(len(E)), (E[:, 0], E[:, 1])), shape=(n, n))
    A = (A + A.T).tocsr(); A.data[:] = 1
    A = A + diags(np.ones(n))
    return diags(1 / np.asarray(A.sum(1)).ravel()) @ A


def vnormals(V, F):
    fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    Nv = np.zeros_like(V)
    for k in range(3):
        np.add.at(Nv, F[:, k], fn)
    return Nv / np.maximum(np.linalg.norm(Nv, axis=1, keepdims=True), 1e-12)


def clearance(vol, V, Nv, sign, hmax=0.08):
    """how far a vertex may move along +-normal before it meets the opposite side of a thin part (inwards) or
    another part of the model (outwards): half the free run along the normal."""
    hs = np.arange(1, int(hmax / vol.v) + 1) * vol.v
    free = np.full(len(V), hmax)
    done = np.zeros(len(V), bool)
    for h in hs:
        sd = vol.sd_at(V + sign * h * Nv)
        hit = ~done & ((sd > -0.25 * h) if sign < 0 else (sd < 0.25 * h))
        free[hit] = h; done |= hit
    return 0.45 * free


def snap(V, F, A, tree, S, N, vol=None, cap=0.03, r=0.05, iters=10):
    Nv = vnormals(V, F)
    d, idx = tree.query(V, k=10, distance_upper_bound=r)
    ok = np.isfinite(d); idx = np.where(ok, idx, 0)
    diff = S[idx] - V[:, None]; t = (diff * Nv[:, None]).sum(-1)
    lat = np.linalg.norm(diff - t[..., None] * Nv[:, None], axis=-1)
    ok &= ((N[idx] * Nv[:, None]).sum(-1) > 0.5) & (lat < 0.03)
    n_ok = ok.sum(1)
    tm = np.where(n_ok > 0, (t * ok).sum(1) / np.maximum(n_ok, 1), 0)
    w = (n_ok >= 3).astype(float)
    T, W = tm * w, w.copy()
    for _ in range(iters):
        T, W = A @ T, A @ W
    off = np.where(W > 1e-6, T / np.maximum(W, 1e-6), 0) * np.clip(W / 0.5, 0, 1)
    lo_c, hi_c = np.full(len(V), cap), np.full(len(V), cap)
    if vol is not None and getattr(vol, "F", None) is not None:
        lo_c = np.minimum(lo_c, clearance(vol, V, Nv, -1)); hi_c = np.minimum(hi_c, clearance(vol, V, Nv, 1))
        sm_lo, sm_hi = lo_c, hi_c
        for _ in range(2):
            sm_lo, sm_hi = A @ sm_lo, A @ sm_hi
        lo_c, hi_c = np.minimum(lo_c, sm_lo), np.minimum(hi_c, sm_hi)
    off = np.clip(off, -lo_c, hi_c)
    return V + off[:, None] * Nv, float((n_ok >= 3).mean())


def colourise(V, F, A, lab, tree, S, N, C, iters=60):
    Nv = vnormals(V, F)
    d, idx = tree.query(V, k=6, distance_upper_bound=0.035)
    ok = np.isfinite(d); idx = np.where(ok, idx, 0)
    ok &= (N[idx] * Nv[:, None]).sum(-1) > 0.25
    w = ok / (np.where(ok, d, 1) + 0.004)
    ws = w.sum(1)
    seen = ws > 0
    col = np.zeros((len(V), 3))
    col[seen] = (w[seen, :, None] * C[idx[seen]]).sum(1) / ws[seen, None]
    gmed = np.median(C, 0) if len(C) else np.array([0.5, 0.5, 0.5])
    for p in np.unique(lab):                                # unseen: the colour of the same part
        m = lab == p
        src = col[m & seen]
        col[m & ~seen] = np.median(src, 0) if len(src) > 20 else gmed
    fixed = seen.copy()
    for _ in range(iters):                                  # blend unseen areas from the seen neighbourhood
        nc = A @ col
        col[~fixed] = nc[~fixed]
    return np.clip(col, 0, 1), float(seen.mean())


# ================================================================== fit score
def fit_score(V, F, S, N, tree_S):
    tv = cKDTree(V)
    d1, _ = tv.query(S, k=1)
    s1 = float((d1 < 0.04).mean())
    Nv = vnormals(V, F)
    top = Nv[:, 2] > 0.6
    if top.sum() > 10:
        d2, _ = tree_S.query(V[top], k=1)
        s2 = float((d2 < 0.06).mean())
    else:
        s2 = 1.0
    return s1, s2


# ================================================================== one object
def model_one(path, o, a):
    prims, S, N, C = load_scan(path)
    if len(S) < 100:
        return None, {"template": "raw (too little surface)"}
    keep = drop_floaters(S)
    S, N, C = S[keep], N[keep], C[keep]
    kind = (o.get("kind") or "").lower()
    z0 = 0.0
    on_floor = o.get("on_floor", True) is not False
    zmin = float(np.percentile(S[:, 2], 0.5))
    if not on_floor and zmin > 0.2:
        z0 = zmin
        # a table / chair whose legs were cut away (hidden behind chairs) still stands on the floor
        if kind in LEGGED | CHAIR and zmin < 0.9 and float(np.percentile(S[:, 2], 99)) > 0.4:
            z0 = 0.0
    span = np.ptp(S, 0).max()
    v = a.vox if span < 2.0 else a.vox * 4 / 3
    pad = 0.08
    lo = np.r_[S[:, :2].min(0) - pad, (z0 - 2 * v) if z0 == 0 else S[:, 2].min() - pad]
    hi = S.max(0) + pad
    tree_S = cKDTree(S)
    family = "seat" if kind in SEAT else "case" if kind in CASE else "legged" if kind in LEGGED else \
        "chair" if kind in CHAIR else "shell"
    tall_thin = any(str(f).startswith("tall_thin") for f in o.get("flags") or [])
    rec = {"kind": kind, "family": family}
    built = None
    if family != "shell":
        vol = Vol(lo, hi, v)
        try:
            p = {"seat": lambda: tpl_seat(vol, S, N, kind, z0), "case": lambda: tpl_case(vol, S, N, z0),
                 "legged": lambda: tpl_legged(vol, S, N, kind, z0), "chair": lambda: tpl_chair(vol, S, N, z0)}[family]()
        except Exception as e:
            p = None; rec["template_error"] = repr(e)
        if p is not None:
            m = vol.mesh()
            if m is not None:
                s1, s2 = fit_score(m[0], m[1], S, N, tree_S)
                sd = vol.sd_at(S)
                rec.update(params=p, fit_scan_to_template=round(s1, 3), fit_template_to_scan=round(s2, 3),
                           scan_outside=round(float((sd > 0.05).mean()), 3), scan_inside=round(float((sd < -0.06).mean()), 3))
                out_, in_ = rec["scan_outside"], rec["scan_inside"]
                lim = FIT_LIMITS[family]
                bad = [n for n, val, ok in (("scan->template", s1, s1 >= lim["s1"]), ("top->scan", s2, s2 >= lim["s2"]),
                                            ("scan outside", out_, out_ <= lim["out"]), ("scan inside", in_, in_ <= lim["in"])) if not ok]
                if a.force or not bad:
                    built = (m, family)
                else:
                    rec["rejected"] = "poor fit: " + ", ".join(bad)
        else:
            rec.setdefault("rejected", "template could not be fitted")
    if built is None:
        vol = Vol(S.min(0) - pad if z0 > 0 or not on_floor else lo, hi, v)
        rec["shell"] = tpl_shell(vol, S, thick=2)
        m = vol.mesh()
        if m is None:
            return None, rec | {"template": "raw (shell failed)"}
        built = (m, "shell")
        s1, s2 = fit_score(m[0], m[1], S, N, tree_S)
        rec.update(shell_fit_scan=round(s1, 3), shell_fit_top=round(s2, 3))
    (V, F, lab), used = built
    rec["template"] = used if used == "shell" else f"{used}:{kind}"
    if used == "shell":
        rec["template"] = "scan shell" + (" (fallback)" if family != "shell" else "")
    A = adjacency(F, len(V))
    snapped = 0.0
    if used != "shell":                                     # the shell already is the scan surface
        V, snapped = snap(V, F, A, tree_S, S, N, vol=vol, cap=a.snap_cap)
    col, seen = colourise(V, F, A, lab, tree_S, S, N, C)
    rec.update(snapped_share=round(snapped, 3), textured_share=round(seen, 3), triangles=int(len(F)),
               parts=sorted(set(vol.parts)))
    prim = {"P": V.astype(np.float32), "F": F.astype(np.uint32), "UV": None, "image": None,
            "COL": srgb_to_linear(col).astype(np.float32), "name": "variant_d_" + used, "color": (1, 1, 1)}
    return [prim], rec


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", default="zvKHR9DHNjJ")
    ap.add_argument("--ids", type=int, nargs="*")
    ap.add_argument("--vox", type=float, default=0.012)
    ap.add_argument("--snap-cap", type=float, default=0.025)
    ap.add_argument("--force", action="store_true", help="debug: keep the template whatever its fit")
    a = ap.parse_args()
    md = os.path.join(f"pano_{a.model}", "mesh_diff")
    scene = json.load(open(os.path.join(md, "scene_tiles.json")))
    objs = {o["id"]: o for o in json.load(open(os.path.join(md, "objects.json")))["objects"]}
    od = os.path.join(md, "objects_variant_d"); os.makedirs(od, exist_ok=True)
    out_p = os.path.join(md, "scene_variant_d.json")
    prev = {r["id"]: r for r in json.load(open(out_p))["objects"]} if a.ids and os.path.exists(out_p) else {}
    out = []; t_all = time.time()
    for r in scene["objects"]:
        o = objs.get(r["id"])
        if (a.ids and r["id"] not in a.ids) or not r.get("file") or o is None:
            out.append(prev.get(r["id"], dict(r))); continue
        t = time.time()
        nr = dict(r)
        try:
            prims, rec = model_one(os.path.join(md, r["file"]), o, a)
        except Exception as e:
            import traceback; traceback.print_exc(); prims, rec = None, {"template": f"raw (error {e!r})"}
        if prims is not None:
            fn = "objects_variant_d/" + os.path.basename(r["file"])
            write_glb(os.path.join(md, fn), prims)
            nr.update(file=fn, original_file=r["file"])
        nr["variant_d"] = rec
        out.append(nr)
        print(f"  obj {r['id']:3d} {rec.get('kind', '?'):12s} {rec.get('template', '?'):26s} "
              f"fit {rec.get('fit_scan_to_template', '-')}/{rec.get('fit_template_to_scan', '-')} out {rec.get('scan_outside', '-')} in {rec.get('scan_inside', '-')} "
              f"{rec.get('rejected', '')}  {time.time() - t:.1f}s", flush=True)
    json.dump({"frame": scene.get("frame"), "annotation_frame": scene.get("annotation_frame"),
               "method": "variant D: parametric templates fitted to the scan (one closed SDF surface), snapped to and "
                         "coloured from the scan; poor fits fall back to a closed shell of the scan",
               "objects": out}, open(out_p, "w"), indent=1)
    print(f"done in {time.time() - t_all:.0f}s -> {out_p}")


if __name__ == "__main__":
    main()
