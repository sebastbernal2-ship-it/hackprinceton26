"""d_roofshell asset generator.

Run from the repo root:  python Code/expansion/d_roofshell/gen_assets.py
Outputs (into this folder):
  scan.json + scan_pos.bin / scan_uv.bin / scan_idx.bin  MatterPak textured mesh, clipped to the building footprint,
                                                          grouped by texture (textures are referenced, not copied)
  style.json                                              everything the viewer infers from the scan:
                                                          ceiling height, sampled interior colours, exterior window
                                                          openings (from the Matterport floor-plan PNG), footprint
"""
import json, os, glob
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.dirname(os.path.abspath(__file__))
A = os.path.join(ROOT, 'assets_zvKHR9DHNjJ')

# ---------------------------------------------------------------- footprint (outer wall faces, model frame)
# plan.json exterior wall centrelines: N y=4.90, W x=-12.99, E x=2.82, S y=-5.77 (west part), -4.76 (living);
# the DXF also has an enclosed strip room (sun porch) down to y=-6.13 in front of the dining room.
HT = 0.08  # half wall thickness (plan: 0.16)
FOOT = [(-12.99 - HT, -5.77 - HT), (-6.93 + HT, -5.77 - HT), (-6.93 + HT, -6.13 - HT), (-2.30 + HT, -6.13 - HT),
        (-2.30 + HT, -4.76 - HT), (2.82 + HT, -4.76 - HT), (2.82 + HT, 4.90 + HT), (-12.99 - HT, 4.90 + HT)]


def inside(poly, x, y):
    poly = np.asarray(poly)
    c = np.zeros(len(x), bool)
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]; xj, yj = poly[j]
        m = ((yi > y) != (yj > y)) & (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi)
        c ^= m
        j = i
    return c


