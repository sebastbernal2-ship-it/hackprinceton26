#!/usr/bin/env python3
r"""
segment_furniture.py - split Matterport's furnished mesh into furniture pieces by their own geometry, instead of cutting
it with boxes (a box that is too small halves a sofa, one that is too big swallows the neighbours).

  1. furniture triangles = furnished mesh minus the empty house (minus floor-level skirts and plan-wall surface)
  2. pieces = spatially connected groups of those triangles (3.5 cm voxels; texture seams don't split a piece)
  3. pieces that touch (chair against a table, nightstand against a bed) are split at narrow necks of their
     top-down footprint (watershed on the footprint's distance map); splits without a real neck are merged back
  4. trimmed bits right next to a piece (sofa backs against a wall, legs near the floor) are grown back in
  5. each piece is matched to the panorama / fused boxes for its label and room; it gets an oriented box from its
     own footprint and a textured GLB

Inputs (repo root):  assets_<sid>/tiles/furnished_mesh.npz (+ furnished_tex/), pano_<sid>/mesh_diff/{empty_room.obj,
                     plan.json, objects_fused.json}
Outputs (pano_<sid>/mesh_diff/):
    objects.json            furniture pieces (source "mesh_segment") + the rugs / wall / ceiling items of the box pipeline
    objects_tiles/seg_###.glb, scene_tiles.json    textured models (same format as tile_objects.py; studio reads them)
    segments_topdown.png    every piece in its own colour, with id + label (for checking)

    python Code\segment_furniture.py
    python Code\segment_furniture.py --neck 0.5 --voxel 0.03
"""
import argparse, json, math, os, sys
import numpy as np
from scipy import ndimage
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tile_objects import NearSet, surface_samples, load_obj, write_glb, textured_prims, inside   # noqa: E402
from mesh_furniture import min_area_rect, room_of                                                 # noqa: E402

DEBUG = False
PACK = lambda I: (I[:, 0] + 4) * 2 ** 42 + (I[:, 1] + 4) * 2 ** 21 + (I[:, 2] + 4)


def tri_samples(V, F, idx, spacing, seed=0):
    """Surface samples (+ corners) of the triangles idx; returns points and the triangle each belongs to."""
    tri = V[F[idx]]
    area = 0.5 * np.linalg.norm(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1)
    n = np.clip(np.ceil(area / spacing ** 2), 1, 2000).astype(int)
    t = np.repeat(np.arange(len(idx)), n)
    rng = np.random.default_rng(seed); r1, r2 = rng.random(len(t)), rng.random(len(t)); s = np.sqrt(r1)
    P = (1 - s)[:, None] * tri[t, 0] + (s * (1 - r2))[:, None] * tri[t, 1] + (s * r2)[:, None] * tri[t, 2]
    P = np.vstack([P, tri.reshape(-1, 3), tri.mean(1)])
    t = np.r_[t, np.repeat(np.arange(len(idx)), 3), np.arange(len(idx))]
    return P, idx[t]


def connected_pieces(P, owner, ntri_total, voxel):
    """Connected components over triangles: samples in touching voxels connect, a triangle joins all its voxels."""
    o = P.min(0) - voxel
    I = np.floor((P - o) / voxel).astype(int)
    grid = np.zeros(I.max(0) + 1, bool); grid[I[:, 0], I[:, 1], I[:, 2]] = True
    lab, nl = ndimage.label(grid, structure=np.ones((3, 3, 3), bool))
    L = lab[I[:, 0], I[:, 1], I[:, 2]] - 1
    tris, tinv = np.unique(owner, return_inverse=True)
    g = coo_matrix((np.ones(len(L)), (tinv, len(tris) + L)), shape=(len(tris) + nl,) * 2)
    _, comp = connected_components(g, directed=False)
    out = np.full(ntri_total, -1); out[tris] = comp[:len(tris)]
    return out


