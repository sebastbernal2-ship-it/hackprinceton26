#!/usr/bin/env python3
r"""
variant_b_stitch.py - method B: repair the scanned furniture mesh itself.

Per object (local GLB frame, z up, floor z = 0):
  1. weld (1 mm), drop degenerate / duplicate faces, resolve non-manifold edges (keep the 2 largest faces),
     drop tiny floating junk components
  2. split non-manifold vertices (bow-ties) so every boundary is a clean cycle
  3. orientation: propagate a consistent winding over manifold edges, then decide 'outward' per connected patch
     with the scan cameras (side that cameras could see) and far virtual cameras (side that escapes = outside)
  4. every boundary loop is closed by a patch that SHARES the loop vertices: concentric rings + zipper
     triangulation (a topological disc), faired with a bi-Laplacian (thin plate) that also sees the scan's 1-ring
     around the loop (smooth continuation, no crease). Large loops are pulled towards a shape prior: the convex
     hull of the piece extended down to the floor (back plane against a wall, flat base) - but only where the scan
     cameras could NOT have seen that hull spot (Visibility), so real gaps (under tables, between legs) stay open.
     A patch that cameras saw as empty space is rejected.
  5. patches get vertex colours = median of nearby same-facing texels; scanned triangles keep UV + texture.

    python Code\variants\variant_b_stitch.py               # all objects
    python Code\variants\variant_b_stitch.py --ids 0 8 44
Outputs pano_<model>/mesh_diff/objects_variant_b/*.glb and scene_variant_b.json
"""
import argparse, json, math, os, sys, time
from collections import deque
import numpy as np
from scipy.sparse import coo_matrix, diags, identity
from scipy.sparse.csgraph import connected_components
from scipy.sparse.linalg import spsolve
from scipy.spatial import cKDTree, ConvexHull

SOLID = {"sofa", "armchair", "bed", "cabinet", "wardrobe", "dresser", "nightstand", "wall unit", "shelf"}
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from refine_objects import read_glb, sample, Visibility, to_local, weld, srgb_to_linear  # noqa: E402
from tile_objects import write_glb  # noqa: E402


# ------------------------------------------------------------------ helpers
def tri_normals(P, F):
    cr = np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]])
    ar = np.linalg.norm(cr, axis=1)
    return cr / np.maximum(ar, 1e-15)[:, None], 0.5 * ar


def half_edges(F):
    """(3m,) arrays: face, a, b, corner of a, corner of b."""
    m = len(F)
    f = np.repeat(np.arange(m), 3)
    k = np.tile([0, 1, 2], m)
    a = F[f, k]; b = F[f, (k + 1) % 3]
    return f, a, b, 3 * f + k, 3 * f + (k + 1) % 3


def edge_groups(a, b, n):
    lo, hi = np.minimum(a, b), np.maximum(a, b)
    key = lo.astype(np.int64) * n + hi
    _, inv, cnt = np.unique(key, return_inverse=True, return_counts=True)
    return inv.reshape(-1), cnt


def face_components(F, n):
    """faces connected through edges shared by exactly 2 faces"""
    f, a, b, _, _ = half_edges(F)
    g, cnt = edge_groups(a, b, n)
    sel = cnt[g] == 2
    o = np.argsort(g[sel], kind="stable"); fs = f[sel][o]
    f1, f2 = fs[0::2], fs[1::2]
    A = coo_matrix((np.ones(len(f1)), (f1, f2)), shape=(len(F), len(F)))
    return connected_components(A, directed=False)


# ------------------------------------------------------------------ 1 clean
def clean(Pw, FW, stats):
    m = len(FW)
    _, area = tri_normals(Pw, FW)
    degen = (FW[:, 0] == FW[:, 1]) | (FW[:, 1] == FW[:, 2]) | (FW[:, 0] == FW[:, 2]) | (area < 1e-9)
    keep = ~degen
    s = np.sort(FW, 1)
    idx = np.flatnonzero(keep)
    _, first = np.unique(s[idx], axis=0, return_index=True)
    dup = np.ones(m, bool); dup[idx[first]] = False; dup &= keep
    keep &= ~dup
    stats["degenerate"] = int(degen.sum()); stats["duplicate"] = int(dup.sum())
    # non-manifold edges: keep the two largest faces
    idx = np.flatnonzero(keep)
    f, a, b, _, _ = half_edges(FW[idx])
    g, cnt = edge_groups(a, b, len(Pw))
    bad = np.flatnonzero(cnt[g] > 2)
    nm = 0
    if len(bad):
        order = np.lexsort((-area[idx[f[bad]]], g[bad]))
        gb = g[bad][order]; fb = idx[f[bad]][order]
        st = np.r_[0, np.flatnonzero(gb[1:] != gb[:-1]) + 1]
        rank = np.arange(len(gb)) - np.repeat(st, np.diff(np.r_[st, len(gb)]))
        drop = np.unique(fb[rank >= 2])
        keep[drop] = False; nm = len(drop)
    stats["non_manifold_faces"] = int(nm)
    # floating junk: tiny components
    idx = np.flatnonzero(keep)
    nc, lab = face_components(FW[idx], len(Pw))
    ca = np.bincount(lab, area[idx], nc); cn = np.bincount(lab, minlength=nc)
    tot = area[idx].sum()
    junk = (ca < min(1.5e-3, 0.01 * tot)) | (cn <= 2)
    junk &= ca < 0.2 * tot
    keep[idx[junk[lab]]] = False
    stats["junk_faces"] = int(junk[lab].sum())
    return keep


