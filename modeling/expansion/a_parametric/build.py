"""Variant a_parametric: data extraction for the parametric shell.

Reads plan.json + the MatterPak mesh and writes, into this folder:
  assets/scene.json   footprint (wall centre line), exterior wall thickness, plate/ceiling/grade heights,
                      roof parameters + rectangle decomposition, detected windows/doors per exterior edge,
                      measured interior style (door size, casing, sill, colours), doorway position per test case
  assets/scan.bin/.json  MatterPak mesh cropped to the house interior (positions, uvs, index groups per texture)
  assets/floor_tex.jpg   hardwood floor patch photo-sampled from the bedroom floor (tileable)
  assets/siding_color etc. inside scene.json
  assets/debug/*         elevation images used to check window detection
Run from anywhere: python Code/expansion/a_parametric/build.py
"""
import json, os, sys
import numpy as np, cv2

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
OUT = os.path.join(HERE, 'assets'); os.makedirs(os.path.join(OUT, 'debug'), exist_ok=True)
PLAN = os.path.join(ROOT, 'pano_zvKHR9DHNjJ', 'mesh_diff', 'plan.json')
NPZ = os.path.join(ROOT, 'assets_zvKHR9DHNjJ', 'tiles', 'furnished_mesh.npz')
TEXDIR = os.path.join(ROOT, 'assets_zvKHR9DHNjJ', 'tiles', 'furnished_tex')
TEST = os.path.join(HERE, '..', 'test_case.json')

plan = json.load(open(PLAN))
test = json.load(open(TEST))
d = np.load(NPZ)
V, F, UV, T, TEX = d['V'], d['F'], d['UV'], d['T'], list(d['tex'])
TRI = V[F]
C = TRI.mean(1)
Nn = np.cross(TRI[:, 1] - TRI[:, 0], TRI[:, 2] - TRI[:, 0])
AREA = np.linalg.norm(Nn, axis=1) / 2
Nn = Nn / (2 * AREA[:, None] + 1e-12)

_tex = {}
def tex(i):
    if i not in _tex:
        _tex[i] = cv2.imread(os.path.join(TEXDIR, TEX[i]))
    return _tex[i]

def pip(P, pts):
    from matplotlib.path import Path
    return Path(np.asarray(P)).contains_points(pts)

