"""Shared helpers for the b_scanreuse variant: load the MatterPak mesh and 'bake' orthographic
texture images of any planar slab of the real scan (floor patches, wall elevations with baseboard,
crown moulding, doors, windows) by splatting densely-sampled points of the textured triangles."""
import os, json
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
SID = 'zvKHR9DHNjJ'
MESH_NPZ = os.path.join(ROOT, f'assets_{SID}', 'tiles', 'furnished_mesh.npz')
TEX_DIR = os.path.join(ROOT, f'assets_{SID}', 'tiles', 'furnished_tex')
PLAN = os.path.join(ROOT, f'pano_{SID}', 'mesh_diff', 'plan.json')
OUT = os.path.join(HERE, 'assets')
WORK = os.path.join(HERE, 'work')
os.makedirs(OUT, exist_ok=True)
os.makedirs(WORK, exist_ok=True)

_mesh = None
_tex = {}


def mesh():
    global _mesh
    if _mesh is None:
        d = np.load(MESH_NPZ)
        _mesh = dict(V=d['V'].astype(np.float64), F=d['F'], UV=d['UV'], T=d['T'], tex=list(d['tex']))
        V, F = _mesh['V'], _mesh['F']
        n = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
        a = np.linalg.norm(n, axis=1)
        _mesh['N'] = n / np.maximum(a[:, None], 1e-12)
        _mesh['A'] = a * 0.5
    return _mesh


def tex(i):
    if i not in _tex:
        _tex[i] = np.asarray(Image.open(os.path.join(TEX_DIR, mesh()['tex'][i])).convert('RGB'))
    return _tex[i]


def plan():
    return json.load(open(PLAN))


def bake(origin, uax, vax, nax, urange, vrange, drange, ppm, normal_min=None, oversample=3.0,
         keep='max', seed=0):
    """Orthographic bake of the textured scan.
    Pixel (row, col): col along +u from urange[0], row 0 at vrange[1] (top). Depth d = (P-o).n inside drange;
    for overlapping samples keep the max d (closest to a viewer standing at +n) unless keep='min'.
    normal_min: keep only faces whose normal . n >= normal_min (faces looking at the viewer).
    Returns rgb (H,W,3) uint8, alpha (H,W) bool, depth (H,W) float."""
    m = mesh()
    V, F, UV, T = m['V'], m['F'], m['UV'], m['T']
    o = np.asarray(origin, float); uax = np.asarray(uax, float); vax = np.asarray(vax, float); nax = np.asarray(nax, float)
    P = V - o
    pu, pv, pd = P @ uax, P @ vax, P @ nax
    fu, fv, fd = pu[F], pv[F], pd[F]
    sel = ((fd.min(1) >= drange[0]) & (fd.max(1) <= drange[1]) &
           (fu.max(1) >= urange[0]) & (fu.min(1) <= urange[1]) &
           (fv.max(1) >= vrange[0]) & (fv.min(1) <= vrange[1]))
    if normal_min is not None:
        sel &= (m['N'] @ nax) >= normal_min
    idx = np.nonzero(sel)[0]
    W = int(round((urange[1] - urange[0]) * ppm)); H = int(round((vrange[1] - vrange[0]) * ppm))
    rgb = np.zeros((H, W, 3), np.uint8); alpha = np.zeros((H, W), bool); depth = np.full((H, W), np.nan)
    if len(idx) == 0:
        return rgb, alpha, depth
    # projected area in pixels -> sample count
    e1u = fu[idx, 1] - fu[idx, 0]; e1v = fv[idx, 1] - fv[idx, 0]
    e2u = fu[idx, 2] - fu[idx, 0]; e2v = fv[idx, 2] - fv[idx, 0]
    parea = np.abs(e1u * e2v - e2u * e1v) * 0.5 * ppm * ppm
    cnt = np.ceil(parea * oversample).astype(np.int64) + 3
    rng = np.random.default_rng(seed)
    allpix, alld, allcol = [], [], []
    CH = 4_000_000
    start = 0
    cs = np.cumsum(cnt)
    while start < len(idx):
        # chunk by sample budget
        end = int(np.searchsorted(cs, (cs[start - 1] if start else 0) + CH, side='right'))
        end = max(end, start + 1)
        sub = idx[start:end]; c = cnt[start:end]
        rep = np.repeat(np.arange(len(sub)), c)
        r1 = np.sqrt(rng.random(len(rep))); r2 = rng.random(len(rep))
        b0 = 1 - r1; b1 = r1 * (1 - r2); b2 = r1 * r2
        tri = F[sub][rep]
        u = b0 * pu[tri[:, 0]] + b1 * pu[tri[:, 1]] + b2 * pu[tri[:, 2]]
        v = b0 * pv[tri[:, 0]] + b1 * pv[tri[:, 1]] + b2 * pv[tri[:, 2]]
        d = b0 * pd[tri[:, 0]] + b1 * pd[tri[:, 1]] + b2 * pd[tri[:, 2]]
        tu = b0 * UV[tri[:, 0], 0] + b1 * UV[tri[:, 1], 0] + b2 * UV[tri[:, 2], 0]
        tv = b0 * UV[tri[:, 0], 1] + b1 * UV[tri[:, 1], 1] + b2 * UV[tri[:, 2], 1]
        col = np.floor((u - urange[0]) * ppm).astype(np.int64)
        row = np.floor((vrange[1] - v) * ppm).astype(np.int64)
        ok = (col >= 0) & (col < W) & (row >= 0) & (row < H)
        tid = T[sub][rep]
        colr = np.zeros((len(rep), 3), np.uint8)
        for t in np.unique(tid[ok]):
            mm = ok & (tid == t)
            im = tex(int(t)); th, tw = im.shape[:2]
            x = np.clip((tu[mm] % 1.0) * tw, 0, tw - 1).astype(np.int64)
            y = np.clip((1 - (tv[mm] % 1.0)) * th, 0, th - 1).astype(np.int64)
            colr[mm] = im[y, x]
        allpix.append(row[ok] * W + col[ok]); alld.append(d[ok]); allcol.append(colr[ok])
        start = end
    pix = np.concatenate(allpix); dd = np.concatenate(alld); cc = np.concatenate(allcol)
    key = dd if keep == 'max' else -dd
    order = np.lexsort((key, pix))
    pix, dd, cc = pix[order], dd[order], cc[order]
    last = np.r_[pix[1:] != pix[:-1], True]
    p = pix[last]
    rgb.reshape(-1, 3)[p] = cc[last]; alpha.reshape(-1)[p] = True; depth.reshape(-1)[p] = dd[last]
    return rgb, alpha, depth


def fill_holes(rgb, alpha, iters=3):
    """Fill small splat holes by inpainting."""
    import cv2
    mask = (~alpha).astype(np.uint8) * 255
    return cv2.inpaint(rgb, mask, 3, cv2.INPAINT_TELEA)


def save(img, name, q=92):
    p = os.path.join(OUT, name)
    if name.endswith('.png'):
        Image.fromarray(img).save(p)
    else:
        Image.fromarray(img).save(p, quality=q)
    return p