# ------------------------------------------------------------------ 2 split non-manifold vertices
def split_vertices(FW):
    m = len(FW)
    f, a, b, ca, cb = half_edges(FW)
    g, cnt = edge_groups(a, b, FW.max() + 1)
    sel = np.flatnonzero(cnt[g] == 2)
    o = sel[np.argsort(g[sel], kind="stable")]
    h1, h2 = o[0::2], o[1::2]
    same = a[h1] == a[h2]
    # corner of vertex a[h1] in h2 and of vertex b[h1] in h2
    c2a = np.where(same, ca[h2], cb[h2]); c2b = np.where(same, cb[h2], ca[h2])
    r = np.r_[ca[h1], cb[h1]]; c = np.r_[c2a, c2b]
    A = coo_matrix((np.ones(len(r)), (r, c)), shape=(3 * m, 3 * m))
    _, lab = connected_components(A, directed=False)
    return lab.reshape(m, 3), h1, h2, same


# ------------------------------------------------------------------ 3 orientation
def propagate(FN):
    """consistent winding over manifold edges; returns flip (bool per face), patch label per face"""
    m = len(FN)
    f, a, b, _, _ = half_edges(FN)
    g, cnt = edge_groups(a, b, FN.max() + 1)
    sel = np.flatnonzero(cnt[g] == 2)
    o = sel[np.argsort(g[sel], kind="stable")]
    h1, h2 = o[0::2], o[1::2]
    f1, f2 = f[h1], f[h2]; same = (a[h1] == a[h2]).astype(np.int8)
    adj = [[] for _ in range(m)]
    for x, y, s in zip(f1.tolist(), f2.tolist(), same.tolist()):
        adj[x].append((y, s)); adj[y].append((x, s))
    flip = np.full(m, -1, np.int8); lab = np.full(m, -1, np.int64); nl = 0
    for s0 in range(m):
        if flip[s0] >= 0:
            continue
        flip[s0] = 0; lab[s0] = nl; q = deque([s0])
        while q:
            x = q.popleft()
            for y, s in adj[x]:
                if flip[y] < 0:
                    flip[y] = flip[x] ^ s; lab[y] = nl; q.append(y)
        nl += 1
    return flip.astype(bool), lab, nl


def sphere_cams(c, r, n=40):
    i = np.arange(n) + 0.5
    phi = np.arccos(1 - 2 * i / n); th = math.pi * (1 + 5 ** 0.5) * i
    return c + r * np.c_[np.cos(th) * np.sin(phi), np.sin(th) * np.sin(phi), np.cos(phi)]


def face_adjacency(F):
    f, a, b, _, _ = half_edges(F)
    g, cnt = edge_groups(a, b, F.max() + 1)
    sel = np.flatnonzero(cnt[g] == 2)
    o = sel[np.argsort(g[sel], kind="stable")]
    f1, f2 = f[o[0::2]], f[o[1::2]]
    A = coo_matrix((np.ones(2 * len(f1)), (np.r_[f1, f2], np.r_[f2, f1])), shape=(len(F), len(F))).tocsr()
    return A


def orient_regions(P, F, lab, nl, vis, vvis, nvirt, rng, stats, a):
    """outward decision per REGION (not per component): camera votes on sampled faces, diffused over the
    consistently wound face graph (~ tens of cm), so a sheet whose outward side switches (seat top vs. legs of a
    single-sheet chair) gets each part right. Returns per-face flip and per-face 'thin' (both sides seen)."""
    Nf, ar = tri_normals(P, F)
    cen = P[F].mean(1)
    m = len(F)
    k = min(m, a.orient_samples)
    sel = rng.choice(m, k, replace=False, p=ar / ar.sum()) if k < m else np.arange(m)
    x, n = cen[sel], Nf[sel]
    eps = 0.004
    sc = np.zeros(k); thin = np.zeros(k)
    if vis is not None:
        cp = vis.count(x + eps * n, n); cm = vis.count(x - eps * n, -n)
        sc += (np.minimum(cp, 3) - np.minimum(cm, 3)) / 3.0
        thin = ((cp >= 2) & (cm >= 2)).astype(float)
    vp = vvis.count(x + eps * n, n); vm = vvis.count(x - eps * n, -n)
    sc += 0.6 * (vp - vm) / nvirt
    num = np.zeros(m); den = np.zeros(m); th = np.zeros(m)
    num[sel] = sc; den[sel] = 1.0; th[sel] = thin
    A = face_adjacency(F); deg = np.asarray(A.sum(1)).ravel() + 1
    for _ in range(a.orient_diffuse):
        num = (num + A @ num) / deg; den = (den + A @ den) / deg; th = (th + A @ th) / deg
    comp = np.bincount(lab[sel], sc, nl) / np.maximum(np.bincount(lab[sel], minlength=nl), 1)
    score = np.where(den > 1e-6, num / np.maximum(den, 1e-12), comp[lab])
    score = np.where(den > 1e-3, score, 0.5 * score + 0.5 * comp[lab])
    flip = score < -a.flip_margin
    thinf = (den > 1e-6) & (th / np.maximum(den, 1e-12) > 0.5)
    stats["patches"] = int(nl); stats["thin_faces"] = int(thinf.sum())
    return flip, thinf


def orient_outward(P, F, lab, nl, vis, vvis, nvirt, rng, stats, a):
    """per patch: +1 keep / -1 flip, from scan-camera visibility of each side and virtual far cameras"""
    Nf, ar = tri_normals(P, F)
    cen = P[F].mean(1)
    flipc = np.zeros(nl, bool)
    picks = []
    for l in range(nl):
        fi = np.flatnonzero(lab == l)
        if len(fi) > 120:
            fi = rng.choice(fi, 120, replace=False, p=ar[fi] / ar[fi].sum())
        picks.append(fi)
    allf = np.concatenate(picks)
    lid = np.repeat(np.arange(nl), [len(p) for p in picks])
    x, n = cen[allf], Nf[allf]
    eps = 0.004
    sc = np.zeros(len(allf))
    if vis is not None:
        cp = np.minimum(vis.count(x + eps * n, n), 3); cm = np.minimum(vis.count(x - eps * n, -n), 3)
        sc += (cp - cm) / 3.0
    vp = vvis.count(x + eps * n, n); vm = vvis.count(x - eps * n, -n)
    sc += 0.6 * (vp - vm) / nvirt
    w = ar[allf]
    score = np.bincount(lid, sc * w, nl) / np.maximum(np.bincount(lid, w, nl), 1e-12)
    flipc = score < -a.flip_margin
    big = np.bincount(lab, ar, nl)
    stats["patch_scores"] = [(round(float(big[l]), 3), round(float(score[l]), 2)) for l in np.argsort(-big)[:4]]
    stats["patches"] = int(nl); stats["patches_flipped"] = int(flipc.sum())
    return flipc