# ------------------------------------------------------------------ footprint (wall centre line)
def footprint():
    res, x0, y0 = 0.02, -16.0, -9.0
    W, H = int(24 / res), int(18 / res)
    m = np.zeros((H, W), np.uint8)
    px = lambda q: [int(round((q[0] - x0) / res)), int(round((q[1] - y0) / res))]
    for r in plan['rooms']:
        cv2.fillPoly(m, [np.array([px(q) for q in r['polygon']], np.int32)], 255)
    for w in plan['walls']:
        cv2.line(m, tuple(px(w['a'])), tuple(px(w['b'])), 255, 3)
    k = int(1.2 / res)  # fill slots narrower than 1.2 m (unscanned closets / chases)
    mc = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((k, k), np.uint8))
    cs, _ = cv2.findContours(mc, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    c = max(cs, key=cv2.contourArea)
    a = cv2.approxPolyDP(c, 0.1 / res, True)[:, 0].astype(float) * res + [x0, y0]
    # orthogonalise: each edge is horizontal or vertical; snap shared coordinates
    n = len(a)
    pts = [a[i] for i in range(n)]
    horiz = [abs(pts[(i + 1) % n][1] - pts[i][1]) < abs(pts[(i + 1) % n][0] - pts[i][0]) for i in range(n)]
    # merge consecutive edges with same orientation
    keep = [i for i in range(n) if horiz[i] != horiz[i - 1]]
    pts = [pts[i] for i in keep]; horiz = [horiz[i] for i in keep]; n = len(pts)
    coords = []
    for i in range(n):
        p, q = pts[i], pts[(i + 1) % n]
        coords.append((p[1] + q[1]) / 2 if horiz[i] else (p[0] + q[0]) / 2)
    # snap to plan wall centre lines (exterior walls) where one is within 0.15 m
    lines_h = [ (w['a'][1] + w['b'][1]) / 2 for w in plan['walls'] if abs(w['a'][1] - w['b'][1]) < 0.05]
    lines_v = [ (w['a'][0] + w['b'][0]) / 2 for w in plan['walls'] if abs(w['a'][0] - w['b'][0]) < 0.05]
    out = []
    for i in range(n):
        c0 = coords[i]
        cand = lines_h if horiz[i] else lines_v
        # raster includes half wall thickness -> centre line is ~0.08 inside; choose nearest plan line
        best = min(cand, key=lambda v: abs(v - c0))
        coords[i] = round(best, 3) if abs(best - c0) < 0.2 else round(c0, 3)
    poly = []
    for i in range(n):
        # vertex i joins edge i-1 and edge i
        if horiz[i]: poly.append([coords[i - 1], coords[i]])
        else: poly.append([coords[i], coords[i - 1]])
    poly = np.array(poly)
    # ensure CCW
    s = sum(poly[i - 1][0] * poly[i][1] - poly[i][0] * poly[i - 1][1] for i in range(len(poly)))
    if s < 0: poly = poly[::-1]
    return poly

FP = footprint()
print('footprint (centre line):'); print(FP)

ext_t = float(np.median([w['thickness'] for w in plan['walls'] if
        min(np.min(np.abs(np.array(w['a'])[None] - FP).sum(1)), 99) < 0.3]))
print('exterior wall thickness', ext_t)

# ------------------------------------------------------------------ heights
def hist_peak(z, w, lo, hi, step=0.02):
    h, e = np.histogram(z, bins=np.arange(lo, hi, step), weights=w)
    return float(e[h.argmax()] + step / 2)

ins = pip(FP, C[:, :2])
ceil_h = hist_peak(C[ins & (Nn[:, 2] < -0.9), 2], AREA[ins & (Nn[:, 2] < -0.9)], 2.3, 3.2)
outside = ~pip(np.array(FP) * 1.0, C[:, :2])
grade = hist_peak(C[outside & (np.abs(Nn[:, 2]) > 0.9) & (C[:, 2] < -0.2), 2],
                  AREA[outside & (np.abs(Nn[:, 2]) > 0.9) & (C[:, 2] < -0.2)], -1.0, -0.15)
print('ceiling', ceil_h, 'grade', grade)

# ------------------------------------------------------------------ elevation images + opening detection
def render_tris(sel, to2d, res, shape, origin):
    """Paint textured triangles `sel` into an image. to2d maps Nx3 -> Nx2 metres; origin = (u0, v0) top-left."""
    img = np.zeros(shape + (3,), np.uint8); cnt = np.zeros(shape, np.uint8)
    Hh, Ww = shape
    for t in sel:
        P = to2d(TRI[t])
        dst = np.float32([[(P[k, 0] - origin[0]) / res, (origin[1] - P[k, 1]) / res] for k in range(3)])
        tx = tex(T[t]); th, tw = tx.shape[:2]
        uv = UV[F[t]]
        src = np.float32([[uv[k, 0] * tw, (1 - uv[k, 1]) * th] for k in range(3)])
        x0, y0 = np.floor(dst.min(0)).astype(int); x1, y1 = np.ceil(dst.max(0)).astype(int) + 1
        if x1 <= 0 or y1 <= 0 or x0 >= Ww or y0 >= Hh: continue
        x0c, y0c, x1c, y1c = max(x0, 0), max(y0, 0), min(x1, Ww), min(y1, Hh)
        if x1c - x0c < 1 or y1c - y0c < 1: continue
        M = cv2.getAffineTransform(src, dst - np.float32([x0c, y0c]))
        patch = cv2.warpAffine(tx, M, (x1c - x0c, y1c - y0c), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        mask = np.zeros((y1c - y0c, x1c - x0c), np.uint8)
        cv2.fillConvexPoly(mask, np.round((dst - [x0c, y0c]) * 4).astype(np.int32), 1, shift=2)
        sub = img[y0c:y1c, x0c:x1c]; sub[mask > 0] = patch[mask > 0]
        cnt[y0c:y1c, x0c:x1c][mask > 0] = 255
    return img, cnt

edges = []
n = len(FP)
for i in range(n):
    a, b = FP[i], FP[(i + 1) % n]
    L = float(np.linalg.norm(b - a)); dvec = (b - a) / L
    nout = np.array([dvec[1], -dvec[0]])  # CCW polygon -> right normal points outward
    edges.append(dict(a=a.tolist(), b=b.tolist(), len=L, dir=dvec.tolist(), nout=nout.tolist()))

RES = 0.02
openings = []
for ei, e in enumerate(edges):
    a = np.array(e['a']); dvec = np.array(e['dir']); nout = np.array(e['nout'])
    L = e['len']
    # triangles on the interior face band, roughly parallel to the wall
    rel = C[:, :2] - a
    u = rel @ dvec; dist = rel @ nout
    sel = np.where((u > -0.05) & (u < L + 0.05) & (dist > -0.45) & (dist < 0.6) & (C[:, 2] > -0.6) & (C[:, 2] < 3.0)
                   & (np.abs(Nn[:, :2] @ nout) > 0.5))[0]
    to2d = lambda P, a=a, dvec=dvec: np.stack([(P[:, :2] - a) @ dvec, P[:, 2]], 1)
    shape = (int(3.2 / RES), int(L / RES) + 1)
    img, cnt = render_tris(sel, to2d, RES, shape, (0.0, 2.9))
    cv2.imwrite(os.path.join(OUT, 'debug', 'elev_%02d.jpg' % ei), img)
    # openings: triangles beyond the wall plane (window bays, views outside, glass) => dist > 0.02,
    # or bright & low-saturation (sky/daylight).  Combine: outward-depth map
    depth = np.full(shape, -1.0, np.float32)
    for t in sel:
        P = to2d(TRI[t]); dd = (TRI[t][:, :2] - a) @ nout
        pts = np.round(np.stack([P[:, 0] / RES, (2.9 - P[:, 1]) / RES], 1) * 4).astype(np.int32)
        m = np.zeros(shape, np.uint8); cv2.fillConvexPoly(m, pts, 1, shift=2)
        depth[m > 0] = np.maximum(depth[m > 0], dd.mean())
    e['_img'] = img; e['_depth'] = depth
    np.save(os.path.join(OUT, 'debug', 'depth_%02d.npy' % ei), depth)
    dv = np.clip((depth + 0.45) / 1.05 * 255, 0, 255).astype(np.uint8)
    cv2.imwrite(os.path.join(OUT, 'debug', 'depth_%02d.png' % ei), dv)

json.dump(dict(footprint=FP.tolist(), ext_t=ext_t, ceil=ceil_h, grade=grade,
               edges=[{k: v for k, v in e.items() if not k.startswith('_')} for e in edges]),
          open(os.path.join(OUT, 'stage1.json'), 'w'), indent=1)

# ================================================================== stage 2
def room_at(pt):
    for r in plan['rooms']:
        if pip(r['polygon'], np.array([pt]))[0]: return r
    return None

def sample_colors(sel):
    """RGB of the texture at each triangle's centroid UV (area weights returned too)."""
    out = np.zeros((len(sel), 3), np.float32)
    uvc = UV[F[sel]].mean(1)
    for ti in np.unique(T[sel]):
        k = np.where(T[sel] == ti)[0]; tx = tex(ti); h, w = tx.shape[:2]
        xs = np.clip((uvc[k, 0] * w).astype(int), 0, w - 1); ys = np.clip(((1 - uvc[k, 1]) * h).astype(int), 0, h - 1)
        out[k] = tx[ys, xs][:, ::-1]
    return out, AREA[sel]

def wmedian(c, w):
    o = []
    for k in range(3):
        idx = np.argsort(c[:, k]); cw = np.cumsum(w[idx]); o.append(float(c[idx[np.searchsorted(cw, cw[-1] / 2)], k]))
    return [int(round(v)) for v in o]

def hexc(c): return '#%02x%02x%02x' % tuple(int(v) for v in c)

def topdown(poly, res=0.005, zmax=0.06):
    P = np.array(poly); lo, hi = P.min(0), P.max(0)
    m = pip(P, C[:, :2]) & (np.abs(Nn[:, 2]) > 0.9) & (C[:, 2] < zmax) & (C[:, 2] > -0.1)
    sel = np.where(m)[0]
    shape = (int((hi[1] - lo[1]) / res), int((hi[0] - lo[0]) / res))
    img, cnt = render_tris(sel, lambda Q: Q[:, :2], res, shape, (lo[0], hi[1]))
    return img, cnt, lo, hi

def wood_maps(img):
    valid = cv2.erode((img.sum(2) > 0).astype(np.uint8), np.ones((7, 7), np.uint8)) > 0
    lab = cv2.cvtColor(cv2.blur(img, (11, 11)), cv2.COLOR_BGR2LAB).astype(np.float32)
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    sharp = cv2.blur(np.abs(cv2.Laplacian(g, cv2.CV_32F)), (31, 31))
    gx = cv2.blur(np.abs(cv2.Sobel(g, cv2.CV_32F, 1, 0)), (31, 31)); gy = cv2.blur(np.abs(cv2.Sobel(g, cv2.CV_32F, 0, 1)), (31, 31))
    an = np.maximum(gx, gy) / (np.minimum(gx, gy) + 1e-3)
    thr = max(np.percentile(sharp[valid], 25), 4.0) if valid.any() else 4.0
    # crisp (not smeared re-projection), anisotropic (board seams; rugs are isotropic) pixels
    wood = valid & (sharp > thr) & (an > 1.5)
    return wood, lab, gx, gy

def best_patch(img, sw, sh):
    """Cleanest strip-floor rectangle, long side along the boards. Returns patch (boards along x), quality, axis."""
    wood, lab, gx, gy = wood_maps(img)
    if wood.sum() < 500: return None, 0.0, 'x'
    axis = 'x' if gy[wood].mean() > gx[wood].mean() else 'y'     # seams horizontal in image => boards along x
    med = np.median(lab[wood], 0)
    good = (wood & (np.linalg.norm(lab - med, axis=2) < 30)).astype(np.float32)
    w_, h_ = (sw, sh) if axis == 'x' else (sh, sw)
    ii = cv2.integral(good)
    if good.shape[0] <= h_ or good.shape[1] <= w_: return None, 0.0, axis
    sums = ii[h_:, w_:] - ii[:-h_, w_:] - ii[h_:, :-w_] + ii[:-h_, :-w_]
    y, x = np.unravel_index(np.argmax(sums), sums.shape)
    p = img[y:y + h_, x:x + w_].copy()
    if axis == 'y': p = cv2.rotate(p, cv2.ROTATE_90_CLOCKWISE)
    return p, float(sums[y, x] / sw / sh), axis

def tileable_x(p):
    """Seamless along the board direction (x) by cross-fading with a half-rolled copy; y is mirror-tiled in three.js."""
    h, w = p.shape[:2]
    r = np.roll(p, w // 2, 1).astype(np.float32)
    xx = np.arange(w)[None, :, None]
    wgt = np.clip(np.minimum(xx, w - 1 - xx) / (w * 0.22), 0, 1)
    return (p.astype(np.float32) * wgt + r * (1 - wgt)).astype(np.uint8)

# ---------------------------------------------------------------- door measurements (plan wall gaps + scan headers)
def measure_doors():
    W = plan['walls']; res = []
    for i, w in enumerate(W):
        for j in range(i + 1, len(W)):
            v = W[j]
            a, b, c, e = map(np.array, (w['a'], w['b'], v['a'], v['b']))
            for k in (0, 1):
                o = 1 - k
                if not (abs(a[o] - b[o]) < 0.05 and abs(c[o] - e[o]) < 0.05 and abs(a[o] - c[o]) < 0.06): continue
                s1 = sorted([a[k], b[k]]); s2 = sorted([c[k], e[k]])
                g = (s1[1], s2[0]) if s1[1] < s2[0] else (s2[1], s1[0]) if s2[1] < s1[0] else None
                if not g or not (0.6 < g[1] - g[0] < 1.3): continue
                m = ((C[:, k] > g[0] + 0.1) & (C[:, k] < g[1] - 0.1) & (np.abs(C[:, o] - a[o]) < 0.12)
                     & (Nn[:, 2] < -0.7) & (C[:, 2] > 1.7) & (C[:, 2] < 2.6))
                if m.sum() >= 5: res.append(dict(width=float(g[1] - g[0]), head=float(np.median(C[m, 2]))))
    heads = [r['head'] for r in res if 1.9 < r['head'] < 2.15]
    return res, round(float(np.median(heads)), 3) if heads else 2.03

doors_meas, door_head = measure_doors()
print('door gaps', [(round(r['width'], 2), round(r['head'], 2)) for r in doors_meas], '-> head', door_head)

# ---------------------------------------------------------------- existing exterior openings
# Auto-detected (depth map: scan surfaces lying beyond the interior wall plane = glass / views out) on edges whose
# outside was not scanned; regularised to the house's window grammar (sill 0.9 / head = measured door head).
# Edges whose exterior *was* scanned (front porch, east driveway side) read as "all beyond" -> curated from the
# elevation images in assets/debug (front porch windows + front door, flanking living-room windows, east windows).
def detect_openings():
    out = []
    def comps_at(d, thr):
        m = (d > thr).astype(np.uint8); m[:int(0.25 / RES)] = 0
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
        n, lab, st, _ = cv2.connectedComponentsWithStats(m)
        return [st[k] for k in range(1, n) if st[k][2] * RES > 0.35 and st[k][3] * RES > 0.45]
    for ei, e in enumerate(edges):
        d = e['_depth']
        c0 = comps_at(d, 0.0)
        if any(c[2] * RES > 0.5 * e['len'] or c[2] * RES > 3.0 for c in c0):
            e['scanned_exterior'] = True; continue
        # glass/views sit beyond the interior wall face (-t/2); 0.0 catches deep bays, -0.04 flush sashes
        for x, y, w, h, a in c0 + comps_at(d, -0.04):
            u0, u1 = x * RES, (x + w) * RES; z0, z1 = 2.9 - (y + h) * RES, 2.9 - y * RES
            if z1 > 2.35 or u1 - u0 > 2.6: continue          # wall-high blobs = furniture / art, not openings
            u0, u1 = max(u0, 0.25), min(u1, e['len'] - 0.25)  # keep clear of the corners
            if u1 - u0 < 0.4: continue
            if z0 < 0.25 and z1 > 1.8:
                out.append(dict(edge=ei, u0=u0, u1=u1, z0=0.0, z1=door_head, kind='door'))
                continue
            if z0 < 0.3: continue                              # floor-standing but short: bed / furniture
            # only the top of the window visible (furniture / curtains below) -> standard sill
            sill = 0.9 if (z0 < 1.1 or z1 - z0 < 0.4) else round(z0 * 10) / 10
            w_ = max(u1 - u0, 0.6); uc = (u0 + u1) / 2
            out.append(dict(edge=ei, u0=uc - w_ / 2, u1=uc + w_ / 2, z0=sill, z1=door_head, kind='window'))
    # merge overlapping detections on the same edge
    out.sort(key=lambda o: (o['edge'], o['u0'])); merged = []
    for o in out:
        p = merged[-1] if merged else None
        if p and p['edge'] == o['edge'] and o['u0'] < p['u1'] - 0.05:
            p['u1'] = max(p['u1'], o['u1']); p['z0'] = min(p['z0'], o['z0'])
            if o['kind'] == 'door': p['kind'] = 'door'
        else: merged.append(dict(o))
    for o in merged:
        o['u0'] = round(float(o['u0']), 3); o['u1'] = round(float(o['u1']), 3)
    return merged

detected = detect_openings()

def curated():
    """Front / east openings read off the scanned exterior elevations (debug/elev_00..04) and the dollhouse photo."""
    L = []; H = door_head
    for i, e in enumerate(edges):
        if not e.get('scanned_exterior'): continue
        a, b = e['a'], e['b']; Lg = e['len']
        def add(u0, u1, z0, z1, kind): L.append(dict(edge=i, u0=u0, u1=u1, z0=z0, z1=z1, kind=kind))
        if abs(a[1] - b[1]) < 0.01 and abs(a[1] + 4.202) < 0.1:      # porch back wall: 2 windows + front door
            add(1.18, 2.22, 0.9, H, 'window'); add(2.42, 3.46, 0.9, H, 'window')
            add(Lg - 1.05, Lg - 0.15, 0.0, H, 'frontdoor')
        elif abs(a[0] - b[0]) < 0.01 and abs(a[0] + 6.936) < 0.1:    # porch west side: door to dining room
            add(0.42, 1.18, 0.0, H, 'door')
        elif abs(a[1] - b[1]) < 0.01 and abs(a[1] + 4.75) < 0.1:     # living-room front: windows flanking fireplace
            add(0.55, 1.75, 0.9, H, 'window'); add(3.45, 4.65, 0.9, H, 'window')
        elif abs(a[0] - b[0]) < 0.01 and abs(a[0] - 2.817) < 0.1:    # east (driveway) wall
            add(1.0, 1.9, 0.9, H, 'window'); add(2.1, 3.0, 0.9, H, 'window')
            add(4.3, 5.15, 0.0, H, 'door')
            add(6.7, 7.6, 0.9, H, 'window'); add(7.8, 8.7, 0.9, H, 'window')
    return L

openings = detected + curated()
print('openings', len(openings))
for o in openings: print('  ', {k: (round(v, 2) if isinstance(v, float) else v) for k, v in o.items()})

# ---------------------------------------------------------------- materials sampled from the scan
ins_fp = pip(FP, C[:, :2])
# exterior siding: outward-facing vertical scan surfaces just outside the footprint (porch / driveway side)
rel_d = np.full(len(C), 9.0)
for e in edges:
    a = np.array(e['a']); dv = np.array(e['dir']); no = np.array(e['nout'])
    r = C[:, :2] - a; u = r @ dv; dd = r @ no
    ok = (u > 0.2) & (u < e['len'] - 0.2) & (Nn[:, :2] @ no > 0.8)
    rel_d = np.where(ok & (np.abs(dd) < np.abs(rel_d)), dd, rel_d)
sid = np.where(~ins_fp & (rel_d > 0.0) & (rel_d < 0.25) & (C[:, 2] > 0.3) & (C[:, 2] < 2.3))[0]
cs, ws = sample_colors(sid)
lum = cs.mean(1); k = (lum > 90) & (lum < 215)       # drop white trim / dark gaps
siding = wmedian(cs[k], ws[k]) if k.sum() > 20 else [176, 190, 192]
print('siding colour', siding, 'from', int(k.sum()), 'triangles')

def room_style(room):
    P = room['polygon']; inr = pip(P, C[:, :2])
    wall = np.where(inr & (np.abs(Nn[:, 2]) < 0.2) & (C[:, 2] > 1.4) & (C[:, 2] < 2.3))[0]
    ceil = np.where(inr & (Nn[:, 2] < -0.9) & (C[:, 2] > 2.4))[0]
    base = np.where(inr & (np.abs(Nn[:, 2]) < 0.2) & (C[:, 2] > 0.02) & (C[:, 2] < 0.1))[0]
    cw, ww = sample_colors(wall); cc, wc = sample_colors(ceil); cb, wb = sample_colors(base)
    sel = inr & (Nn[:, 2] < -0.9) & (C[:, 2] > 2.3)
    wall, ceil_c, base_c = wmedian(cw, ww), wmedian(cc, wc), wmedian(cb, wb)
    # the MatterPak texture carries the scan's exposure / warm cast: white-balance on the ceiling (assumed white paint)
    gain = np.array([236, 232, 224]) / np.maximum(np.array(ceil_c, float), 1)
    wb = lambda c: [int(min(250, v)) for v in np.array(c) * gain]
    return dict(wall=hexc(wb(wall)), ceiling=hexc(wb(ceil_c)), base=hexc(wb(base_c)),
                wall_raw=hexc(wall), ceiling_raw=hexc(ceil_c),
                ceil_h=round(hist_peak(C[sel, 2], AREA[sel], 2.3, 3.2), 3))

# ---------------------------------------------------------------- per test case: style, floor texture, doorway
cases = {}
for add in test['additions']:
    ca, cb = np.array(add['connect_wall']['a']), np.array(add['connect_wall']['b'])
    mid = (ca + cb) / 2; dv = (cb - ca) / np.linalg.norm(cb - ca)
    poly = np.array(add['polygon']); cen = poly.mean(0)
    nrm = np.array([-dv[1], dv[0]]); nrm = nrm if (cen - mid) @ nrm > 0 else -nrm   # towards the addition
    room = room_at(mid - nrm * 0.3)
    st = room_style(room)
    img, cnt, lo, hi = topdown(room['polygon'])
    patch, q, axis = best_patch(img, 190, 100)
    src_room = room['label']
    if q < 0.7:   # adjacent floor mostly covered: same strip floor elsewhere in the house (best visible patch)
        for r2 in plan['rooms']:
            if r2['id'] == room['id']: continue
            im2, _, _, _ = topdown(r2['polygon'])
            p2, q2, _ = best_patch(im2, 190, 100)
            if q2 > q + 0.15: patch, q, src_room = p2, q2, r2['label'] + ' (fallback)'
    cv2.imwrite(os.path.join(OUT, 'floor_%s.jpg' % add['id']), tileable_x(patch), [cv2.IMWRITE_JPEG_QUALITY, 92])
    cv2.imwrite(os.path.join(OUT, 'debug', 'floor_src_%s.jpg' % add['id']), img)
    # doorway: reuse an existing exterior window in the shared wall (cut it down to a door), otherwise the stretch
    # of wall with the least scanned clutter (furniture) in front of it.
    L = float(np.linalg.norm(cb - ca)); dw = 0.81; casing = 0.09
    cands = []
    for o in openings:
        e = edges[o['edge']]; a = np.array(e['a']); d2 = np.array(e['dir'])
        pa, pb = a + d2 * o['u0'], a + d2 * o['u1']
        ta, tb = (pa - ca) @ dv, (pb - ca) @ dv
        off = abs((pa - ca) @ nrm)
        if off < 0.2 and min(ta, tb) > -0.01 and max(ta, tb) < L + 0.01 and o['kind'] == 'window':
            cands.append((ta + tb) / 2)
    if cands:
        t0 = min(cands, key=lambda t: abs(t - L / 2)); why = 'existing window position (window cut down to a door)'
    else:
        r = C[:, :2] - ca; tt = r @ dv; dd = r @ (-nrm)
        clutter = (dd > 0.15) & (dd < 0.9) & (C[:, 2] > 0.1) & (C[:, 2] < 1.9)
        best, t0 = 1e18, L / 2
        for t in np.arange(dw / 2 + casing + 0.1, L - dw / 2 - casing - 0.1, 0.05):
            sc = AREA[clutter & (np.abs(tt - t) < dw / 2 + 0.1)].sum() + 0.05 * abs(t - L / 2)
            if sc < best: best, t0 = sc, t
        why = 'least scanned clutter in front of the wall'
    lo_t = dw / 2 + casing + 0.05
    t0 = float(np.clip(t0, lo_t, L - lo_t))
    cases[add['id']] = dict(room_label=room['label'], room_id=room['id'], style=st,
                            floor_tex='assets/floor_%s.jpg' % add['id'], floor_patch_m=[190 * 0.005, 100 * 0.005],
                            floor_boards_along=axis, floor_quality=round(q, 2), floor_source=src_room,
                            door=dict(t=round(t0, 3), width=dw, head=door_head, casing=casing, why=why))
    print(add['id'], cases[add['id']])

# ---------------------------------------------------------------- scan mesh export (interior only)
inside = pip(FP, C[:, :2]) & (C[:, 2] < ceil_h + 0.2) & (C[:, 2] > -0.15)
fsel = np.where(inside)[0]
order = fsel[np.argsort(T[fsel], kind='stable')]
used, inv = np.unique(F[order].ravel(), return_inverse=True)
pos = V[used].astype(np.float32); uv = UV[used].astype(np.float32); idx = inv.astype(np.uint32)
groups = []
Ts = T[order]
for ti in np.unique(Ts):
    k = np.where(Ts == ti)[0]
    groups.append(dict(tex=TEX[ti], start=int(k[0] * 3), count=int(len(k) * 3)))
with open(os.path.join(OUT, 'scan.bin'), 'wb') as fh:
    fh.write(pos.tobytes()); fh.write(uv.tobytes()); fh.write(idx.tobytes())
json.dump(dict(texdir='../../../assets_zvKHR9DHNjJ/tiles/furnished_tex/', nverts=int(len(pos)), nidx=int(len(idx)),
               groups=groups), open(os.path.join(OUT, 'scan.json'), 'w'))
print('scan export', len(pos), 'verts', len(idx) // 3, 'tris')

# ---------------------------------------------------------------- roof (inferred, see NOTES.md)
plate = round(ceil_h + 0.28, 2)          # ceiling joists + top plates above the measured ceiling
roof = dict(form='hip', pitch_rise_per_12=5.0, overhang=0.45, plate_h=plate, fascia_h=0.20,
            shingle='#55585c', fascia='#f2f1ec', soffit='#e9e8e2')

scene = dict(model='zvKHR9DHNjJ', footprint=FP.tolist(), ext_t=ext_t, ceil_h=ceil_h, grade=round(grade, 2),
             door_head=door_head, doors_measured=doors_meas,
             edges=[{k: v for k, v in e.items() if not k.startswith('_')} for e in edges],
             openings=openings, siding=hexc(siding), trim='#f3f2ed', foundation='#8f8c86',
             roof=roof, cases=cases,
             window_style=dict(type='double-hung 3-over-1 (craftsman)', frame=0.07, casing=0.09))
json.dump(scene, open(os.path.join(OUT, 'scene.json'), 'w'), indent=1)
print('wrote scene.json')