def main():
    d = np.load(os.path.join(A, 'tiles', 'furnished_mesh.npz'), allow_pickle=True)
    V, F, UV, T, tex = d['V'].astype(np.float32), d['F'], d['UV'].astype(np.float32), d['T'], list(d['tex'])
    C = V[F].mean(1)
    # keep triangles inside the footprint shrunk by 13 cm: exterior porch/side-walk fragments and the scanned window
    # glass (which Matterport reconstructs in/near the outer wall plane) are dropped; the viewer rebuilds the exterior
    grow = -0.13
    fp = np.array(FOOT)
    cx = fp[:, 0].mean(); cy = fp[:, 1].mean()
    fpg = fp + np.sign(fp - [cx, cy]) * grow
    keep = inside(fpg, C[:, 0], C[:, 1]) & (C[:, 2] > -0.3) & (C[:, 2] < 3.2)
    F2, T2 = F[keep], T[keep]
    used = np.unique(F2)
    remap = -np.ones(len(V), np.int64); remap[used] = np.arange(len(used))
    V3, UV3 = V[used], UV[used]
    F3 = remap[F2].astype(np.uint32)
    order = np.argsort(T2, kind='stable')
    F3, T3 = F3[order], T2[order]
    groups = []
    for t in np.unique(T3):
        idx = np.where(T3 == t)[0]
        groups.append({'tex': str(tex[t]), 'start': int(idx[0]) * 3, 'count': int(len(idx)) * 3})
    V3.tofile(os.path.join(OUT, 'scan_pos.bin'))
    UV3.tofile(os.path.join(OUT, 'scan_uv.bin'))
    F3.reshape(-1).tofile(os.path.join(OUT, 'scan_idx.bin'))
    json.dump({'vertices': int(len(V3)), 'triangles': int(len(F3)), 'groups': groups,
               'texdir': '../../../assets_zvKHR9DHNjJ/tiles/furnished_tex/'},
              open(os.path.join(OUT, 'scan.json'), 'w'), indent=1)
    print('scan: kept', len(F3), 'of', len(F), 'tris')

    # ------------------------------------------------------------ interior style sampling
    texcache = {}

    def teximg(t):
        if t not in texcache:
            texcache[t] = np.asarray(Image.open(os.path.join(A, 'tiles', 'furnished_tex', str(tex[t]))).convert('RGB'))
        return texcache[t]

    N = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    ar = np.linalg.norm(N, axis=1); N /= ar[:, None] + 1e-12
    UVc = UV[F].mean(1)

    def sample(mask, n=4000):
        ids = np.where(mask)[0]
        if len(ids) == 0:
            return None
        rng = np.random.default_rng(0)
        ids = rng.choice(ids, min(n, len(ids)), replace=False, p=ar[ids] / ar[ids].sum())
        cols = []
        for i in ids:
            im = teximg(T[i]); h, w, _ = im.shape
            u, v = UVc[i]
            cols.append(im[int(np.clip((1 - v) * h, 0, h - 1)), int(np.clip(u * w, 0, w - 1))])
        cols = np.array(cols, float)
        return cols

    def hexc(c):
        return '#%02x%02x%02x' % tuple(int(round(x)) for x in c)

    bx = (C[:, 0] > -5.75) & (C[:, 0] < -2.4) & (C[:, 1] > 0.9) & (C[:, 1] < 4.85)
    floor = sample(bx & (N[:, 2] > 0.9) & (C[:, 2] < 0.08))
    ceil = sample(bx & (N[:, 2] < -0.9) & (C[:, 2] > 2.5))
    near_wall = (np.abs(C[:, 1] - 4.82) < 0.08) | (np.abs(C[:, 0] + 5.74) < 0.08) | (np.abs(C[:, 0] + 2.45) < 0.08)
    wall = sample(bx & (np.abs(N[:, 2]) < 0.2) & near_wall & (C[:, 2] > 1.9) & (C[:, 2] < 2.45))
    base = sample(bx & (np.abs(N[:, 2]) < 0.3) & near_wall & (C[:, 2] > 0.02) & (C[:, 2] < 0.10))
    # robust: median of the brightest 60 % for walls/ceiling (furniture/shadow suppressed)
    def robust(c, lo=30, hi=90):
        l = c.mean(1); m = (l >= np.percentile(l, lo)) & (l <= np.percentile(l, hi))
        return np.median(c[m], 0)
    style = {
        'ceiling_h': 2.72, 'floor_z': 0.0, 'grade_z': -0.55, 'wall_t': 0.16,
        'bedroom_floor': hexc(robust(floor, 20, 80)), 'bedroom_floor_dark': hexc(np.percentile(floor, 35, 0)),
        'bedroom_floor_light': hexc(np.percentile(floor, 65, 0)),
        'bedroom_wall': hexc(np.percentile(wall, 70, 0)), 'bedroom_ceiling': hexc(np.percentile(ceil, 80, 0)), 'baseboard': hexc(robust(base, 50, 95)),
        'footprint': FOOT,
    }

    # ------------------------------------------------------------ exterior openings from the floor-plan PNG
    png = glob.glob(os.path.join(A, 'matterport', 'floorplans', '007_png*.png'))[0]
    im = np.asarray(Image.open(png).convert('L')) < 128
    s = 99.3
    px = lambda x: 55.5 + (x + 12.99) * s
    py = lambda y: 71.0 + (4.90 - y) * s
    # side: (fixed coord, axis, from, to, inward pixel direction)
    sides = [('N', 4.90, 'y', -12.99, 2.82, +1), ('W', -12.99, 'x', -5.77, 4.90, +1), ('E', 2.82, 'x', -4.76, 4.90, -1),
             ('S', -5.77, 'y', -12.99, -6.93, -1), ('S', -6.13, 'y', -6.93, -2.30, -1), ('S', -4.76, 'y', -2.30, 2.82, -1)]
    wins = []
    for name, c, ax, a, b, inw in sides:
        n = int(abs(b - a) * s)
        ts = np.linspace(a, b, n)
        if ax == 'y':
            r0 = py(c); lines = [im[int(round(r0 + sg * k)), [int(round(px(t))) for t in ts]] for k in range(0, 14) for sg in (-1, 1)]
        else:
            c0 = px(c); lines = [im[[int(round(py(t))) for t in ts], int(round(c0 + sg * k))] for k in range(0, 14) for sg in (-1, 1)]
        dotted = np.zeros(n, bool)
        for L in lines:
            tr = np.zeros(n); tr[1:] = (L[1:] & ~L[:-1])  # rising edges
            cs = np.convolve(tr, np.ones(27), 'same')
            dotted |= np.convolve((cs >= 3).astype(float), np.ones(13), 'same') > 0
        segs = []; i = 0
        while i < n:
            if dotted[i]:
                j = i
                while j < n and dotted[j]: j += 1
                segs.append([i, j - 1]); i = j
            else:
                i += 1
        for sg in segs:
            t0, t1 = ts[sg[0]], ts[min(sg[1], n - 1)]
            if abs(t1 - t0) < 0.35: continue
            wins.append({'side': name, 'c': c, 'axis': ax, 't0': round(float(min(t0, t1)), 2), 't1': round(float(max(t0, t1)), 2)})
    style['openings'] = wins
    json.dump(style, open(os.path.join(OUT, 'style.json'), 'w'), indent=1)
    print(json.dumps({k: v for k, v in style.items() if k != 'footprint'}, indent=1))


if __name__ == '__main__':
    main()