# ------------------------------------------------------------------ 4 hole patches
def trace_loops(FN):
    f, a, b, _, _ = half_edges(FN)
    g, cnt = edge_groups(a, b, FN.max() + 1)
    bd = np.flatnonzero(cnt[g] == 1)
    nbr = {}
    dirn = {}
    for h in bd.tolist():
        u, v = int(a[h]), int(b[h])
        nbr.setdefault(u, []).append(v); nbr.setdefault(v, []).append(u)
        dirn[(u, v)] = 1
    loops, seen = [], set()
    for s in list(nbr):
        if s in seen or len(nbr[s]) != 2:
            continue
        loop, prev, cur, ok = [s], None, s, True
        seen.add(s)
        while True:
            nx = [w for w in nbr[cur] if w != prev]
            if len(nbr[cur]) != 2:
                ok = False; break
            nxt = nx[0] if prev is not None else nbr[cur][0]
            if nxt == s:
                break
            if nxt in seen:
                ok = False; break
            loop.append(nxt); seen.add(nxt); prev, cur = cur, nxt
        if ok and len(loop) >= 3:
            # orientation: along = scan faces traverse the loop in loop order
            along = sum(1 if (loop[i], loop[(i + 1) % len(loop)]) in dirn else -1 for i in range(len(loop)))
            loops.append((np.array(loop), along > 0))
    return loops


def ring_patch(B, h):
    """disc of concentric rings inside boundary polyline B (n,3). Returns interior X, tris (indices: 0..n-1 boundary,
    n.. interior), with every triangle traversing boundary edge i->i+1 forward."""
    n = len(B)
    seg = np.linalg.norm(np.roll(B, -1, 0) - B, axis=1); per = seg.sum()
    t0 = np.r_[0, np.cumsum(seg)[:-1]] / per
    c = B.mean(0)
    R = np.linalg.norm(B - c, axis=1).mean()
    K = int(np.clip(round(R / h), 1, 40))
    if n <= 4 or K == 1:
        return c[None], np.c_[np.arange(n), (np.arange(n) + 1) % n, np.full(n, n)]
    Bc = np.vstack([B, B[:1]]); tc = np.r_[t0, 1.0]
    rings_t, rings_i, X = [t0], [np.arange(n)], []
    nxt = n; prev_n = n
    for k in range(1, K):
        s = k / K
        nk = int(max(3, min(prev_n, round(per * (1 - s) / h))))
        u = np.arange(nk) / nk
        Bu = np.c_[[np.interp(u, tc, Bc[:, d]) for d in range(3)]].T
        X.append(c + (1 - s) * (Bu - c))
        rings_t.append(u); rings_i.append(np.arange(nxt, nxt + nk)); nxt += nk; prev_n = nk
    X.append(c[None]); ci = nxt
    X = np.vstack(X)
    T = []
    for (ta, ia), (tb, ib) in zip(zip(rings_t[:-1], rings_i[:-1]), zip(rings_t[1:], rings_i[1:])):
        nA, nB = len(ia), len(ib); i = j = 0
        while i < nA or j < nB:
            tan = ta[i + 1] if i + 1 < nA else 1.0
            tbn = tb[j + 1] if j + 1 < nB else 1.0
            if j >= nB or (i < nA and tan <= tbn):
                T.append((ia[i % nA], ia[(i + 1) % nA], ib[j % nB])); i += 1
            else:
                T.append((ia[i % nA], ib[(j + 1) % nB], ib[j % nB])); j += 1
    il = rings_i[-1]
    T += [(il[j], il[(j + 1) % len(il)], ci) for j in range(len(il))]
    return X, np.array(T)


def _simple(uv):
    """True if the closed polygon uv (n,2) has no crossing non-adjacent edges"""
    n = len(uv)
    A, B = uv, np.roll(uv, -1, 0)
    def orient(p, q, r):
        return (q[..., 0] - p[..., 0]) * (r[..., 1] - p[..., 1]) - (q[..., 1] - p[..., 1]) * (r[..., 0] - p[..., 0])
    i, j = np.triu_indices(n, 2)
    ok = ~((i == 0) & (j == n - 1))
    i, j = i[ok], j[ok]
    for k in range(0, len(i), 400000):
        a, b, c, d = A[i[k:k + 400000]], B[i[k:k + 400000]], A[j[k:k + 400000]], B[j[k:k + 400000]]
        o1, o2, o3, o4 = orient(a, b, c), orient(a, b, d), orient(c, d, a), orient(c, d, b)
        if np.any((o1 * o2 < 0) & (o3 * o4 < 0)):
            return False
    return True


def _incircle(a, b, c, d):
    m = np.array([[a[0] - d[0], a[1] - d[1], (a[0] - d[0]) ** 2 + (a[1] - d[1]) ** 2],
                  [b[0] - d[0], b[1] - d[1], (b[0] - d[0]) ** 2 + (b[1] - d[1]) ** 2],
                  [c[0] - d[0], c[1] - d[1], (c[0] - d[0]) ** 2 + (c[1] - d[1]) ** 2]])
    return np.linalg.det(m)