def split_footprint(P2, cell, neck_ratio, min_cells, peak_win):
    """Watershed split of one piece's top-down footprint. Returns region id per point (0..k-1)."""
    lo = P2.min(0) - 3 * cell
    J = np.floor((P2 - lo) / cell).astype(int)
    occ = np.zeros(J.max(0) + 4, bool); occ[J[:, 0], J[:, 1]] = True
    occ = ndimage.binary_closing(occ, iterations=1) | occ
    occ = ndimage.binary_fill_holes(occ)
    dist = ndimage.distance_transform_edt(occ)
    if occ.sum() < 2 * min_cells:
        return np.zeros(len(P2), int)
    peaks = (dist == ndimage.maximum_filter(dist, size=peak_win)) & (dist >= 2.5)
    mk, nm = ndimage.label(peaks, structure=np.ones((3, 3), bool))
    if nm <= 1:
        return np.zeros(len(P2), int)
    cost = (dist.max() - dist); cost = (cost / max(cost.max(), 1e-9) * 65000).astype(np.uint16)
    markers = mk.astype(np.int32); markers[~occ] = -1
    reg = ndimage.watershed_ift(cost, markers); reg[~occ] = 0
    # merge regions that are not separated by a real neck (or are tiny)
    while True:
        ids = [r for r in np.unique(reg) if r > 0]
        if len(ids) <= 1:
            break
        width = {r: 2 * dist[reg == r].max() for r in ids}
        size = {r: int((reg == r).sum()) for r in ids}
        contact = {}
        for a, b in ((reg[1:, :], reg[:-1, :]), (reg[:, 1:], reg[:, :-1])):
            m = (a != b) & (a > 0) & (b > 0)
            for x, y in zip(a[m], b[m]):
                k = (min(x, y), max(x, y)); contact[k] = contact.get(k, 0) + 1
        if not contact:
            break
        def score(k):
            a, b = k
            if min(size[a], size[b]) < min_cells:
                return 10.0
            return (contact[k] / 2) / min(width[a], width[b])     # neck width / narrower piece's width
        k = max(contact, key=score)
        if score(k) < neck_ratio:
            break
        a, b = k; keep, drop = (a, b) if size[a] >= size[b] else (b, a)
        reg[reg == drop] = keep
    # every point gets the region of its cell (cells without one: nearest region)
    if (reg == 0).any():
        _, (ii, jj) = ndimage.distance_transform_edt(reg == 0, return_indices=True)
        reg = reg[ii, jj]
    r = reg[J[:, 0], J[:, 1]]
    _, r = np.unique(r, return_inverse=True)
    return r


