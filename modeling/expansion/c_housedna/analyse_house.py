"""House-DNA analyser (variant c_housedna).

Measures the existing scanned house (Matterport zvKHR9DHNjJ) and writes house_dna.json:
ceiling heights, wall thicknesses, doors, windows, floor / wall / trim colours, baseboard height,
footprint + exterior roof/cladding properties (with the evidence used), plus a few texture assets.

Run from anywhere:  python Code/expansion/c_housedna/analyse_house.py
Outputs (all in this folder): house_dna.json, assets/*.jpg|bin|json, evidence/*.jpg, debug/*.png
"""
import json, os, sys, math
import numpy as np
import cv2
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
SID = 'zvKHR9DHNjJ'
PLAN = os.path.join(ROOT, f'pano_{SID}', 'mesh_diff', 'plan.json')
MESH = os.path.join(ROOT, f'assets_{SID}', 'tiles', 'furnished_mesh.npz')
TEXDIR = os.path.join(ROOT, f'assets_{SID}', 'tiles', 'furnished_tex')
DRONE = os.path.join(ROOT, f'assets_{SID}', 'hackathon_site', 'drone')
OUT = os.path.join(HERE, 'house_dna.json')
DBG = os.path.join(HERE, 'debug'); EVD = os.path.join(HERE, 'evidence'); AST = os.path.join(HERE, 'assets')
for d in (DBG, EVD, AST):
    os.makedirs(d, exist_ok=True)

RES = 0.05  # occupancy resolution (m)


def log(*a):
    print(*a, flush=True)


# ----------------------------------------------------------------------------------------------- data
def load():
    plan = json.load(open(PLAN))
    d = np.load(MESH)
    V, F, UV, T, tex = d['V'].astype(np.float64), d['F'], d['UV'], d['T'], d['tex']
    # per-vertex colour sampled from the MatterPak atlases (vertex belongs to one texture via its faces)
    ims = [np.asarray(Image.open(os.path.join(TEXDIR, str(n))).convert('RGB')) for n in tex]
    vt = np.full(len(V), -1, np.int32)
    vt[F.ravel()] = np.repeat(T, 3)
    col = np.zeros((len(V), 3), np.float32)
    for ti, name in enumerate(tex):
        m = np.where(vt == ti)[0]
        if not len(m):
            continue
        im = ims[ti]
        h, w = im.shape[:2]
        u = np.clip((UV[m, 0] % 1.0) * (w - 1), 0, w - 1).astype(int)
        v = np.clip((UV[m, 1] % 1.0) * (h - 1), 0, h - 1).astype(int)  # npz UVs are already image-row oriented
        col[m] = im[v, u]
    tri = V[F]
    C = tri.mean(1)
    n = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    A = np.linalg.norm(n, axis=1) / 2
    n = n / np.maximum(2 * A, 1e-12)[:, None]
    TC = col[F].mean(1)
    log(f'mesh: {len(V)} verts, {len(F)} tris, textured colours sampled')
    return dict(plan=plan, V=V, F=F, UV=UV, T=T, tex=tex, C=C, N=n, A=A, TC=TC, VC=col, ims=ims)


def pip(poly, pts):
    """points-in-polygon (even-odd), poly Nx2, pts Mx2"""
    poly = np.asarray(poly); x, y = pts[:, 0], pts[:, 1]
    inside = np.zeros(len(pts), bool)
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]; xj, yj = poly[j]
        c = ((yi > y) != (yj > y)) & (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi)
        inside ^= c
        j = i
    return inside


def hexcol(c):
    c = np.nan_to_num(np.asarray(c, float), nan=200.0)
    c = np.clip(np.asarray(c), 0, 255).astype(int)
    return '#%02x%02x%02x' % tuple(c)