def _lawson(uv, T, bset):
    """Delaunay edge flips in 2D; boundary polygon edges (bset) are never flipped. T CCW, list of lists."""
    for _ in range(60):
        emap = {}
        for t, (a, b, c) in enumerate(T):
            for u, v in ((a, b), (b, c), (c, a)):
                emap.setdefault((min(u, v), max(u, v)), []).append(t)
        touched, flips = set(), 0
        for e, ts in emap.items():
            if len(ts) != 2 or e in bset or ts[0] in touched or ts[1] in touched:
                continue
            t1, t2 = ts
            A_, B_ = T[t1], T[t2]
            # rotate t1 so that it is (a, b, c) with edge a->b = e
            for r in range(3):
                if {A_[r], A_[(r + 1) % 3]} == set(e):
                    a, b, c = A_[r], A_[(r + 1) % 3], A_[(r + 2) % 3]; break
            d = [x for x in B_ if x != a and x != b][0]
            if _incircle(uv[a], uv[b], uv[c], uv[d]) > 1e-14:
                T[t1] = [a, d, c]; T[t2] = [d, b, c]
                touched.update((t1, t2)); flips += 1
        if not flips:
            break
    return T


def _crossing_pairs(Q):
    """index pairs (i, j), i < j, of crossing non-adjacent edges of the closed polygon Q (k,2)"""
    k = len(Q)
    if k < 4:
        return np.zeros((0, 2), int)
    A, B = Q, np.roll(Q, -1, 0)

    def orient(p, q, r):
        return (q[..., 0] - p[..., 0]) * (r[..., 1] - p[..., 1]) - (q[..., 1] - p[..., 1]) * (r[..., 0] - p[..., 0])
    i, j = np.triu_indices(k, 2)
    ok = ~((i == 0) & (j == k - 1))
    i, j = i[ok], j[ok]
    a, b, c, d = A[i], B[i], A[j], B[j]
    hit = (orient(a, b, c) * orient(a, b, d) < 0) & (orient(c, d, a) * orient(c, d, b) < 0)
    return np.c_[i[hit], j[hit]]


def planar_patch(B, h, max_skip=0.34):
    """Height-field patch over the loop's best projection plane: earcut + centroid refinement + Delaunay flips,
    heights harmonic from the boundary. Where the projected loop folds over itself (jagged rims), the short twisted
    run is cut off the main polygon and closed by a small fan that still uses the original boundary vertices.
    Returns (X interior, T) with boundary edge i->i+1 traversed forward, or None."""
    import mapbox_earcut as earcut
    n = len(B); c = B.mean(0)
    _, _, Vt = np.linalg.svd(B - c, full_matrices=False)
    best = None
    for nrm in (Vt[2], np.array([0, 0, 1.0]), np.array([1.0, 0, 0]), np.array([0, 1.0, 0])):
        up = np.array([0, 0, 1.0]) if abs(nrm[2]) < 0.9 else np.array([1.0, 0, 0])
        e1 = np.cross(up, nrm); e1 /= np.linalg.norm(e1); e2 = np.cross(nrm, e1)
        uv = np.c_[(B - c) @ e1, (B - c) @ e2]
        area2 = abs(np.sum(uv[:, 0] * np.roll(uv[:, 1], -1) - np.roll(uv[:, 0], -1) * uv[:, 1]))
        if area2 < 1e-8:
            continue
        nc = len(_crossing_pairs(uv))
        if best is None or nc < best[0]:
            best = (nc, nrm, e1, e2, uv)
        if nc == 0:
            break
    if best is None:
        return None
    _, nrm, e1, e2, uv = best
    kept = np.arange(n)
    for _ in range(300):
        cp = _crossing_pairs(uv[kept])
        if not len(cp):
            break
        k = len(kept)
        i, j = cp[0]
        inner = j - i                                   # positions i+1..j
        if inner <= k - inner:
            kept = np.r_[kept[:i + 1], kept[j + 1:]]
        else:
            kept = kept[i + 1:j + 1]
        if len(kept) < 3 or len(kept) < (1 - max_skip) * n:
            return None
    else:
        return None
    Q = uv[kept]
    area2 = np.sum(Q[:, 0] * np.roll(Q[:, 1], -1) - np.roll(Q[:, 0], -1) * Q[:, 1])
    if abs(area2) < 1e-10:
        return None
    if area2 < 0:                                       # make the kept polygon CCW in (e1, e2)
        e2, nrm = -e2, -nrm; uv = uv * np.array([1, -1])
    k = len(kept)
    tri = earcut.triangulate_float64(uv[kept], np.array([k], np.uint32)).reshape(-1, 3)
    if len(tri) != k - 2:
        return None
    T = []
    for t in kept[tri].tolist():
        a, b, cc = t
        o = (uv[b, 0] - uv[a, 0]) * (uv[cc, 1] - uv[a, 1]) - (uv[b, 1] - uv[a, 1]) * (uv[cc, 0] - uv[a, 0])
        T.append([a, b, cc] if o > 0 else [a, cc, b])
    bset = {(min(int(kept[q]), int(kept[(q + 1) % k])), max(int(kept[q]), int(kept[(q + 1) % k]))) for q in range(k)}
    uvl = [x for x in uv]
    amax = 1.2 * (3 ** 0.5 / 4) * h * h
    T = _lawson(uvl, T, bset)
    for _ in range(14):
        Ta = np.array(T); U = np.array(uvl)
        ar = 0.5 * np.abs((U[Ta[:, 1], 0] - U[Ta[:, 0], 0]) * (U[Ta[:, 2], 1] - U[Ta[:, 0], 1])
                          - (U[Ta[:, 1], 1] - U[Ta[:, 0], 1]) * (U[Ta[:, 2], 0] - U[Ta[:, 0], 0]))
        big = np.flatnonzero(ar > amax)
        if not len(big) or len(uvl) > 6000:
            break
        newT = [T[i] for i in np.flatnonzero(ar <= amax)]
        for i in big:
            a, b, cc = T[i]
            p = len(uvl); uvl.append((U[a] + U[b] + U[cc]) / 3)
            newT += [[a, b, p], [b, cc, p], [cc, a, p]]
        T = _lawson(uvl, newT, bset)
    # fans over the cut-off twisted runs (original boundary order a, r1..rk, b)
    for q in range(k):
        a_, b_ = int(kept[q]), int(kept[(q + 1) % k])
        run = []
        x = (a_ + 1) % n
        while x != b_:
            run.append(x); x = (x + 1) % n
        if run:
            seq = run + [b_]
            T += [[a_, seq[s], seq[s + 1]] for s in range(len(seq) - 1)]
    U = np.array(uvl); T = np.array(T)
    m = len(U) - n
    if m <= 0:
        return np.zeros((0, 3)), T
    hb = (B - c) @ nrm                                  # harmonic heights from the boundary
    E = np.unique(np.sort(T[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2), 1), axis=0)
    L_ = laplacian(len(U), E).tocsr()
    I = np.arange(n, n + m)
    hi = spsolve(L_[I][:, I].tocsc(), -L_[I][:, :n] @ hb)
    X = c + U[n:, :1] * e1 + U[n:, 1:2] * e2 + np.atleast_1d(hi)[:, None] * nrm
    return X, T