def split_tabletop(V, F, sel, nrm, area, floor_z, voxel, cell=0.04, hmin=0.68, hmax=0.95, min_top=0.25, inside_frac=0.8, seat_depth=0.55):
    """Chairs pushed against / under a table (desk, dining table) touch it, so connectivity and footprint necks can't
    separate them. Find a large flat top at table height, lift it out, regroup the rest: parts under the top (legs,
    apron) stay with the table, the others (chairs) become their own pieces. Returns a list of triangle-index arrays
    (one per piece; the first is the table) or None when there is no tabletop."""
    c = V[F[sel]].mean(1); h = c[:, 2] - floor_z
    flat = (nrm[sel, 2] > 0.9) & (h > hmin) & (h < hmax)
    if area[sel][flat].sum() < min_top:
        return None
    bins = np.arange(hmin, hmax + 0.02, 0.02)
    hist, _ = np.histogram(h[flat], bins=bins, weights=area[sel][flat])
    hz = bins[hist.argmax()] + 0.01
    top = flat & (np.abs(h - hz) < 0.025)
    if area[sel][top].sum() < min_top:
        return None
    # top footprint mask (largest connected blob)
    lo = c[:, :2].min(0) - 3 * cell
    J = np.floor((c[:, :2] - lo) / cell).astype(int); shape = J.max(0) + 4
    m = np.zeros(shape, bool)
    Pt, _ = tri_samples(V, F, sel[top], cell / 2)
    Jt = np.clip(np.floor((Pt[:, :2] - lo) / cell).astype(int), 0, shape - 1); m[Jt[:, 0], Jt[:, 1]] = True
    m = ndimage.binary_fill_holes(ndimage.binary_closing(m, iterations=2) | m)
    lab, n = ndimage.label(m)
    if n == 0:
        return None
    m = lab == (np.bincount(lab.ravel())[1:].argmax() + 1)
    if m.sum() * cell * cell < min_top:
        return None
    # a tabletop is compact (sofa-back tops and shelf rims are long thin strips)
    ij = np.argwhere(m) * cell
    _, (tl, tw), _ = min_area_rect(ij)
    fill = m.sum() * cell * cell / max(tl * tw, 1e-9)
    over = m[J[:, 0], J[:, 1]]
    if DEBUG:
        print(f"    top at {hz:.2f} m, {m.sum() * cell * cell:.2f} m2 ({tl:.2f} x {tw:.2f}, fill {fill:.2f}), "
              f"outside {(~over).mean():.0%}, centre {c[:, :2].mean(0).round(2)}")
    if tw < 0.4 or fill < 0.6:
        return None
    topslab = over & (np.abs(h - hz) < 0.035)
    mw = ndimage.binary_dilation(m, iterations=2)       # + the top's edge / hanging cloth just outside it
    overw = mw[J[:, 0], J[:, 1]]
    lift = overw & (h > hz - 0.15) & (h < hz + 0.06)    # top + apron band (chairs pushed in touch the apron)
    rest = sel[~lift]
    if not len(rest):
        return None
    # regroup what is left: only geometry above the floor zone links pieces (rug edges / feet would chain all chairs),
    # with finer voxels
    from scipy.spatial import cKDTree
    cr = V[F[rest]].mean(1); hr = cr[:, 2] - floor_z
    upm = hr > 0.10
    if not upm.any():
        return None
    P, owner = tri_samples(V, F, rest[upm], 0.015)
    cu = connected_pieces(P, owner, len(F), min(voxel, 0.025))
    comp = np.full(len(rest), -1); comp[upm] = cu[rest[upm]]
    _, comp[upm] = np.unique(comp[upm], return_inverse=True)
    inside_m = mw[J[~lift][:, 0], J[~lift][:, 1]]
    groups = {}
    for k in np.unique(comp[upm]):
        idx = np.where(comp == k)[0]; t = rest[idx]
        seat = area[t][(nrm[t, 2] > 0.85) & (hr[idx] > 0.35) & (hr[idx] < 0.55)].sum()
        groups[k] = dict(idx=idx, area=area[t].sum(), frac=inside_m[idx].mean(), seat=seat,
                         zmin=hr[idx].min(), lo=cr[idx, :2].min(0), hi=cr[idx, :2].max(0))
    # role of each group. Pieces: anything with a seat (chairs, stools) or sticking out from under the top.
    # Chairs pushed in often fuse with the table base in the scan, but their backs rise above the top as separate
    # groups: those backs are seeds - geometry within seat depth of a back (top-down) becomes that chair.
    ext = lambda g: float(np.max(g["hi"] - g["lo"]))
    pieces_k = [k for k, g in groups.items() if g["area"] >= 0.03 and
                (g["seat"] >= 0.06 or (g["frac"] < inside_frac and g["zmin"] < hz - 0.05))]
    seeds_k = [k for k, g in groups.items() if k not in pieces_k and g["zmin"] >= hz - 0.05
               and g["area"] >= 0.02 and ext(g) >= 0.25]
    if DEBUG:
        for k, g in groups.items():
            if g["area"] >= 0.03:
                r = "piece" if k in pieces_k else ("back" if k in seeds_k else "table")
                print(f"      g{k}: {len(g['idx'])} tris {g['area']:.2f} m2 seat {g['seat']:.2f} inside {g['frac']:.0%} "
                      f"z {g['zmin']:.2f}-{hr[g['idx']].max():.2f} -> {r}")
    label = np.full(len(rest), -1)                      # -1 = table, else piece id
    npid, seed_pid = 0, {}
    def pid_of_seed(q):
        nonlocal npid
        if q not in seed_pid:
            seed_pid[q] = npid; label[groups[q]["idx"]] = npid; npid += 1
        return seed_pid[q]
    for k in pieces_k:
        g = groups[k]; idx = g["idx"]
        near = [q for q in seeds_k if np.all(groups[q]["lo"] - seat_depth <= g["hi"]) and np.all(g["lo"] <= groups[q]["hi"] + seat_depth)]
        # backs still attached to this group: its separate parts above the top
        inner = []
        hi_ = idx[hr[idx] > hz + 0.06]
        if len(hi_) >= 20:
            P2, o2 = tri_samples(V, F, rest[hi_], 0.015)
            sc = connected_pieces(P2, o2, len(F), min(voxel, 0.025))[rest[hi_]]
            for q in np.unique(sc):
                si = hi_[sc == q]
                if area[rest[si]].sum() >= 0.02 and np.ptp(cr[si, :2], axis=0).max() >= 0.25:
                    inner.append(si)
        if len(near) + len(inner) >= 2:
            pts = [cr[groups[q]["idx"], :2] for q in near] + [cr[si, :2] for si in inner]
            sp = np.vstack(pts); sl = np.concatenate([np.full(len(x), j) for j, x in enumerate(pts)])
            d, nn = cKDTree(sp).query(cr[idx, :2])
            own = np.where(d < seat_depth, sl[nn], -1)
            for j in range(len(pts)):
                if not (own == j).any():
                    continue
                if j < len(near):
                    label[idx[own == j]] = pid_of_seed(near[j])
                else:
                    label[idx[own == j]] = npid; npid += 1
            if DEBUG:
                print(f"      seeded split of g{k} around {len(near)} + {len(inner)} chair backs")
        elif len(near) == 1:
            label[idx] = pid_of_seed(near[0])
        else:
            label[idx] = npid; npid += 1
    # leftover bits above the top join the piece whose footprint they overlap (else: decor on the table)
    for k, g in groups.items():
        if k in pieces_k or k in seed_pid or g["zmin"] < hz - 0.05:
            continue
        best, bo = None, 0.0
        for kk in pieces_k:
            o_ = np.prod(np.clip(np.minimum(g["hi"], groups[kk]["hi"] + 0.05) - np.maximum(g["lo"], groups[kk]["lo"] - 0.05), 0, None))
            if o_ > bo:
                best, bo = kk, o_
        if best is not None and label[groups[best]["idx"][0]] >= 0 and groups[best]["frac"] < 1.0 and not seeds_k:
            label[g["idx"]] = label[groups[best]["idx"][0]]
    if npid == 0:
        return None
    # low triangles and the lifted band (except the top slab itself) go to the nearest assigned triangle
    known = np.where(upm)[0]
    tree = cKDTree(cr[known])
    low = np.where(~upm)[0]
    if len(low):
        label[low] = label[known[tree.query(cr[low])[1]]]
    band = sel[lift & ~topslab]
    if len(band):
        cb = V[F[band]].mean(1)
        allc = np.vstack([cr, V[F[sel[topslab]]].mean(1)])
        alll = np.r_[label, np.full(topslab.sum(), -1)]
        lb = alll[cKDTree(allc).query(cb)[1]]
    else:
        lb = np.zeros(0, int)
    table = np.r_[sel[topslab], rest[label < 0], band[lb < 0]]
    pieces = [np.r_[rest[label == i], band[lb == i]] for i in range(npid)]
    pieces = [p for p in pieces if len(p)]
    # only a real table/chair situation counts: some separated piece must have a seat (a bed's headboard has none)
    def seat_of(t):
        ht = V[F[t]].mean(1)[:, 2] - floor_z
        return area[t][(nrm[t, 2] > 0.85) & (ht > 0.35) & (ht < 0.55)].sum()
    if not pieces or max(seat_of(p) for p in pieces) < 0.06:
        return None
    if DEBUG:
        print(f"      -> table {len(table)} tris, pieces {[len(p) for p in pieces]}")
    return [table] + pieces