def robust_colour(cols, w=None):
    """dominant colour: mode of a coarse 3D histogram, refined by the median of that bin's members"""
    cols = np.asarray(cols, np.float32)
    if len(cols) == 0:
        return None, 0.0
    q = (cols // 16).astype(int)
    key = q[:, 0] * 256 + q[:, 1] * 16 + q[:, 2]
    wts = np.ones(len(cols)) if w is None else w
    # smooth: group neighbour bins by also voting 1-bin-lower brightness
    u, inv = np.unique(key, return_inverse=True)
    s = np.bincount(inv, weights=wts)
    best = np.argmax(s)
    sel = inv == best
    # widen to colours within 22 of that bin centre
    centre = np.median(cols[sel], 0)
    near = np.linalg.norm(cols - centre, axis=1) < 22
    share = float(wts[near].sum() / wts.sum())
    return np.median(cols[near], 0), share


# ----------------------------------------------------------------------------------------------- footprint
def footprint(plan, close_m=0.3):
    rooms = plan['rooms']
    allp = np.concatenate([np.array(r['polygon']) for r in rooms])
    x0, y0 = allp.min(0) - 1.0
    x1, y1 = allp.max(0) + 1.0
    W, H = int((x1 - x0) / 0.02) + 1, int((y1 - y0) / 0.02) + 1
    img = np.zeros((H, W), np.uint8)
    pad = int(close_m / 0.02) + 2
    img = np.zeros((H + 2 * pad, W + 2 * pad), np.uint8); x0 -= pad * 0.02; y0 -= pad * 0.02
    for r in rooms:
        p = ((np.array(r['polygon']) - [x0, y0]) / 0.02).round().astype(np.int32)
        cv2.fillPoly(img, [p], 255)
    kk = int(close_m / 0.02) | 1
    k = cv2.getStructuringElement(cv2.MORPH_RECT, (kk, kk))
    img = cv2.morphologyEx(img, cv2.MORPH_CLOSE, k)
    cs, _ = cv2.findContours(img, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    c = max(cs, key=cv2.contourArea)
    c = cv2.approxPolyDP(c, 3, True)[:, 0, :].astype(float)
    poly = c * 0.02 + [x0, y0]
    # snap to axis-aligned (house is rectilinear): merge near-equal coordinates
    poly = rectilinearise(poly)
    return poly


def rectilinearise(poly):
    p = poly.copy()
    n = len(p)
    for it in range(3):
        for i in range(n):
            a, b = p[i], p[(i + 1) % n]
            if abs(a[0] - b[0]) < abs(a[1] - b[1]):  # vertical edge
                x = (a[0] + b[0]) / 2; p[i, 0] = x; p[(i + 1) % n, 0] = x
            else:
                y = (a[1] + b[1]) / 2; p[i, 1] = y; p[(i + 1) % n, 1] = y
    # drop collinear / duplicate points
    out = []
    for i in range(n):
        a, b, c = p[i - 1], p[i], p[(i + 1) % n]
        if np.linalg.norm(b - a) < 0.03:
            continue
        cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
        if abs(cr) < 1e-4:
            continue
        out.append(b)
    out = np.array(out)
    # ensure CCW
    area = 0.5 * np.sum(out[:, 0] * np.roll(out[:, 1], -1) - np.roll(out[:, 0], -1) * out[:, 1])
    if area < 0:
        out = out[::-1]
    return out


def dist_to_poly_boundary(poly, pts):
    d = np.full(len(pts), 1e9)
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        ab = b - a; L2 = ab @ ab
        if L2 < 1e-10:
            continue
        t = np.clip(((pts - a) @ ab) / L2, 0, 1)
        q = a + t[:, None] * ab
        d = np.minimum(d, np.linalg.norm(pts - q, axis=1))
    return d


# ----------------------------------------------------------------------------------------------- surface sampling
def sample_tris(tri, cols=None, step=0.025):
    """dense barycentric lattice samples on triangles (tri: Nx3x3). returns pts (and colours)"""
    e = np.maximum(np.linalg.norm(tri[:, 1] - tri[:, 0], axis=1),
                   np.maximum(np.linalg.norm(tri[:, 2] - tri[:, 0], axis=1), np.linalg.norm(tri[:, 2] - tri[:, 1], axis=1)))
    m = np.clip(np.ceil(e / step), 1, 80).astype(int)
    P, Cc = [], []
    for k in np.unique(m):
        idx = np.where(m == k)[0]
        ii, jj = np.meshgrid(np.arange(k + 1), np.arange(k + 1), indexing='ij')
        ok = ii + jj <= k
        a = (ii[ok] / k); b = (jj[ok] / k); c = 1 - a - b
        t = tri[idx]
        pts = (a[None, :, None] * t[:, None, 0] + b[None, :, None] * t[:, None, 1] + c[None, :, None] * t[:, None, 2])
        P.append(pts.reshape(-1, 3))
        if cols is not None:
            cc = (a[None, :, None] * cols[idx][:, None, 0] + b[None, :, None] * cols[idx][:, None, 1] + c[None, :, None] * cols[idx][:, None, 2])
            Cc.append(cc.reshape(-1, 3))
    if not P:
        return np.zeros((0, 3)), np.zeros((0, 3))
    return np.concatenate(P), (np.concatenate(Cc) if cols is not None else None)


def wall_frame(w):
    a, b = np.array(w['a']), np.array(w['b'])
    L = np.linalg.norm(b - a); u = (b - a) / L; nrm = np.array([-u[1], u[0]])
    return a, b, L, u, nrm


def surface_samples(M, sel, step=0.025):
    """dense samples on triangles `sel` with true texture colour (UV interpolated per sample)"""
    tri = M['V'][M['F'][sel]]
    uvt = np.concatenate([M['UV'][M['F'][sel]], np.repeat(M['T'][sel][:, None, None], 3, 1).astype(np.float64)], 2)
    P, Q = sample_tris(tri, uvt, step)
    col = np.zeros((len(P), 3), np.float32)
    ti = np.round(Q[:, 2]).astype(int)
    for t in np.unique(ti):
        m = ti == t; im = M['ims'][t]; h, w = im.shape[:2]
        u = np.clip(Q[m, 0] * (w - 1), 0, w - 1).astype(int); v = np.clip(Q[m, 1] * (h - 1), 0, h - 1).astype(int)
        col[m] = im[v, u]
    return P, col


def wall_samples(M, w, extra=0.07, zmax=2.9):
    a, b, L, u, nrm = wall_frame(w)
    C = M['C']
    s = (C[:, :2] - a) @ u; t = (C[:, :2] - a) @ nrm
    half = w['thickness'] / 2 + extra
    sel = np.where((s > -0.3) & (s < L + 0.3) & (np.abs(t) < half + 0.4) & (C[:, 2] < zmax + 0.3))[0]
    P, PC = surface_samples(M, sel)
    s = (P[:, :2] - a) @ u; t = (P[:, :2] - a) @ nrm
    keep = (s >= 0) & (s <= L) & (np.abs(t) <= half) & (P[:, 2] >= 0) & (P[:, 2] <= zmax)
    return s[keep], t[keep], P[keep, 2], PC[keep], L


# ----------------------------------------------------------------------------------------------- openings
def runs(mask):
    """start,end (exclusive) of True runs in a 1D bool array"""
    m = np.concatenate([[False], mask, [False]]).astype(int)
    d = np.diff(m)
    return list(zip(np.where(d == 1)[0], np.where(d == -1)[0]))


def wall_elevation(M, w, fp, zmax=2.9):
    """innermost-surface depth + colour image of a wall seen from the room side(s)"""
    a, b, L, u, nrm = wall_frame(w)
    s, t, z, pc, L = wall_samples(M, w, extra=0.35, zmax=zmax)
    mid = (a + b) / 2
    out_pos = not pip(fp, (mid + nrm * 0.45)[None])[0]
    out_neg = not pip(fp, (mid - nrm * 0.45)[None])[0]
    exterior = out_pos or out_neg
    sgn = 1 if out_pos else -1
    ns = int(L / RES) + 1; nz = int(zmax / RES) + 1
    zi = np.minimum((z / RES).astype(int), nz - 1); si = np.minimum((s / RES).astype(int), ns - 1)
    res = dict(L=L, ns=ns, nz=nz, exterior=exterior, sgn=sgn, a=a, u=u, nrm=nrm)
    # thin-band occupancy (both faces)
    half = w['thickness'] / 2 + 0.07
    thin = np.abs(t) <= half
    occ = np.zeros((nz, ns)); np.add.at(occ, (zi[thin], si[thin]), 1)
    res['occ'] = occ > 0
    # innermost surface seen from the inside (for exterior walls) / from the + side
    tt = t * sgn
    order = np.argsort(-tt)
    dep = np.full((nz, ns), np.nan); col = np.zeros((nz, ns, 3), np.float32)
    dep[zi[order], si[order]] = tt[order]; col[zi[order], si[order]] = pc[order]
    res['depth'] = dep; res['col'] = col
    # interior face = most common depth near -th/2
    dv = dep[np.isfinite(dep)]
    if len(dv):
        h, e = np.histogram(dv, bins=np.arange(-0.45, 0.45, 0.01))
        res['face'] = float(e[np.argmax(h)] + 0.005)
    else:
        res['face'] = -w['thickness'] / 2
    # colour image seen from the other side as well (for interior walls)
    order2 = np.argsort(tt)
    col2 = np.zeros((nz, ns, 3), np.float32)
    col2[zi[order2], si[order2]] = pc[order2]
    res['col_other'] = col2
    return res


def is_trim(c):
    c = np.asarray(c, float)
    return (c.min(-1) > 150) & ((c.max(-1) - c.min(-1)) < 45)


def find_openings(w, E):
    """doors (to floor, header above) and windows (recessed/empty with sill) in one plan wall"""
    ns, nz = E['ns'], E['nz']
    zc = (np.arange(nz) + 0.5) * RES
    out = []
    if not E['exterior']:
        occ = E['occ']
        midz = (zc > 0.9) & (zc < 1.8); lowz = (zc > 0.25) & (zc < 0.7)
        midf = occ[midz].mean(0); lowf = occ[lowz].mean(0)
        col_open = (midf < 0.25) & (lowf < 0.4)
        # close 1-cell gaps
        for i in range(1, ns - 1):
            if not col_open[i] and col_open[i - 1] and col_open[i + 1]:
                col_open[i] = True
        for s0, s1 in runs(col_open):
            wd = (s1 - s0) * RES
            if wd < 0.5 or wd > 3.2:
                continue
            # head: first occupied cell above 1.7 m in each column (median)
            heads = []
            for c in range(s0, s1):
                above = np.where(occ[:, c] & (zc > 1.7))[0]
                heads.append(zc[above[0]] - RES / 2 if len(above) else np.nan)
            heads = np.array(heads)
            if np.mean(np.isfinite(heads)) < 0.6:
                continue  # no header: wall gap / end of wall, not a doorway
            head = float(np.nanmedian(heads))
            if head > 2.6:
                continue
            out.append(dict(kind='door' if wd <= 1.3 else 'cased_opening', s0=s0 * RES, s1=s1 * RES,
                            width=wd, head=head, sill=0.0))
    else:
        col = E['col']; valid = np.isfinite(E['depth'])
        frieze = (zc > 2.02) & (zc < 2.42)
        paint, share = robust_colour(col[frieze][valid[frieze]])
        E['paint'] = paint; E['paint_share'] = share
        if paint is None:
            return out
        d = np.linalg.norm(col - paint, axis=2)
        notpaint = (d > 40) & valid
        hsv = cv2.cvtColor(np.clip(col, 0, 255).astype(np.uint8), cv2.COLOR_RGB2HSV)
        bright = (hsv[..., 2] > 160) & (hsv[..., 1] < 100)
        z0 = int(1.4 / RES)
        cand = np.zeros(ns, bool); sills = np.full(ns, np.nan); heads = np.full(ns, np.nan); br = np.zeros(ns)
        for c in range(ns):
            col_np = notpaint[:, c].copy()
            # bridge single-cell gaps
            col_np[1:-1] |= col_np[:-2] & col_np[2:]
            if not col_np[z0]:
                continue
            lo = z0
            while lo > 0 and col_np[lo - 1]:
                lo -= 1
            hi = z0
            while hi < nz - 1 and col_np[hi + 1]:
                hi += 1
            sill, head = lo * RES, (hi + 1) * RES
            if 1.75 <= head <= 2.4 and (0.35 <= sill <= 1.3) and head - sill >= 0.75:
                cand[c] = True; sills[c] = sill; heads[c] = head
                br[c] = bright[lo:hi + 1, c].mean()
        cand[1:-1] |= cand[:-2] & cand[2:]
        midz = (zc > 1.0) & (zc < 1.8)
        npf = notpaint[midz].mean(0)
        found = []
        for s0, s1 in runs(cand):
            if (s1 - s0) * RES < 0.3 or np.nanmean(br[s0:s1]) < 0.35:
                continue  # dark / colourful = picture or furniture, not daylight + white sash
            # grow sideways over the white casing / sash until wall paint resumes
            while s0 > 0 and npf[s0 - 1] > 0.6:
                s0 -= 1
            while s1 < ns and npf[s1] > 0.6:
                s1 += 1
            if found and s0 <= found[-1][1]:
                found[-1] = (found[-1][0], max(s1, found[-1][1]), found[-1][2] + [(s0, s1)])
            else:
                found.append((s0, s1, [(s0, s1)]))
        for s0, s1, parts in found:
            wd = (s1 - s0) * RES
            if wd < 0.45 or wd > 3.2:
                continue
            ok = cand[s0:s1]
            out.append(dict(kind='window', s0=s0 * RES, s1=s1 * RES, width=wd,
                            sill=float(np.nanmedian(sills[s0:s1][ok])), head=float(np.nanmedian(heads[s0:s1][ok])),
                            bright=float(np.nanmean(br[s0:s1][ok]))))
    return out


# ----------------------------------------------------------------------------------------------- trim / casing
def trim_profile_along(s, z, pc, s_edge, direction, zlo=1.0, zhi=1.8, maxd=0.3):
    """fraction of trim-coloured samples per 1 cm step moving away from an opening edge"""
    d = (s - s_edge) * direction
    m = (d >= 0) & (d < maxd) & (z > zlo) & (z < zhi)
    if m.sum() < 30:
        return None
    b = (d[m] / 0.01).astype(int)
    tr = is_trim(pc[m]).astype(float)
    num = np.bincount(b, tr, int(maxd / 0.01)); den = np.bincount(b, None, int(maxd / 0.01))
    return np.where(den > 0, num / np.maximum(den, 1), np.nan)


def run_width(prof, thr=0.5):
    if prof is None:
        return None
    n = 0
    for v in prof:
        if np.isnan(v) or v >= thr:
            n += 1
        else:
            break
    return n * 0.01 if n >= 3 else None


def measure_casing(M, w, op):
    s, t, z, pc, L = wall_samples(M, w, extra=0.04)
    widths, cols = [], []
    for edge, dirn in ((op['s0'], -1), (op['s1'], 1)):
        p = trim_profile_along(s, z, pc, edge, dirn)
        cw = run_width(p)
        if cw:
            widths.append(cw)
            d = (s - edge) * dirn
            m = (d >= 0) & (d < cw) & (z > 1.0) & (z < 1.8)
            cols.append(np.median(pc[m], 0))
    # head casing: vertical profile above the head inside the opening span
    m = (s > op['s0'] + 0.1) & (s < op['s1'] - 0.1)
    p = trim_profile_along(z[m], s[m], pc[m], op['head'], 1, zlo=-1, zhi=99, maxd=0.35) if m.sum() > 30 else None
    head_w = run_width(p)
    return widths, cols, head_w


def band_colour_rows(pts, cols, z0, z1, step=0.01):
    b = ((pts[:, 2] - z0) / step).astype(int); n = int((z1 - z0) / step)
    ok = (b >= 0) & (b < n)
    return b[ok], cols[ok], n


# ----------------------------------------------------------------------------------------------- rooms
def room_of_point(rooms, p):
    for r in rooms:
        if pip(np.array(r['polygon']), np.array([p]))[0]:
            return r
    return None


def classify_floor(cols, dom=None):
    hsv = cv2.cvtColor(np.clip(cols, 0, 255).astype(np.uint8)[None], cv2.COLOR_RGB2HSV)[0].astype(float)
    hue, sat, val = hsv[:, 0] * 2, hsv[:, 1] / 255, hsv[:, 2] / 255
    dom_wood = False
    if dom is not None:
        dh = cv2.cvtColor(np.clip(dom, 0, 255).astype(np.uint8)[None, None], cv2.COLOR_RGB2HSV)[0, 0].astype(float)
        dom_wood = 8 < dh[0] * 2 < 45 and dh[1] > 76
    woodish = ((hue > 8) & (hue < 45) & (sat > 0.3) & (val > 0.25)).mean()
    v = val
    bimodal = (np.percentile(v, 90) - np.percentile(v, 10))
    if woodish > 0.55 or (woodish > 0.35 and dom_wood):
        return 'hardwood (oak strip, warm finish)', float(woodish)
    if bimodal > 0.45:
        return 'tile (two-tone checker / patterned)', float(bimodal)
    return 'tile / other', float(bimodal)


def analyse_rooms(M, doors):
    plan = M['plan']; C, N = M['C'], M['N']
    out = []
    for r in plan['rooms']:
        poly = np.array(r['polygon'])
        inside = pip(poly, C[:, :2])
        info = dict(id=r['id'], label=r['label'], polygon=poly.round(3).tolist(), area_m2=round(float(r['area_m2']), 2))
        # ceiling height (down-facing, high)
        m = inside & (N[:, 2] < -0.9) & (C[:, 2] > 2.0)
        if m.sum():
            hz = C[m, 2]; wts = M['A'][m]
            o = np.argsort(hz); cw = np.cumsum(wts[o]); info['ceiling_m'] = round(float(hz[o][np.searchsorted(cw, cw[-1] / 2)]), 3)
        info['plan_height_m'] = r.get('height_m')
        # floor
        m = np.where(inside & (N[:, 2] > 0.9) & (np.abs(C[:, 2]) < 0.06))[0]
        if len(m):
            P, col = surface_samples(M, m, 0.03)
            ins = pip(poly, P[:, :2]); col = col[ins]
            fc, share = robust_colour(col)
            kind, score = classify_floor(col, fc)
            info['floor'] = dict(colour=hexcol(fc), material=kind, evidence=f'{len(col)} texture samples on z~0 surfaces, score {score:.2f}')
        # walls near the boundary
        bd = dist_to_poly_boundary(poly, C[:, :2])
        m = np.where(inside & (np.abs(N[:, 2]) < 0.25) & (bd < 0.25) & (C[:, 2] < 2.75))[0]
        if len(m):
            P, col = surface_samples(M, m, 0.02)
            ins = pip(poly, P[:, :2]) & (dist_to_poly_boundary(poly, P[:, :2]) < 0.12)
            P, col = P[ins], col[ins]
            fz = (P[:, 2] > 2.02) & (P[:, 2] < 2.38)
            paint, share = robust_colour(col[fz])
            info['wall_paint'] = dict(colour=hexcol(paint), share=round(share, 2))
            # baseboard: rows from the floor up; compare to paint colour vs trim colour seen at 3-7 cm
            low = (P[:, 2] > 0.03) & (P[:, 2] < 0.07)
            bcol, bshare = robust_colour(col[low])
            if bcol is not None and paint is not None and np.linalg.norm(bcol - paint) > 30:
                b, cc, n = band_colour_rows(P, col, 0.0, 0.45)
                closer = np.linalg.norm(cc - bcol, axis=1) < np.linalg.norm(cc - paint, axis=1)
                frac = np.bincount(b, closer.astype(float), n) / np.maximum(np.bincount(b, None, n), 1)
                hgt = None
                for i in range(3, n):
                    if frac[i] < 0.5 and frac[min(i + 1, n - 1)] < 0.5:
                        hgt = i * 0.01; break
                info['baseboard'] = dict(height_m=hgt, colour=hexcol(bcol))
            # crown molding: rows below the ceiling
            ceil = info.get('ceiling_m', 2.7)
            top = (P[:, 2] > ceil - 0.06) & (P[:, 2] < ceil - 0.02)
            ccol, _ = robust_colour(col[top])
            if ccol is not None and paint is not None and np.linalg.norm(ccol - paint) > 30:
                b, cc, n = band_colour_rows(P, col, ceil - 0.45, ceil)
                closer = np.linalg.norm(cc - ccol, axis=1) < np.linalg.norm(cc - paint, axis=1)
                frac = np.bincount(b, closer.astype(float), n) / np.maximum(np.bincount(b, None, n), 1)
                hgt = None
                for i in range(n - 3, 0, -1):
                    if frac[i] < 0.5 and frac[i - 1] < 0.5:
                        hgt = round((n - 1 - i) * 0.01, 2); break
                info['crown'] = dict(depth_m=hgt, colour=hexcol(ccol))
        # ceiling colour
        m = np.where(inside & (N[:, 2] < -0.9) & (C[:, 2] > 2.0))[0]
        if len(m):
            P, col = surface_samples(M, m, 0.05)
            cc, _ = robust_colour(col)
            info['ceiling_colour'] = hexcol(cc)
        if info.get('ceiling_colour') and info.get('wall_paint'):
            cc = np.array([int(info['ceiling_colour'][i:i + 2], 16) for i in (1, 3, 5)], float)
            gain = np.clip(np.array([242, 239, 233]) / np.maximum(cc, 1), 0.8, 2.2)
            for key in ('wall_paint', 'floor'):
                if info.get(key):
                    c = np.array([int(info[key]['colour'][i:i + 2], 16) for i in (1, 3, 5)], float)
                    info[key]['colour_balanced'] = hexcol(c * gain)
            info['white_balance_gain'] = gain.round(3).tolist()
        out.append(info)
        log('room', r['label'], {k: v for k, v in info.items() if k not in ('polygon', 'id')})
    return out


# ----------------------------------------------------------------------------------------------- polygons
def offset_rectilinear(poly, d):
    """offset a CCW rectilinear polygon outward by d"""
    n = len(poly); out = []
    for i in range(n):
        p0, p1, p2 = poly[i - 1], poly[i], poly[(i + 1) % n]
        e1 = (p1 - p0) / np.linalg.norm(p1 - p0); e2 = (p2 - p1) / np.linalg.norm(p2 - p1)
        n1 = np.array([e1[1], -e1[0]]); n2 = np.array([e2[1], -e2[0]])  # outward for CCW
        a1 = p0 + n1 * d; a2 = p1 + n2 * d
        A = np.array([e1, -e2]).T
        t = np.linalg.solve(A, a2 - a1)
        out.append(a1 + e1 * t[0])
    return np.array(out)


def rect_decompose(poly, res=0.05, min_side=1.2, cover=0.985):
    """greedy maximal-rectangle cover of a rectilinear polygon (for the hip-roof solids)"""
    x0, y0 = poly.min(0); x1, y1 = poly.max(0)
    W, H = int(round((x1 - x0) / res)), int(round((y1 - y0) / res))
    img = np.zeros((H, W), np.uint8)
    cv2.fillPoly(img, [((poly - [x0, y0]) / res).round().astype(np.int32)], 1)
    rem = img.copy(); total = img.sum(); rects = []
    while rem.sum() > total * (1 - cover) and len(rects) < 6:
        best = None
        hist = np.zeros(W, int)
        for yy in range(H):
            hist = np.where(img[yy] > 0, hist + 1, 0)
            st = []
            for xx in range(W + 1):
                hcur = hist[xx] if xx < W else 0
                start = xx
                while st and st[-1][1] >= hcur:
                    s0, hh = st.pop()
                    wdt = xx - s0
                    if hh * res >= min_side and wdt * res >= min_side:
                        gain = rem[yy - hh + 1:yy + 1, s0:xx].sum()
                        if best is None or gain > best[0]:
                            best = (gain, s0, yy - hh + 1, xx, yy + 1)
                    start = s0
                st.append((start, hcur))
        if best is None or best[0] < (min_side / res) ** 2 * 0.5:
            break
        g, a, b, c, d = best
        rem[b:d, a:c] = 0
        rects.append([round(x0 + a * res, 3), round(y0 + b * res, 3), round(x0 + c * res, 3), round(y0 + d * res, 3)])
    return rects


# ----------------------------------------------------------------------------------------------- textures / evidence
def bake_floor_patch(M, room, size=1.2, px=0.004):
    """top-down texture bake of the cleanest hardwood patch in a room -> tileable jpg"""
    poly = np.array(room['polygon'])
    C, N = M['C'], M['N']
    m = np.where(pip(poly, C[:, :2]) & (N[:, 2] > 0.9) & (np.abs(C[:, 2]) < 0.06))[0]
    x0, y0 = poly.min(0); x1, y1 = poly.max(0)
    W, H = int((x1 - x0) / px), int((y1 - y0) / px)
    img, hit = raster_topdown(M, m, x0, y1, px, W, H)
    col = img[hit].astype(np.float32)
    fc, _ = robust_colour(col)
    good = hit & (np.linalg.norm(img.astype(float) - fc, axis=2) < 60)
    k = int(size / px)
    ii = cv2.integral(good.astype(np.uint8))
    best, bp = -1, (0, 0)
    for yy in range(0, H - k, 10):
        for xx in range(0, W - k, 10):
            v = ii[yy + k, xx + k] - ii[yy, xx + k] - ii[yy + k, xx] + ii[yy, xx]
            if v > best:
                best, bp = v, (xx, yy)
    xx, yy = bp
    patch = img[yy:yy + k, xx:xx + k].copy()
    hole = ~good[yy:yy + k, xx:xx + k]
    patch = cv2.inpaint(patch, hole.astype(np.uint8), 5, cv2.INPAINT_TELEA)
    # boards: make them run along image v (texture is then rotated in the viewer to match the room's board direction)
    g = cv2.cvtColor(patch, cv2.COLOR_RGB2GRAY).astype(float)
    # boards along y in the world show up as column-wise banding (variance of column means is high)
    grain = 'y' if np.var(g.mean(0)) > np.var(g.mean(1)) else 'x'
    if grain == 'x':
        patch = np.ascontiguousarray(np.rot90(patch))
    patch = make_tileable(patch)
    Image.fromarray(patch).resize((512, 512), Image.LANCZOS).save(os.path.join(AST, 'floor_hardwood.jpg'), quality=90)
    Image.fromarray(img).resize((W // 3, H // 3)).save(os.path.join(EVD, 'floor_topdown_%s.jpg' % room['label'].replace(' ', '_')), quality=85)
    centre = [x0 + (xx + k / 2) * px, y1 - (yy + k / 2) * px]
    return dict(file='assets/floor_hardwood.jpg', size_m=size, board_axis_world=grain, sampled_at=[round(c, 2) for c in centre],
                clean_fraction=round(best / (k * k), 3))


def raster_topdown(M, sel, x0, y1, px, W, H):
    """proper textured rasterisation (per-triangle affine warp) of triangles seen from above"""
    img = np.zeros((H, W, 3), np.uint8); hit = np.zeros((H, W), np.uint8)
    V, F, UV, T = M['V'], M['F'], M['UV'], M['T']
    for i in sel:
        p = V[F[i]]; uv = UV[F[i]]
        im = M['ims'][T[i]]; th, tw = im.shape[:2]
        dst = np.stack([(p[:, 0] - x0) / px, (y1 - p[:, 1]) / px], 1).astype(np.float32)
        src = np.stack([uv[:, 0] * (tw - 1), uv[:, 1] * (th - 1)], 1).astype(np.float32)
        bx0, by0 = np.floor(dst.min(0)).astype(int); bx1, by1 = np.ceil(dst.max(0)).astype(int) + 1
        bx0, by0 = max(bx0, 0), max(by0, 0); bx1, by1 = min(bx1, W), min(by1, H)
        if bx1 <= bx0 or by1 <= by0:
            continue
        sx0, sy0 = np.floor(src.min(0)).astype(int); sx1, sy1 = np.ceil(src.max(0)).astype(int) + 1
        sx0, sy0 = max(sx0, 0), max(sy0, 0)
        patch = im[sy0:sy1 + 1, sx0:sx1 + 1]
        if patch.size == 0:
            continue
        A = cv2.getAffineTransform((src - [sx0, sy0]).astype(np.float32), (dst - [bx0, by0]).astype(np.float32))
        warped = cv2.warpAffine(patch, A, (bx1 - bx0, by1 - by0), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        mask = np.zeros((by1 - by0, bx1 - bx0), np.uint8)
        cv2.fillConvexPoly(mask, np.round((dst - [bx0, by0]) * 4).astype(np.int32), 1, cv2.LINE_8, 2)
        mm = mask > 0
        img[by0:by1, bx0:bx1][mm] = warped[mm]; hit[by0:by1, bx0:bx1][mm] = 1
    return img, hit > 0


def make_tileable(img, blend=0.18):
    """offset by half and cross-fade the seams (keeps the real texture, hides wrap seams)"""
    h, w = img.shape[:2]
    f = img.astype(np.float32)
    sh = np.roll(np.roll(f, h // 2, 0), w // 2, 1)
    yy, xx = np.mgrid[0:h, 0:w]
    dy = np.minimum(yy, h - 1 - yy) / (h * blend); dx = np.minimum(xx, w - 1 - xx) / (w * blend)
    a = np.clip(np.minimum(dx, dy), 0, 1)[..., None]
    return (f * a + sh * (1 - a)).astype(np.uint8)


def exterior_evidence():
    """crops of the house from the drone photo (roof shingles, siding, trim); colours + tileable shingle texture"""
    p = os.path.join(DRONE, 'DJI_20260915140710_0830_D.JPG')
    ev = {}
    if not os.path.exists(p):
        return ev
    im = Image.open(p).convert('RGB')
    im.resize((im.width // 6, im.height // 6)).save(os.path.join(EVD, 'drone_house_top.jpg'), quality=85)
    wall = im.crop((1200, 3300, 3600, 4096)); wall.save(os.path.join(EVD, 'drone_eave_siding.jpg'), quality=85)
    side = im.crop((3000, 600, 4600, 2400)).resize((800, 900)); side.save(os.path.join(EVD, 'drone_chimney_hips.jpg'), quality=85)
    a = np.asarray(im).astype(float)
    siding = a[3300 + 560:3300 + 700, 1200 + 820:1200 + 1050].reshape(-1, 3)
    shing = a[3300 + 80:3300 + 330, 1200 + 900:1200 + 1500].reshape(-1, 3)
    ev['siding_colour'] = hexcol(np.median(siding, 0))
    ev['shingle_colour'] = hexcol(np.median(shing, 0))
    # find the rotation that makes the shingle courses horizontal (max row-mean variance / column-mean variance)
    best = None
    for ang in np.arange(-60, 61, 2.0):
        wr = wall.rotate(ang, resample=Image.BILINEAR, expand=True); W, H = wr.size
        t = np.asarray(wr.crop((W // 2 - 200, H // 2 - 250, W // 2 + 200, H // 2 - 50)).convert('L')).astype(float)
        sc = np.var(t.mean(1)) / (np.var(t.mean(0)) + 1)
        if best is None or sc > best[0]:
            best = (sc, ang)
    ev['shingle_course_rotation_deg'] = float(best[1])
    wr = wall.rotate(best[1], resample=Image.BICUBIC, expand=True)
    W, H = wr.size
    cx, cy = W // 2 + 120, H // 2 - 140
    tex = np.asarray(wr.crop((cx - 260, cy - 130, cx + 260, cy + 130)))
    Image.fromarray(tex).save(os.path.join(EVD, 'shingle_patch_raw.jpg'), quality=90)
    tex = make_tileable(tex)
    Image.fromarray(tex).resize((512, 256), Image.LANCZOS).save(os.path.join(AST, 'roof_shingles.jpg'), quality=90)
    ev['shingle_texture'] = 'assets/roof_shingles.jpg'
    return ev


def export_house_mesh(M, env_outer, zmax):
    """MatterPak mesh, clipped to the building envelope, as raw buffers grouped by texture"""
    C = M['C']
    inner = offset_rectilinear(env_outer, -0.012)  # strictly inside the new siding shell
    tri = M['V'][M['F']]
    keep = (tri[:, :, 2].max(1) < zmax) & (tri[:, :, 2].min(1) > -0.12)
    for k in range(3):   # all three vertices inside (long slivers from the scan's outside junk otherwise poke through)
        keep &= pip(inner, tri[:, k, :2])
    F = M['F'][keep]; T = M['T'][keep]
    groups = []; pos, uv, idx = [], [], []
    voff = ioff = 0
    for t in np.unique(T):
        f = F[T == t]
        u, inv = np.unique(f.ravel(), return_inverse=True)
        pos.append(M['V'][u].astype(np.float32)); uv.append(M['UV'][u].astype(np.float32))
        idx.append(inv.astype(np.uint32))
        groups.append(dict(tex=str(M['tex'][t]), v0=voff, nv=len(u), i0=ioff, ni=len(inv)))
        voff += len(u); ioff += len(inv)
    pos = np.concatenate(pos); uv = np.concatenate(uv); idx = np.concatenate(idx)
    with open(os.path.join(AST, 'house_mesh.bin'), 'wb') as fh:
        fh.write(pos.tobytes()); fh.write(uv.tobytes()); fh.write(idx.tobytes())
    os.makedirs(os.path.join(AST, 'tex'), exist_ok=True)
    for g in groups:  # 1024 px copies keep headless/software WebGL fast (originals are 2048 px)
        dst = os.path.join(AST, 'tex', g['tex'])
        if not os.path.exists(dst):
            Image.open(os.path.join(TEXDIR, g['tex'])).resize((1024, 1024), Image.LANCZOS).save(dst, quality=88)
    meta = dict(nv=int(voff), ni=int(ioff), groups=groups, tex_dir='assets/tex/', tex_original_dir=f'../../../assets_{SID}/tiles/furnished_tex/',
                layout='float32 pos[nv*3], float32 uv[nv*2] (v = image row -> flipY=false), uint32 idx[ni] (group-local)')
    json.dump(meta, open(os.path.join(AST, 'house_mesh.json'), 'w'), indent=1)
    log(f'mesh export: {int(keep.sum())} / {len(keep)} tris kept')
    return meta


# ----------------------------------------------------------------------------------------------- main
def cluster_count(vals, tol):
    vals = np.asarray(vals, float)
    if not len(vals):
        return None, 0
    best = max(vals, key=lambda v: (np.abs(vals - v) <= tol).sum())
    sel = np.abs(vals - best) <= tol
    return float(np.median(vals[sel])), int(sel.sum())


def find_fireplace(M, w, E):
    """dark firebox (low, wide, very dark) in a wall elevation -> chimney position"""
    col = E['col']; valid = np.isfinite(E['depth'])
    zc = (np.arange(E['nz']) + 0.5) * RES
    v = col.max(2)
    band = (zc > 0.12) & (zc < 0.8)
    dark = ((v < 110) & valid)[band].mean(0)
    best = None
    for s0, s1 in runs(dark > 0.45):
        if 0.6 <= (s1 - s0) * RES <= 1.3:
            sc = float(dark[s0:s1].mean() * (s1 - s0))
            if best is None or sc > best[2]:
                best = ((s0 + s1) / 2 * RES, (s1 - s0) * RES, sc)
    return best


def main():
    M = load()
    plan = M['plan']
    fp = footprint(plan, 0.3)
    env = footprint(plan, 1.2)
    # exterior vs interior wall thickness
    ext_t, int_t, walls_info = [], [], []
    for i, w in enumerate(plan['walls']):
        a, b, L, u, nrm = wall_frame(w)
        mid = (a + b) / 2
        o1 = not pip(fp, (mid + nrm * 0.45)[None])[0]; o2 = not pip(fp, (mid - nrm * 0.45)[None])[0]
        (ext_t if (o1 or o2) else int_t).append((w['thickness'], L))
    def wmode(lst):
        t = np.array([x[0] for x in lst]); L = np.array([x[1] for x in lst])
        u = np.unique(t); s = [L[t == x].sum() for x in u]
        return float(u[int(np.argmax(s))]), int(len(t))
    t_ext, n_ext = wmode(ext_t); t_int, n_int = wmode(int_t)
    env_outer = offset_rectilinear(env, t_ext / 2)
    fp_outer = offset_rectilinear(fp, t_ext / 2)
    log('wall thickness ext', t_ext, n_ext, 'int', t_int, n_int)

    rooms = analyse_rooms(M, [])
    room_by_id = {r['id']: r for r in rooms}

    # ---- openings
    doors, windows, ext_doors = [], [], []
    fireplace = None
    for i, w in enumerate(plan['walls']):
        a, b, L, u, nrm = wall_frame(w)
        if L < 0.6:
            continue
        E = wall_elevation(M, w, fp)
        ops = find_openings(w, E)
        if E['exterior'] and L > 3:
            fpl = find_fireplace(M, w, E)
            if fpl and (fireplace is None or fpl[2] > fireplace['score']):
                s, wd, sc = fpl
                p = a + u * s
                out_n = nrm * E['sgn']
                fireplace = dict(wall=i, centre=(p + out_n * (w['thickness'] / 2)).round(3).tolist(), firebox_width=round(wd, 2), score=round(sc, 3),
                                 outward=out_n.round(3).tolist())
        for o in ops:
            sc = (o['s0'] + o['s1']) / 2
            c = a + u * sc
            rec = dict(wall=i, kind=o['kind'], width=round(o['width'], 3), head=round(o['head'], 3), sill=round(o['sill'], 3),
                       centre=c.round(3).tolist(), dir=u.round(4).tolist(), wall_len=round(L, 3),
                       offset_from_wall_end=round(min(o['s0'], L - o['s1']), 3),
                       end_side='start' if o['s0'] < L - o['s1'] else 'end', wall_thickness=w['thickness'])
            ra = room_of_point(plan['rooms'], c + nrm * 0.3); rb = room_of_point(plan['rooms'], c - nrm * 0.3)
            rec['rooms'] = [r['label'] for r in (ra, rb) if r]
            rec['room_ids'] = [r['id'] for r in (ra, rb) if r]
            if o['kind'] in ('door', 'cased_opening'):
                cw, cc, hw = measure_casing(M, w, o)
                rec['casing_width'] = round(float(np.median(cw)), 3) if cw else None
                rec['casing_colour'] = hexcol(np.median(cc, 0)) if cc else None
                rec['head_casing'] = hw
                doors.append(rec)
            else:
                rec['outward'] = (nrm * E['sgn']).round(3).tolist()
                inner = room_of_point(plan['rooms'], c - nrm * E['sgn'] * 0.3)
                rec['room'] = inner['label'] if inner else None
                rec['room_id'] = inner['id'] if inner else None
                windows.append(rec)
    log(f'doors {len(doors)}, windows {len(windows)}, fireplace {fireplace}')

    # ---- door statistics (interior swing doors only)
    sw = [d for d in doors if d['kind'] == 'door']
    dw, ndw = cluster_count([d['width'] for d in sw], 0.051)
    dh, ndh = cluster_count([d['head'] for d in sw], 0.051)
    cws = [d['casing_width'] for d in doors if d.get('casing_width')]
    ccols = [d['casing_colour'] for d in doors if d.get('casing_colour')]
    hws = [d['head_casing'] for d in doors if d.get('head_casing')]
    offs = [d['offset_from_wall_end'] for d in sw]
    near_corner = [o for o in offs if o < 0.45]
    door_stats = dict(
        n_doors=len(sw), n_cased_openings=len(doors) - len(sw),
        width=round(dw, 2), width_support=ndw, head=round(dh, 2), head_support=ndh,
        casing_width=round(float(np.median(cws)), 3) if cws else 0.09, casing_support=len(cws),
        head_casing_height=round(float(np.median(hws)), 3) if hws else None,
        casing_colour=ccols and hexcol(np.median([[int(c[i:i + 2], 16) for i in (1, 3, 5)] for c in ccols], 0)),
        corner_offset=round(float(np.median(near_corner)), 3) if near_corner else 0.15,
        n_near_corner=len(near_corner),
        note='clear opening between jambs, measured from gaps in the scanned wall band (open doors only; closed doors are '
             'invisible to the gap test). Head = underside of the header.')
    # ---- window statistics
    wws = [x['width'] for x in windows]; sills = [x['sill'] for x in windows]; heads = [x['head'] for x in windows]
    sill_m, nsill = cluster_count(sills, 0.08); head_m, nhead = cluster_count(heads, 0.08)
    unit_w, nunit = cluster_count([x for x in wws if x < 1.3], 0.12)
    per_room = {}
    for r in rooms:
        ws = [x for x in windows if x.get('room_id') == r['id']]
        if not ws:
            continue
        per_room[r['id']] = dict(label=r['label'], n=len(ws), glazing_m2=round(sum(x['width'] * (x['head'] - x['sill']) for x in ws), 2),
                                 per_floor_area=round(sum(x['width'] * (x['head'] - x['sill']) for x in ws) / r['area_m2'], 3))
    ratios = [v['per_floor_area'] for v in per_room.values()]
    window_stats = dict(n=len(windows), sill=round(sill_m, 2), sill_support=nsill, head=round(head_m, 2), head_support=nhead,
                        unit_width=round(unit_w, 2), unit_support=nunit, max_width=round(max(wws), 2),
                        glazing_to_floor_area_median=round(float(np.median(ratios)), 3), per_room=per_room,
                        style='double-hung, white painted flat casing (craftsman), upper sash with vertical muntins (seen in bedroom '
                              'elevations, debug/openings*.png)',
                        note='detected from wall elevations rendered from the textured scan: daylight-bright, non-paint vertical '
                             'runs with a sill at 0.35-1.3 m and head at 1.75-2.4 m; widened over the white casing. Partial '
                             'detections (curtains) make widths noisy, so the generator uses the modal unit width.')

    # ---- heights
    ceil = [r['ceiling_m'] for r in rooms if r.get('ceiling_m')]
    ceil_m, nceil = cluster_count(ceil, 0.03)
    C, N = M['C'], M['N']
    outside = ~pip(fp_outer, C[:, :2])
    g = outside & (N[:, 2] > 0.9) & (C[:, 2] < -0.25)
    ground_z = float(np.median(C[g, 2])) if g.sum() > 20 else -0.45
    log('ceiling', ceil_m, nceil, 'ground', ground_z, g.sum())

    # ---- style aggregates
    bb = [r['baseboard']['height_m'] for r in rooms if r.get('baseboard') and r['baseboard']['height_m'] and 0.06 <= r['baseboard']['height_m'] <= 0.3]
    bbc = [r['baseboard']['colour'] for r in rooms if r.get('baseboard')]
    cr = [r['crown']['depth_m'] for r in rooms if r.get('crown') and r['crown']['depth_m']]
    style = dict(baseboard_height=round(float(np.median(bb)), 3) if bb else 0.15, baseboard_support=len(bb),
                 baseboard_colour=door_stats['casing_colour'] or '#efece4',
                 baseboard_note='baseboard colour taken from the trim (door casing) colour: scanned baseboard bands mix with floor colour',
                 crown_depth=round(float(np.median(cr)), 3) if cr else None, crown_support=len(cr))

    # ---- floor textures for hardwood rooms
    floor_tex = {}
    for r in rooms:
        if r.get('floor') and r['floor']['material'].startswith('hardwood') and r['label'] == 'Bedroom':
            ft = bake_floor_patch(M, r)
            fn = 'assets/floor_%s.jpg' % r['id'][:6]
            os.replace(os.path.join(AST, 'floor_hardwood.jpg'), os.path.join(HERE, fn))
            ft['file'] = fn
            floor_tex[r['id']] = ft
            log('floor patch', r['label'], ft)

    # ---- exterior / roof
    ev = exterior_evidence()
    rects = rect_decompose(env_outer)
    pitch_ratio = 5 / 12
    eave_z = round(ceil_m + 0.22, 3)    # ceiling + joists/top plate: underside of the fascia sits at the wall plate
    roof = dict(
        type='hip', pitch_ratio='5:12', pitch_deg=round(math.degrees(math.atan(pitch_ratio)), 2), overhang_m=0.45,
        eave_z=eave_z, fascia_depth_m=0.18, gutter=True, material='asphalt composition shingle',
        colour=ev.get('shingle_colour', '#4a4d52'), texture=ev.get('shingle_texture'), rects=rects,
        evidence=[
            'drone DJI_..._0830 / _0070 (evidence/drone_house_top.jpg): dark grey composition-shingle roof with hipped ends and '
            'a cross-hip toward the street; no gable walls visible -> hip roof.',
            'evidence/drone_eave_siding.jpg: continuous white fascia with gutter, rafter tails hidden, shallow boxed eave; gutter '
            'line sits ~0.4-0.5 m outside the siding -> 0.45 m overhang.',
            'pitch is not measurable from the (near-vertical) drone photos; ridge/hip shading and the typical 1920s LA bungalow '
            '(5:12 to 6:12) -> 5:12 assumed (documented assumption).',
            f'eave height = measured ceiling {ceil_m:.2f} m + 0.22 m (joists/top plate) above the finished floor.',
            'evidence/drone_chimney_hips.jpg: painted chimney on the street side by the driveway, hips meeting at a short ridge.'])
    cladding = dict(type='horizontal lap siding (clapboard), ~0.12 m exposure', colour=ev.get('siding_colour', '#9fb0b5'),
                    trim_colour='#f2f0ea', evidence='evidence/drone_eave_siding.jpg: pale blue-grey lap siding with white window '
                                                    'casings and white decorative window grilles on the back wall.')
    foundation = dict(type='raised floor on perimeter foundation (crawlspace)', floor_above_grade=round(-ground_z, 3),
                      colour='#8d8a84', evidence=f'scan fragments outside the walls (driveway/porch) are flat at z={ground_z:.2f} m '
                                                  'while the finished floor is at z=0.')
    dna = dict(
        model=SID, frame='model frame: x east, y north, z up, metres; finished floor z=0',
        generated_by='Code/expansion/c_housedna/analyse_house.py',
        levels=dict(floor_z=0.0, ground_z=round(ground_z, 3), ceiling=round(ceil_m, 3), ceiling_support=nceil, ceiling_n=len(ceil)),
        walls=dict(exterior_thickness=t_ext, exterior_n=n_ext, interior_thickness=t_int, interior_n=n_int),
        footprint=np.round(fp, 3).tolist(), envelope=np.round(env, 3).tolist(), envelope_outer=np.round(env_outer, 3).tolist(),
        doors=doors, door_stats=door_stats, windows=windows, window_stats=window_stats,
        rooms=rooms, floor_textures=floor_tex, style=style,
        exterior=dict(roof=roof, cladding=cladding, foundation=foundation, fireplace_chimney=fireplace,
                      ground=dict(z=round(ground_z, 3), lawn='#6f8f45', paving='#bdb6aa',
                                  evidence='drone photos: lawn/planting beds behind the house, concrete driveway on one side')),
    )
    zmax = ceil_m + 0.12
    export_house_mesh(M, env_outer, zmax)
    json.dump(dna, open(OUT, 'w'), indent=1)
    log('wrote', OUT)


if __name__ == '__main__':
    main()