def laplacian(nv, E):
    A = coo_matrix((np.ones(2 * len(E)), (np.r_[E[:, 0], E[:, 1]], np.r_[E[:, 1], E[:, 0]])), shape=(nv, nv)).tocsr()
    A.data[:] = 1.0
    deg = np.asarray(A.sum(1)).ravel()
    return diags(1 / np.maximum(deg, 1)) @ A - identity(nv)


class Hull:
    def __init__(self, pts):
        self.eq = ConvexHull(pts).equations

    def exit(self, x, d):
        nd = d @ self.eq[:, :3].T; nx = x @ self.eq[:, :3].T + self.eq[:, 3]
        with np.errstate(divide="ignore", invalid="ignore"):
            t = np.where(nd > 1e-9, -nx / nd, np.inf)
        return np.clip(t.min(1), 0, None)


def vertex_normals(P, F):
    cr = np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]])
    N = np.zeros_like(P)
    for k in range(3):
        np.add.at(N, F[:, k], cr)
    return N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-15)


def fill_loop(L, forward, Pv, FN, vfaces, hull, vis, a, rec, scan_tree=None):
    """Patch for loop L (split-vertex ids). Returns (positions of all patch verts, tris in local idx, n_boundary)."""
    B = Pv[L]
    if not forward:                       # build the patch so its winding is opposite to the scan along each edge
        pass
    seg = np.linalg.norm(np.roll(B, -1, 0) - B, axis=1); per = seg.sum()
    h = float(np.clip(np.median(seg) * 1.5, 0.012, 0.05))
    h = max(h, per / 400)
    pl = planar_patch(B, h) if a.planar else None
    if pl is not None:
        X, T = pl
        if forward:
            T = T[:, ::-1]
        rec["planar"] = rec.get("planar", 0) + 1
        return np.vstack([B, X]), T, len(L), 0
    X, T = ring_patch(B, h)
    if forward:                           # scan traverses i->i+1: patch must traverse i+1->i
        T = T[:, ::-1]
    n = len(L); m = len(X)
    # local graph: patch + scan faces around the loop (1-ring) for a smooth continuation
    ring_faces = np.unique(np.concatenate([vfaces[v] for v in L]))
    RF = FN[ring_faces]
    gid = {int(v): i for i, v in enumerate(L)}
    extra = [v for v in np.unique(RF).tolist() if v not in gid]
    for v in extra:
        gid[v] = n + m + len(gid) - n
    nv = n + m + len(extra)
    loc = np.zeros(nv, int)
    mp = np.vectorize(lambda v: gid[int(v)], otypes=[int])
    RFl = mp(RF) if len(RF) else np.zeros((0, 3), int)
    TP = np.where(T < n, T, T)            # patch tris already in 0..n+m-1
    allT = np.vstack([TP, RFl])
    E = np.unique(np.sort(allT[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2), 1), axis=0)
    Pos = np.vstack([B, X, Pv[extra]]) if extra else np.vstack([B, X])
    L_ = laplacian(nv, E).tocsr()
    I = np.arange(n, n + m); Fx = np.r_[np.arange(n), np.arange(n + m, nv)]
    big = per > a.harmonic_perim
    rows = np.arange(n, n + m) if big else np.arange(0, n + m)    # membrane for big loops, thin plate for small
    M = L_[rows]
    Q = (M.T @ M).tocsr()
    QII = Q[I][:, I]; QIF = Q[I][:, Fx]
    rhs0 = -QIF @ Pos[Fx]
    reg = 1e-6 * identity(m)
    Xi = np.atleast_2d(spsolve((QII + reg).tocsc(), rhs0))
    Pos[I] = Xi.reshape(m, 3)
    use_prior = per > a.prior_perim and hull is not None and a.prior_w > 0
    prior_used = 0
    if use_prior:
        PT = T
        for it in range(a.prior_iters):
            Nv = vertex_normals(Pos[:n + m], PT)[I]
            t = hull.exit(Pos[I], Nv)
            t = np.minimum(t, a.prior_reach)
            tgt = Pos[I] + t[:, None] * Nv
            w = np.full(m, a.prior_w)
            near = scan_tree.query(tgt, distance_upper_bound=a.prior_clear)[0] < a.prior_clear
            w[near] = 0.0                                    # hull spot already has real surface: no envelope
            if vis is not None:
                chk = np.flatnonzero(w > 0)
                if len(chk):
                    seen = vis.count(tgt[chk] - 0.02 * Nv[chk], Nv[chk]) >= a.min_views
                    w[chk[seen]] = 0.0                       # cameras saw that spot empty: real gap
            w[t < 0.01] = 0.0
            prior_used = int((w > 0).sum())
            if prior_used == 0:
                break
            Xi = spsolve((QII + reg + diags(w)).tocsc(), rhs0 + w[:, None] * tgt)
            Pos[I] = Xi.reshape(m, 3)
    Pp = Pos[:n + m]
    return Pp, T, n, prior_used