def split_corners(V, F, sel, nrm, area, floor_z, voxel, cell=0.04, min_top=1.2, margin=0.12):
    """Beds: nightstands are often welded to the bed in the scan. A bed has a big flat top (mattress); headboard,
    footboard and benches are in line with that rectangle, nightstands sit in its corner zones (beside the headboard).
    Sizable parts in the corner zones become their own pieces. Returns list of triangle arrays (bed first) or None."""
    c = V[F[sel]].mean(1); h = c[:, 2] - floor_z
    flat = (nrm[sel, 2] > 0.85) & (h > 0.35) & (h < 0.95)
    if DEBUG and area[sel].sum() > 3:
        print(f"    bed check at {c[:, :2].mean(0).round(2)}: flat {area[sel][flat].sum():.2f} m2 of {area[sel].sum():.1f}")
    if area[sel][flat].sum() < min_top:
        return None
    bins = np.arange(0.35, 0.97, 0.04)
    hist, _ = np.histogram(h[flat], bins=bins, weights=area[sel][flat])
    hz = bins[hist.argmax()] + 0.02
    top = flat & (np.abs(h - hz) < 0.06)
    if area[sel][top].sum() < min_top:
        return None
    lo = c[:, :2].min(0) - 3 * cell
    Pt, _ = tri_samples(V, F, sel[top], cell / 2)
    Jt = np.floor((Pt[:, :2] - lo) / cell).astype(int)
    m = np.zeros(Jt.max(0) + 4, bool); m[Jt[:, 0], Jt[:, 1]] = True
    m = ndimage.binary_fill_holes(ndimage.binary_closing(m, iterations=2) | m)
    lab, n = ndimage.label(m)
    if n == 0:
        return None
    m = lab == (np.bincount(lab.ravel())[1:].argmax() + 1)
    xy = lo + (np.argwhere(m) + 0.5) * cell
    rc, _, ryaw = min_area_rect(xy)
    # mattress rectangle from medians: the typical width along the bed ignores nightstand tops at the same height
    best = None
    for yaw in (ryaw, ryaw + 90):
        a_ = math.radians(yaw); d = xy - rc
        u = d[:, 0] * math.cos(a_) + d[:, 1] * math.sin(a_); v = -d[:, 0] * math.sin(a_) + d[:, 1] * math.cos(a_)
        ub = np.floor(u / cell).astype(int)
        vmin = np.array([v[ub == k].min() for k in np.unique(ub)]); vmax = np.array([v[ub == k].max() for k in np.unique(ub)])
        v0, v1 = float(np.median(vmin)), float(np.median(vmax))
        core = (v >= v0 - cell) & (v <= v1 + cell)
        u0, u1 = np.percentile(u[core], 1), np.percentile(u[core], 99)
        f_ = ((u >= u0) & (u <= u1) & (v >= v0) & (v <= v1)).sum() * cell * cell / max((u1 - u0) * (v1 - v0), 1e-9)
        sc_ = f_ * min(1.0, (u1 - u0) * (v1 - v0) / (m.sum() * cell * cell))    # fits well AND covers most of the top
        if best is None or sc_ > best[0]:
            best = (sc_, yaw, u0, u1, v0, v1)
    _, ryaw, u0, u1, v0, v1 = best
    rl, rw = u1 - u0, v1 - v0
    a_ = math.radians(ryaw); d = xy - rc
    u = d[:, 0] * math.cos(a_) + d[:, 1] * math.sin(a_); v = -d[:, 0] * math.sin(a_) + d[:, 1] * math.cos(a_)
    fill = ((u >= u0) & (u <= u1) & (v >= v0) & (v <= v1)).sum() * cell * cell / max(rl * rw, 1e-9)
    if DEBUG:
        print(f"    bed check at {c[:, :2].mean(0).round(2)}: top {m.sum() * cell * cell:.2f} m2 at {hz:.2f} "
              f"core {rl:.2f} x {rw:.2f} fill {fill:.2f}")
    if fill < 0.75 or min(rl, rw) < 0.8 or max(rl, rw) < 1.5 or rl * rw < min_top:
        return None
    d = c[:, :2] - rc
    u = d[:, 0] * math.cos(a_) + d[:, 1] * math.sin(a_); v = -d[:, 0] * math.sin(a_) + d[:, 1] * math.cos(a_)
    corner = (v < v0 - margin) | (v > v1 + margin)          # beside the mattress, beyond the side rails
    if not corner.any():
        return None
    cs = sel[corner]
    P, owner = tri_samples(V, F, cs, 0.015)
    comp = connected_pieces(P, owner, len(F), min(voxel, 0.025))[cs]
    pieces = []
    for k in np.unique(comp):
        t = cs[comp == k]; zt = V[F[t]].mean(1)[:, 2] - floor_z
        if area[t].sum() >= 0.1 and np.ptp(zt) >= 0.3:
            pieces.append(t)
    if not pieces:
        return None
    if DEBUG:
        print(f"    bed-like top {m.sum() * cell * cell:.2f} m2 at {hz:.2f} m ({rl:.2f} x {rw:.2f}): {len(pieces)} corner pieces")
    taken = np.concatenate(pieces)
    return [np.setdiff1d(sel, taken)] + pieces