# ------------------------------------------------------------------ quick self-check (same idea as eval_models.py)
def _views():
    out = []
    for el, az0 in ((10, 0), (35, 45), (60, 0)):
        for az in range(az0, 360, 90):
            e, a_ = math.radians(el), math.radians(az)
            out.append((-math.cos(e) * math.cos(a_), -math.cos(e) * math.sin(a_), -math.sin(e)))
    out.append((0.0, 0.0, -1.0))
    return np.array(out)


VIEWS = _views()


def quick_score(P, F, spacing=0.005, pix=0.015):
    """share of view rays whose first layer is a back face or that cross two front layers in a row"""
    import eval_models as em
    X, N, _ = em.lattice_samples([{"P": P, "F": F, "COL": None, "UV": None, "img": None, "color": np.zeros(3)}],
                                 spacing, cap=3_000_000)
    if len(X) < 50:
        return 1e9
    bad = tot = 0
    for v in VIEWS:
        r = em.analyse(X, N, v, pix=pix)
        bad += r["bad"]; tot += r["n_pix"]
    return 100.0 * bad / max(tot, 1)


# ------------------------------------------------------------------ one object
def process(path, o, cams_w, walls_w, a):
    prims = [p for p in read_glb(path) if len(p["F"])]
    st = {"kind": o.get("kind")}
    if not prims:
        return None, st
    voff = np.r_[0, np.cumsum([len(p["P"]) for p in prims])]
    V = np.vstack([p["P"] for p in prims])
    F = np.vstack([p["F"] + voff[i] for i, p in enumerate(prims)])
    pid = np.concatenate([np.full(len(p["F"]), i) for i, p in enumerate(prims)])
    W = weld(V); nW = W.max() + 1
    rep = np.zeros(nW, np.int64); rep[W] = np.arange(len(W)); Pw = V[rep]
    FW = W[F]
    keep = clean(Pw, FW, st)
    if keep.sum() < 4:
        return None, st
    kf = np.flatnonzero(keep)
    FWk = FW[kf]
    corner, _, _, _ = split_vertices(FWk)
    nN = corner.max() + 1
    Pv = np.zeros((nN, 3)); Pv[corner.ravel()] = Pw[FWk.ravel()]
    FN = corner.copy()
    flip, lab, nl = propagate(FN)
    FN[flip] = FN[flip][:, ::-1]                          # FN: consistent winding inside each component
    rng = np.random.default_rng(0)
    on_floor = o.get("on_floor", True) is not False
    S0 = sample(prims, 0.02)[0]
    cams = to_local(o, cams_w) if len(cams_w) else np.zeros((0, 3))
    cams = cams[np.linalg.norm(cams[:, :2], axis=1) < 9] if len(cams) else cams
    A_ = to_local(o, walls_w[:, 0, :2]) if len(walls_w) else np.zeros((0, 2))
    B_ = to_local(o, walls_w[:, 1, :2]) if len(walls_w) else np.zeros((0, 2))
    vis = Visibility(cams, A_, B_, S0, nadir_deg=a.nadir) if len(cams) else None
    ctr = 0.5 * (S0.min(0) + S0.max(0)); rad = 0.5 * np.linalg.norm(S0.max(0) - S0.min(0))
    virt = sphere_cams(ctr, rad + 1.5)
    if on_floor:
        virt = virt[virt[:, 2] > 0.02]                    # nothing sees through the floor
    vvis = Visibility(virt, np.zeros((0, 2)), np.zeros((0, 2)), S0, nadir_deg=0.01, max_dist=rad + 4)
    cf_vote = orient_outward(Pv, FN, lab, nl, vis, vvis, len(virt), rng, st, a)
    cf_raw = np.bincount(lab, flip.astype(float), nl) / np.maximum(np.bincount(lab, minlength=nl), 1) > 0.5

    # boundary loops -> patches (computed once, relative to FN's winding)
    loops = [] if a.no_fill else trace_loops(FN)
    vfaces = [[] for _ in range(nN)]
    for fi, tri in enumerate(FN.tolist()):
        for v in tri:
            vfaces[v].append(fi)
    vfaces = [np.array(x, int) for x in vfaces]
    scan_tree = cKDTree(S0)
    st.update(loops=len(loops), open_m_before=0.0)
    cand = []
    for L, fwd in loops:
        B = Pv[L]
        per = float(np.linalg.norm(np.roll(B, -1, 0) - B, axis=1).sum())
        st["open_m_before"] += per
        comp = int(lab[vfaces[L[0]][0]])
        try:
            Pp, T, n, _ = fill_loop(L, fwd, Pv, FN, vfaces, None, vis, a, st, scan_tree)
        except Exception as e:
            if a.verbose:
                print("     fill failed", per, e)
            cand.append(dict(L=L, fwd=fwd, comp=comp, P=None, sheet=False, ok=False)); continue
        sheet = False
        floor_loop = on_floor and B[:, 2].mean() < 0.12 and np.ptp(B[:, 2]) < 0.12     # the base on the floor
        if per > a.sheet_perim and len(Pp) > n and not floor_loop:
            R = np.linalg.norm(B - B.mean(0), axis=1).mean()
            ratio = float(np.median(scan_tree.query(Pp[n:])[0])) / R
            sheet = ratio < a.sheet_ratio
            if a.verbose:
                print(f"     loop per {per:.2f} R {R:.2f} sheet-ratio {ratio:.3f}")
        ok = True
        if per > a.check_perim and vis is not None:
            Nf, ar = tri_normals(Pp, T)
            cen = Pp[T].mean(1)
            s1 = vis.count(cen + 0.01 * Nf, Nf); s2 = vis.count(cen - 0.01 * Nf, -Nf)
            fr = ar[np.maximum(s1, s2) >= a.min_views].sum() / max(ar.sum(), 1e-12)
            ok = fr <= a.max_seen
        cand.append(dict(L=L, fwd=fwd, comp=comp, P=Pp, T=T, sheet=sheet, ok=ok))
    st["open_m_before"] = round(st["open_m_before"], 2)
    sheet_comps = sorted({c["comp"] for c in cand if c["sheet"]})

    def build(cf, extrude, fill=True, deep=False):
        Fs = FN.copy(); fl = cf[lab]; Fs[fl] = Fs[fl][:, ::-1]
        PP, PF, nb, info = [], [], 0, {"filled": 0, "rejected": 0, "sheets": 0}
        ex = set(sheet_comps) if extrude else set()
        if fill:
            for c in cand:
                if c["comp"] in ex:
                    continue
                if c["P"] is None or not c["ok"]:
                    info["rejected"] += 1; continue
                T = c["T"][:, ::-1] if cf[c["comp"]] else c["T"]
                PP.append(c["P"]); PF.append(T + nb); nb += len(c["P"]); info["filled"] += 1
            for comp in ex:
                lp = [(c["L"], c["fwd"] ^ bool(cf[comp])) for c in cand if c["comp"] == comp]
                Pe, Te = extrude_component(comp, lab, Fs, Pv, lp, a.thickness, S0 if deep else None)
                PP.append(Pe); PF.append(Te + nb); nb += len(Pe); info["sheets"] += 1
        return Fs, fl, PP, PF, info

    st["options"] = {}

    def score(cf, ex, deep=False):
        Fs, fl, PP, PF, info = build(cf, ex, deep=deep)
        Pall = np.vstack([Pv] + PP) if PP else Pv
        Fall = np.vstack([Fs] + ([np.vstack(PF) + len(Pv)] if PF else []))
        return quick_score(Pall, Fall), (fl, PP, PF, info)

    _, ar_f = tri_normals(Pv, FN)
    differ = ar_f[(cf_vote != cf_raw)[lab]].sum() / max(ar_f.sum(), 1e-12)
    cf, oname = cf_vote, "vote"
    best = None
    if a.select and differ > 0.03:                      # weak evidence: let the self-check decide the winding
        s1, r1 = score(cf_vote, False); s2, r2 = score(cf_raw, False)
        st["options"].update(vote=round(s1, 2), raw=round(s2, 2))
        if s2 < s1:
            cf, oname, best = cf_raw, "raw", (s2, "raw") + r2
        else:
            best = (s1, "vote") + r1
    if a.select and a.extrude and sheet_comps:
        if best is None:
            s1, r1 = score(cf, False); st["options"][oname] = round(s1, 2); best = (s1, oname) + r1
        s3, r3 = score(cf, True); st["options"][oname + "+extrude"] = round(s3, 2)
        if s3 < best[0]:
            best = (s3, oname + "+extrude") + r3
        if (o.get("kind") or "") in SOLID:
            s4, r4 = score(cf, True, deep=True); st["options"][oname + "+deep"] = round(s4, 2)
            if s4 < best[0] + a.deep_bonus:                # a real back is preferred when it is about as clean
                best = (s4, oname + "+deep") + r4
    if best is None:
        best = (0.0, oname) + build(cf, False)[1:]
    sc, name, fl, PP, PF, info = best
    st.update(info); st["choice"] = name
    total_flip = flip ^ fl
    st["faces_flipped"] = int(total_flip.sum()); st["faces"] = int(len(FN))

    # oriented scan prims (keep UVs, flip index order)
    Fo = F[kf].copy(); Fo[total_flip] = Fo[total_flip][:, ::-1]
    pk = pid[kf]
    out_prims = []
    for i, p in enumerate(prims):
        Fi = Fo[pk == i] - voff[i]
        p2 = dict(p); p2["F"] = Fi; p2["src"] = np.zeros(len(Fi), np.int8)
        out_prims.append(p2)
    patch = None
    if PP:
        PP = np.vstack(PP); PF = np.vstack(PF)
        S, Ns, Cs, _ = sample(out_prims, 0.01)
        Nv = vertex_normals(PP, PF)
        k = min(32, len(S))
        _, ii = cKDTree(S).query(PP, k=k); ii = ii.reshape(len(PP), k)
        Cn = Cs[ii].astype(float)
        agree = (Ns[ii] * Nv[:, None, :]).sum(2) > 0.5
        agree[agree.sum(1) < 4] = True
        col = np.nanmedian(np.where(agree[..., None], Cn, np.nan), axis=1)
        st["patch_m2"] = round(float(tri_normals(PP, PF)[1].sum()), 3)
        patch = {"P": PP.astype(np.float32), "F": PF.astype(np.uint32), "UV": None,
                 "COL": srgb_to_linear(col).astype(np.float32), "name": "patch"}
    return (out_prims, patch), st


def extrude_component(comp, lab, FN, Pv, loops, t, back_pts=None):
    """thin shell for an open sheet: reversed copy offset by t along -normal + side strips along every boundary
    loop (strips share the scan's boundary vertices). With back_pts (solid furniture whose scan is one facade):
    the copy is the sheet projected onto a vertical back plane at the far side of the piece instead (a prism)."""
    Fc = FN[lab == comp]
    verts, Fl = np.unique(Fc, return_inverse=True); Fl = Fl.reshape(-1, 3)
    nc = len(verts)
    Pc = Pv[verts]
    nv = vertex_normals(Pc, Fl)
    E = np.unique(np.sort(Fl[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2), 1), axis=0)
    A = coo_matrix((np.ones(2 * len(E)), (np.r_[E[:, 0], E[:, 1]], np.r_[E[:, 1], E[:, 0]])), shape=(nc, nc)).tocsr()
    for _ in range(4):
        nv = nv + A @ nv
        nv /= np.maximum(np.linalg.norm(nv, axis=1, keepdims=True), 1e-12)
    Po = Pc - t * nv
    if back_pts is not None:
        _, ar = tri_normals(Pc, Fl)
        nb = (tri_normals(Pc, Fl)[0] * ar[:, None]).sum(0) / max(ar.sum(), 1e-12)
        coh = np.linalg.norm(nb[:2])
        if coh > 0.45:
            d = np.r_[nb[:2] / coh, 0.0]                  # horizontal facade direction (outward)
            back = (back_pts @ -d).max()
            depth = back - (Pc @ -d)
            if np.median(depth) > 0.06:
                Po = Pc - np.maximum(depth, 0.02)[:, None] * d
    T = [Fl[:, ::-1] + nc]
    gl = {int(v): i for i, v in enumerate(verts)}
    for L, fwd in loops:
        l = np.array([gl[int(v)] for v in L]); l1 = np.roll(l, -1)
        if fwd:
            T.append(np.c_[l1, l, l + nc]); T.append(np.c_[l1, l + nc, l1 + nc])
        else:
            T.append(np.c_[l, l1, l1 + nc]); T.append(np.c_[l, l1 + nc, l + nc])
    return np.vstack([Pc, Po]), np.vstack(T)