def shape_kind(V, F, sel, nrm, area, floor_z, l, w, zb, zt, on_floor):
    """A plain name from the piece's shape (the scan has no object labels): seat / top heights and proportions."""
    h = V[F[sel]].mean(1)[:, 2] - floor_z
    up = nrm[sel, 2] > 0.85
    seat = area[sel][up & (h > 0.3) & (h < 0.6)].sum()
    top = area[sel][up & (h > 0.6) & (h < 1.0)].sum()
    H, foot = zt - zb, l * w
    if not on_floor:
        if max(l, w) < 0.5:
            return "lamp" if H > 0.3 else "decor"
        return "shelf" if H < 0.6 else "wall unit"
    if max(l, w) < 0.45 and H > 1.2:
        return "floor lamp"
    if max(l, w) < 0.4 and H < 1.2:
        return "lamp" if H > 0.4 and foot < 0.08 else "small item"
    if H > 1.6:
        return "wardrobe" if min(l, w) > 0.45 else "cabinet"
    if l > 1.5 and seat > 0.5 and H < 1.2:
        return "sofa"
    if seat >= 0.08 and max(l, w) < 1.0 and H > 0.65:
        return "armchair" if min(l, w) > 0.7 else "chair"
    if top > 0.35 * foot and 0.6 < H < 1.05:
        return "table" if foot > 0.6 else "side table"
    if H <= 0.55:
        return "coffee table" if foot > 0.3 else "stool"
    if H > 1.05:
        return "cabinet"
    return "dresser" if l > 0.9 else "side table"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", default="zvKHR9DHNjJ")
    ap.add_argument("--tol", type=float, default=0.10, help="closer than this to the empty house = house (coarse 50k empty mesh)")
    ap.add_argument("--voxel", type=float, default=0.035, help="connectivity voxel (m): gaps up to ~1 voxel are bridged")
    ap.add_argument("--cell", type=float, default=0.04, help="footprint cell for the neck split (m)")
    ap.add_argument("--neck", type=float, default=0.55, help="merge two footprint regions when the neck between them is "
                                                              "at least this share of the narrower region's width")
    ap.add_argument("--no-tables", dest="tables", action="store_false", help="skip the tabletop / chair split")
    ap.add_argument("--grow", type=int, default=2, help="voxel steps to grow pieces into trimmed triangles next to them")
    ap.add_argument("--no-fill", dest="fill", action="store_false",
                    help="don't add the house-flagged surfaces inside a piece's outline (mattress tops, seats)")
    ap.add_argument("--floor-band", type=float, default=0.10)
    ap.add_argument("--wall-band", type=float, default=0.05)
    ap.add_argument("--min-area", type=float, default=0.04, help="drop pieces with less surface (m2)")
    ap.add_argument("--min-size", type=float, default=0.20, help="drop pieces whose largest dimension is below this (m)")
    ap.add_argument("--min-tris", type=int, default=40)
    a = ap.parse_args()

    tiles = os.path.join(f"assets_{a.model}", "tiles"); md = os.path.join(f"pano_{a.model}", "mesh_diff")
    fz = os.path.join(tiles, "furnished_mesh.npz")
    if not os.path.exists(fz):
        sys.exit("no furnished_mesh.npz - run matterpak.py (or fetch_tiles.py + tiles_mesh.py) first")
    D = np.load(fz)
    V, F, UV, T, texfiles = D["V"].astype(float), D["F"], D["UV"], D["T"], [str(x) for x in D["tex"]]
    ez = os.path.join(tiles, "defurnished_mesh.npz")
    if os.path.exists(ez):
        E = np.load(ez); Ve, Fe = E["V"].astype(float), E["F"]
    else:
        Ve, Fe = load_obj(os.path.join(md, "empty_room.obj"))
    plan = json.load(open(os.path.join(md, "plan.json")))
    fused = json.load(open(os.path.join(md, "objects_fused.json")))
    boxes = [o for o in fused["objects"] if not any(f.startswith("duplicate_of_") for f in o.get("flags") or [])]
    floor_z = float(np.median([o["floor_z"] for o in boxes])) if boxes else float(np.percentile(Ve[:, 2], 2))
    ceil_z = floor_z + float(np.median([r["height_m"] for r in plan["rooms"] if r.get("height_m")] or [2.6]))
    print(f"furnished {len(F)} tris | empty {len(Fe)} tris | floor {floor_z:.3f}  ceiling {ceil_z:.2f}", flush=True)

    # ---- 1. furniture triangles
    cent = V[F].mean(1)
    nrm = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    area = 0.5 * np.linalg.norm(nrm, axis=1); nrm /= np.maximum(2 * area[:, None], 1e-12)
    house = NearSet(surface_samples(Ve, Fe), a.tol).near(cent)
    h = cent[:, 2] - floor_z
    floorish = (np.abs(nrm[:, 2]) > 0.45) & (h < a.floor_band)
    dwall = np.full(len(F), 9.0)
    vert = np.where(np.abs(nrm[:, 2]) < 0.35)[0]
    for w in plan["walls"]:
        A, B = np.array(w["a"], float), np.array(w["b"], float); ab = B - A
        t = np.clip(((cent[vert, :2] - A) @ ab) / max(ab @ ab, 1e-9), 0, 1)
        dwall[vert] = np.minimum(dwall[vert], np.linalg.norm(cent[vert, :2] - (A + t[:, None] * ab), axis=1) - (w.get("thickness") or 0.15) / 2)
    wallish = dwall < a.wall_band
    inroom = (h > 0.02) & (cent[:, 2] < ceil_z - 0.12) & ~floorish & ~wallish
    cand = np.where(inroom & ~house)[0]
    print(f"furniture triangles: {len(cand)}", flush=True)

    # ---- 2. connected pieces
    P, owner = tri_samples(V, F, cand, 0.02)
    comp = connected_pieces(P, owner, len(F), a.voxel)
    print(f"connected pieces: {len(np.unique(comp[cand]))}", flush=True)

    # ---- 3. split touching furniture at footprint necks
    seg = np.full(len(F), -1); nseg = 0
    pc = comp[owner]
    order = np.argsort(pc, kind="stable"); bounds = np.flatnonzero(np.diff(pc[order])) + 1
    nsplit = 0
    for grp in np.split(order, bounds):
        tris = np.unique(owner[grp])
        if area[tris].sum() < a.min_area / 2:
            continue
        r = split_footprint(P[grp, :2], a.cell, a.neck, min_cells=int(0.05 / a.cell ** 2), peak_win=int(round(0.5 / a.cell)) | 1)
        # triangle -> majority region of its samples
        uk, cnt = np.unique(owner[grp].astype(np.int64) * 1000 + r, return_counts=True)
        tt, rr = uk // 1000, uk % 1000
        o_ = np.lexsort((-cnt, tt)); tt, rr = tt[o_], rr[o_]
        first = np.r_[True, tt[1:] != tt[:-1]]
        seg[tt[first]] = nseg + rr[first]
        nr = int(r.max()) + 1; nsplit += nr > 1
        nseg += nr
    print(f"pieces after neck split: {nseg} ({nsplit} connected pieces were split)", flush=True)

    # ---- 4. grow back trimmed triangles touching a piece (house-near, not floor/wall)
    grown = 0; was_grown = np.zeros(len(F), bool)
    near_furn = NearSet(cent[cand], 0.25, cell=0.05).near(cent) if a.grow else None
    for _ in range(a.grow):
        have = np.where(seg >= 0)[0]
        Ph, oh = tri_samples(V, F, have, 0.03, seed=1)
        o = Ph.min(0) - 1.0
        K = PACK(np.floor((Ph - o) / a.voxel).astype(np.int64)); L = seg[oh]
        Ku, first = np.unique(K, return_index=True); Lu = L[first]
        G = np.where(inroom & house & (seg < 0) & near_furn)[0]
        if not len(G):
            break
        Ig = np.floor((cent[G] - o) / a.voxel).astype(np.int64)
        lab = np.full(len(G), -1)
        for d in [(i, j, k) for i in (-1, 0, 1) for j in (-1, 0, 1) for k in (-1, 0, 1)]:
            kk = PACK(Ig + np.array(d)); pos = np.clip(np.searchsorted(Ku, kk), 0, len(Ku) - 1)
            hit = (Ku[pos] == kk) & (lab < 0); lab[hit] = Lu[pos[hit]]
        add = lab >= 0
        seg[G[add]] = lab[add]; grown += int(add.sum()); was_grown[G[add]] = True
        if not add.any():
            break
    # surfaces inside a piece's (hole-filled) outline that the coarse empty mesh happened to cover (mattress tops,
    # sofa seats) are part of the piece, too
    if a.fill:
        filled = 0
        G = np.where(inroom & (seg < 0) & (h > 0.12))[0]
        cell = 0.05
        for s in np.unique(seg[seg >= 0]):
            if not len(G):
                break
            t = np.where(seg == s)[0]
            if area[t].sum() < 0.3:
                continue
            q = cent[t]; lo = q[:, :2].min(0) - 2 * cell
            Jq = np.floor((q[:, :2] - lo) / cell).astype(int)
            msk = np.zeros(Jq.max(0) + 3, bool); msk[Jq[:, 0], Jq[:, 1]] = True
            msk = ndimage.binary_fill_holes(ndimage.binary_closing(msk, iterations=2) | msk)
            msk = ndimage.binary_erosion(msk, iterations=1)
            Jg = np.floor((cent[G, :2] - lo) / cell).astype(int)
            ok = (Jg >= 0).all(1) & (Jg[:, 0] < msk.shape[0]) & (Jg[:, 1] < msk.shape[1])
            ins = np.zeros(len(G), bool); ins[ok] = msk[Jg[ok, 0], Jg[ok, 1]]
            ins &= h[G] <= np.percentile(h[t], 99) + 0.02
            seg[G[ins]] = s; was_grown[G[ins]] = True; filled += int(ins.sum())
            G = G[~ins]
        print(f"filled inside outlines: {filled} triangles", flush=True)
    print(f"grown back: {grown} trimmed triangles", flush=True)

    # ---- 4b. tables with chairs pushed in: lift the top out and regroup
    ntab = 0; split_kind = {}                           # piece -> name known from the split
    if a.tables:
        for s in range(nseg):
            sel = np.where(seg == s)[0]
            if area[sel].sum() < 0.5:
                continue
            parts = split_tabletop(V, F, sel, nrm, area, floor_z, a.voxel)
            kind = "tabletop"
            if not parts:
                parts = split_corners(V, F, sel, nrm, area, floor_z, a.voxel); kind = "bed corner"
            if parts:
                split_kind[s] = "table" if kind == "tabletop" else "bed"
                for p in parts[1:]:
                    split_kind[nseg] = "nightstand" if kind == "bed corner" else "chair"
                    seg[p] = nseg; nseg += 1
                ntab += 1
                print(f"  {kind} split: piece {s} -> main + {len(parts) - 1} pieces", flush=True)
    print(f"tables split from chairs: {ntab}", flush=True)


    # ---- 5. pieces -> objects
    od = os.path.join(md, "objects_tiles"); os.makedirs(od, exist_ok=True)
    texdir = os.path.join(tiles, "furnished_tex")
    rooms = plan["rooms"]
    objs, scene, dropped, seg_to_obj = [], [], 0, {}
    for s in range(nseg):
        sel = np.where(seg == s)[0]
        if len(sel) < a.min_tris or area[sel].sum() < a.min_area:
            dropped += 1; continue
        Pv = V[np.unique(F[sel])]
        c2, (l, w), yaw = min_area_rect(Pv[:, :2])
        hz = Pv[:, 2] - floor_z
        zb, zt = float(np.percentile(hz, 1)), float(np.percentile(hz, 99.5))
        if max(l, w, zt - zb) < a.min_size:
            dropped += 1; continue
        on_floor = zb < 0.20
        if on_floor:
            zb = 0.0
        box = {"centre": [round(float(c2[0]), 3), round(float(c2[1]), 3), round(floor_z + (zb + zt) / 2, 3)],
               "size_lwh_m": [round(l, 3), round(w, 3), round(zt - zb, 3)], "yaw_deg": round(yaw, 1),
               "z_bottom": round(zb, 3), "z_top": round(zt, 3)}
        o = {"id": len(objs), "label": None, "label_source": None, "furniture": None, "room": room_of(c2, rooms),
             "box": box, "on_floor": bool(on_floor), "floor_z": round(floor_z, 3), "confirmed": True,
             "source": "mesh_segment", "flags": [], "seen_from_panos": [], "primary_view": None,
             "layer": "furniture" if on_floor else ("wall" if dwall[sel].min() < 0.3 and w < 0.3 else "surface")}
        # label / room / views from the box pipeline: the box holding most of this piece
        best, bn = None, 0
        for b in boxes:
            n = int(inside(b, Pv, 0.05).sum())
            if n > bn:
                best, bn = b, n
        if best is not None and bn >= 0.25 * len(Pv):
            for k in ("label", "label_source", "furniture", "seen_from_panos", "primary_view"):
                if best.get(k) is not None:
                    o[k] = best[k]
            o["matched_box"] = best["id"]
        o["kind"] = split_kind.get(s) or shape_kind(V, F, sel, nrm, area, floor_z, l, w, zb, zt, on_floor)
        if zt > 2.0 and w < 0.45:
            o["flags"].append("tall_thin: door / curtain / wardrobe front?")
        # textured model, local frame: box centre x,y; floor z; unrotated (same as tile_objects.py)
        used, Fs = np.unique(F[sel], return_inverse=True); Fs = Fs.reshape(-1, 3)
        ang = math.radians(yaw); cc, ss = math.cos(-ang), math.sin(-ang)
        d = V[used, :2] - np.array(c2)
        Vl = np.c_[d[:, 0] * cc - d[:, 1] * ss, d[:, 0] * ss + d[:, 1] * cc, V[used, 2] - floor_z]
        fn = f"objects_tiles/seg_{o['id']:03d}.glb"
        write_glb(os.path.join(md, fn), textured_prims(Vl, Fs, UV[used], T[sel], texfiles, texdir))
        scene.append({"id": o["id"], "label": o["label"], "label_source": o["label_source"], "file": fn,
                      "result": "segmented from Matterport mesh", "triangles": int(len(sel)),
                      "grown_triangles": int(was_grown[sel].sum()),
                      "textured": float((T[sel] >= 0).mean()), "refined_size_m": box["size_lwh_m"]})
        seg_to_obj[s] = o["id"]
        objs.append(o)
    count = {}
    for o in objs:
        k = (o["kind"], (o["room"] or {}).get("label"))
        count[k] = count.get(k, 0) + 1
    seen = {}
    for o, sc in zip(objs, scene):
        if o["label"]:
            continue
        k = (o["kind"], (o["room"] or {}).get("label")); seen[k] = seen.get(k, 0) + 1
        o["label"] = o["kind"].capitalize() + (f" {seen[k]}" if count[k] > 1 else "")
        o["label_source"] = "shape"; sc["label"] = o["label"]; sc["label_source"] = "shape"
    print(f"objects: {len(objs)} (dropped {dropped} small pieces)", flush=True)

    # rugs, wall art, ceiling items: the mesh difference cannot see them -> keep the box pipeline's
    nid = len(objs)
    for b in boxes:
        if b.get("layer") in ("floor_covering", "wall", "ceiling"):
            c = json.loads(json.dumps(b)); c["box_id"] = c["id"]; c["id"] = nid; nid += 1; objs.append(c)
    out = {k: v for k, v in fused.items() if k not in ("objects", "objects_rejected")}
    out["method"] = (fused.get("method", "") + " | furniture re-segmented from the mesh (segment_furniture.py): "
                     "connected pieces split at footprint necks; labels from the box pipeline")
    out["objects"] = objs
    json.dump(out, open(os.path.join(md, "objects.json"), "w"), indent=1)
    json.dump({"frame": "local: origin = box centre (x,y) and floor (z), unrotated, z up", "annotation_frame": None,
               "objects": scene}, open(os.path.join(md, "scene_tiles.json"), "w"), indent=1)

    try:
        import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
        fig, ax = plt.subplots(figsize=(14, 10))
        for w_ in plan["walls"]:
            ax.plot([w_["a"][0], w_["b"][0]], [w_["a"][1], w_["b"][1]], "k-", lw=1.2)
        rng = np.random.default_rng(3); cols = rng.random((max(len(objs), 1), 3)) * 0.8 + 0.1
        oid = np.full(nseg + 1, -1); oid[list(seg_to_obj)] = list(seg_to_obj.values())
        m = seg >= 0; om = oid[seg[m]]
        ax.scatter(cent[m][om < 0, 0], cent[m][om < 0, 1], s=0.3, c="0.75")
        ax.scatter(cent[m][om >= 0, 0], cent[m][om >= 0, 1], s=0.4, c=cols[om[om >= 0]])
        for o in [o for o in objs if o.get("source") == "mesh_segment"]:
            ax.text(o["box"]["centre"][0], o["box"]["centre"][1], f"{o['id']}" + (f" {o['label']}" if o["label"] else ""),
                    fontsize=7, ha="center")
        ax.set_aspect("equal"); ax.set_title("segment_furniture.py: one colour per piece (id, label)")
        fig.savefig(os.path.join(md, "segments_topdown.png"), dpi=100, bbox_inches="tight")
    except Exception as e:                                                  # noqa
        print("plot skipped:", e)
    print(f"wrote {md}/objects.json, scene_tiles.json, objects_tiles/seg_*.glb")


if __name__ == "__main__":
    main()