def write_out(path, out_prims, patch):
    out = []
    for p in out_prims:
        if not len(p["F"]):
            continue
        used, Fl = np.unique(p["F"], return_inverse=True); Fl = Fl.reshape(-1, 3)
        d = {"P": p["P"][used].astype(np.float32), "F": Fl.astype(np.uint32),
             "UV": None if p["UV"] is None else p["UV"][used].astype(np.float32)}
        if p.get("jpeg") is not None:
            d["image"] = p["jpeg"]
        else:
            d["color"] = p["color"]
        out.append(d)
    if patch is not None:
        out.append(patch)
    write_glb(path, out)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", default="zvKHR9DHNjJ")
    ap.add_argument("--ids", type=int, nargs="*")
    ap.add_argument("--nadir", type=float, default=35)
    ap.add_argument("--min-views", type=int, default=2)
    ap.add_argument("--prior-perim", type=float, default=0.8, help="loops longer than this get the hull/floor prior (m)")
    ap.add_argument("--prior-w", type=float, default=0.0)
    ap.add_argument("--prior-iters", type=int, default=5)
    ap.add_argument("--prior-clear", type=float, default=0.04)
    ap.add_argument("--prior-reach", type=float, default=0.6)
    ap.add_argument("--harmonic-perim", type=float, default=0.3, help="loops longer than this are faired as a membrane")
    ap.add_argument("--check-perim", type=float, default=0.4, help="loops longer than this are checked against seen-empty space")
    ap.add_argument("--max-seen", type=float, default=0.35)
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--no-select", dest="select", action="store_false", help="skip the per-object self-check")
    ap.add_argument("--no-extrude", dest="extrude", action="store_false")
    ap.add_argument("--sheet-perim", type=float, default=0.5)
    ap.add_argument("--sheet-ratio", type=float, default=0.12)
    ap.add_argument("--thickness", type=float, default=0.02)
    ap.add_argument("--deep-bonus", type=float, default=1.0, help="prefer the back-plane prism if its self-check is within this many points")
    ap.add_argument("--regions", action="store_true")
    ap.add_argument("--flip-margin", type=float, default=0.0)
    ap.add_argument("--orient-samples", type=int, default=2500)
    ap.add_argument("--orient-diffuse", type=int, default=20)
    ap.add_argument("--no-planar", dest="planar", action="store_false")
    ap.add_argument("--no-fill", action="store_true")
    a = ap.parse_args()
    md = os.path.join(f"pano_{a.model}", "mesh_diff")
    scene = json.load(open(os.path.join(md, "scene_tiles.json")))
    objs = {o["id"]: o for o in json.load(open(os.path.join(md, "objects.json")))["objects"]}
    W = [w for w in json.load(open(os.path.join(md, "plan.json")))["walls"] if w.get("physical", True)]
    walls = np.array([[[*w["a"][:2], 0], [*w["b"][:2], 0]] for w in W], float).reshape(-1, 2, 3)
    cams = np.array([p["position"] for p in json.load(open(os.path.join(md, "pano_poses.json")))["panos"] if p.get("position")], float)
    od = os.path.join(md, "objects_variant_b"); os.makedirs(od, exist_ok=True)
    out_p = os.path.join(md, "scene_variant_b.json")
    prev = {r["id"]: r for r in json.load(open(out_p))["objects"]} if a.ids and os.path.exists(out_p) else {}
    rows, t_all = [], time.time()
    for r in scene["objects"]:
        o = objs.get(r["id"])
        if a.ids and r["id"] not in a.ids:
            rows.append(prev.get(r["id"], dict(r))); continue
        if not r.get("file") or o is None:
            rows.append(dict(r)); continue
        t = time.time()
        fn = "objects_variant_b/" + os.path.basename(r["file"])
        nr = dict(r); nr.update(file=fn, original_file=r["file"])
        try:
            res, st = process(os.path.join(md, r["file"]), o, cams, walls, a)
            if res is None:
                raise RuntimeError("nothing to repair")
            write_out(os.path.join(md, fn), *res)
        except Exception as e:
            import shutil, traceback; traceback.print_exc()
            shutil.copyfile(os.path.join(md, r["file"]), os.path.join(md, fn))
            st = {"error": str(e)}
        nr["variant_b"] = st
        rows.append(nr)
        print(f"  obj {r['id']:3d} {str(o.get('kind')):12s} flipped {st.get('faces_flipped', 0):5d}/{st.get('faces', 0):5d} "
              f"loops {st.get('loops', 0):4d} filled {st.get('filled', 0):4d} rej {st.get('rejected', 0):3d} "
              f"sheets {st.get('sheets', 0):2d} -> {st.get('choice')} {st.get('options')}  {time.time() - t:.1f}s", flush=True)
    json.dump({"frame": scene.get("frame"), "method": "variant_b_stitch.py: cleaned scan mesh, consistent outward winding, "
               "every boundary loop closed by a faired patch sharing the loop vertices", "objects": rows},
              open(out_p, "w"), indent=1)
    print(f"done in {time.time() - t_all:.0f}s -> {out_p}")


if __name__ == "__main__":
    main()
