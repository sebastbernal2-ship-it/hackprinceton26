#!/usr/bin/env python3
r"""
texture_bake.py - colour the empty-room mesh and every furniture object with real pixels from the
Matterport panoramas, using the pano poses calibrated by pano_pipeline.py.

  * empty room  : defurnished panoramas -> dense vertex colours on the defurnished mesh
  * furniture   : furnished panoramas   -> each object rebuilt as a coloured model
                  (tables/desks/counters with a flat top -> slab + legs, everything else -> box),
                  in the object's local frame so the editor can move/rotate it.

Run from the repo root (after pano_pipeline.py and mesh_furniture_v2.py):
    python modeling/texture_bake.py
Writes into pano_<sid>/mesh_diff/:  empty_room_textured.obj, objects_tex/obj_###.obj, scene_textured.json
OBJ colour format: "v x y z r g b" (0..1) - read by modeling/editor3d.html, Blender and MeshLab.
Needs numpy + Pillow only.
"""
import argparse, glob, json, math, os, sys, time
import numpy as np
from PIL import Image

EQ_W = 2048


# ------------------------------------------------------------------ io
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


def write_obj(path, V, F, C, name="mesh"):
    with open(path, "w") as fh:
        fh.write(f"o {name}\n")
        fh.write("".join(f"v {v[0]:.4f} {v[1]:.4f} {v[2]:.4f} {c[0]:.3f} {c[1]:.3f} {c[2]:.3f}\n" for v, c in zip(V, C)))
        fh.write("".join(f"f {f[0]+1} {f[1]+1} {f[2]+1}\n" for f in F))


def equirect(faces, width=EQ_W):
    """Matterport skybox (0 up, 1-4 horizon turning right, 5 down) -> equirect. Same as pano_pipeline."""
    h = width // 2
    lon = (np.arange(width) + 0.5) / width * 2 * np.pi - np.pi
    lat = np.pi / 2 - (np.arange(h) + 0.5) / h * np.pi
    lon, lat = np.meshgrid(lon, lat)
    x, y, z = np.cos(lat) * np.sin(lon), np.sin(lat), np.cos(lat) * np.cos(lon)
    ax, ay, az = np.abs(x), np.abs(y), np.abs(z)
    out = np.zeros((h, width, 3), np.uint8)
    arrays = [np.asarray(Image.open(f).convert("RGB")) for f in faces]
    n = arrays[0].shape[0]
    with np.errstate(divide="ignore", invalid="ignore"):
        spec = [(1, (az >= ax) & (az >= ay) & (z > 0), x / az, -y / az),
                (2, (ax >= ay) & (ax >= az) & (x > 0), -z / ax, -y / ax),
                (3, (az >= ax) & (az >= ay) & (z < 0), -x / az, -y / az),
                (4, (ax >= ay) & (ax >= az) & (x < 0), z / ax, -y / ax),
                (0, (ay >= ax) & (ay >= az) & (y > 0), x / ay, z / ay),
                (5, (ay >= ax) & (ay >= az) & (y < 0), x / ay, -z / ay)]
    for k, mask, u, v in spec:
        col = np.clip(((u[mask] + 1) / 2 * n).astype(int), 0, n - 1)
        row = np.clip(((v[mask] + 1) / 2 * n).astype(int), 0, n - 1)
        out[mask] = arrays[k][row, col]
    return out


# ------------------------------------------------------------------ geometry
def subdivide(V, F, L):
    """Split every triangle into an n x n barycentric grid so no edge is longer than ~L."""
    outV, outF, base = [], [], 0
    e = np.stack([np.linalg.norm(V[F[:, 0]] - V[F[:, 1]], axis=1), np.linalg.norm(V[F[:, 1]] - V[F[:, 2]], axis=1),
                  np.linalg.norm(V[F[:, 2]] - V[F[:, 0]], axis=1)], 1).max(1)
    nn = np.clip(np.ceil(e / L), 1, 80).astype(int)
    cache = {}
    for n in np.unique(nn):
        if n not in cache:
            bary, tris, idx = [], [], {}
            for i in range(n + 1):
                for j in range(n + 1 - i):
                    idx[(i, j)] = len(bary)
                    bary.append(((n - i - j) / n, i / n, j / n))
            for i in range(n):
                for j in range(n - i):
                    tris.append((idx[(i, j)], idx[(i + 1, j)], idx[(i, j + 1)]))
                    if i + j < n - 1:
                        tris.append((idx[(i + 1, j)], idx[(i + 1, j + 1)], idx[(i, j + 1)]))
            cache[n] = (np.array(bary), np.array(tris))
        B, T = cache[n]
        sel = F[nn == n]
        P = np.einsum("bk,tkd->tbd", B, V[sel])                       # (tris, nb, 3)
        outV.append(P.reshape(-1, 3))
        offs = (np.arange(len(sel)) * len(B))[:, None, None] + base
        outF.append((T[None] + offs).reshape(-1, 3))
        base += len(sel) * len(B)
    return np.concatenate(outV), np.concatenate(outF)


def normals(V, F):
    n = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    N = np.zeros_like(V)
    for k in range(3):
        np.add.at(N, F[:, k], n)
    return N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)


def crosses(P2, C2, walls, shrink=0.18):
    """True where the 2D segment camera->point crosses a plan wall (point end shortened by `shrink`)."""
    d = P2 - C2
    L = np.linalg.norm(d, axis=1, keepdims=True)
    Q = C2 + d * np.clip((L - shrink) / np.maximum(L, 1e-9), 0, 1)
    hit = np.zeros(len(P2), bool)
    for a, b in walls:
        r, s = Q - C2, b - a
        den = r[:, 0] * s[1] - r[:, 1] * s[0]
        with np.errstate(divide="ignore", invalid="ignore"):
            t = ((a[0] - C2[0]) * s[1] - (a[1] - C2[1]) * s[0]) / den
            u = ((a[0] - C2[0]) * r[:, 1] - (a[1] - C2[1]) * r[:, 0]) / den
        hit |= (np.abs(den) > 1e-12) & (t > 0) & (t < 1) & (u > 0) & (u < 1)
    return hit


# ------------------------------------------------------------------ mesh-based pose refinement
def feature_edges(V, F, ang=35, step=0.03):
    """points sampled along mesh crease edges (where adjacent face normals differ > ang deg)"""
    n=np.cross(V[F[:,1]]-V[F[:,0]],V[F[:,2]]-V[F[:,0]]); a=np.linalg.norm(n,axis=1); ok=a>1e-9; n[ok]/=a[ok,None]
    q=np.round(V/1e-3).astype(np.int64); _,w=np.unique(q,axis=0,return_inverse=True); w=w.ravel(); W=w[F]
    E=np.concatenate([W[:,[0,1]],W[:,[1,2]],W[:,[2,0]]]); fi=np.tile(np.arange(len(F)),3)
    Vi=np.concatenate([F[:,[0,1]],F[:,[1,2]],F[:,[2,0]]])
    key=np.sort(E,1); k=key[:,0]*(w.max()+1)+key[:,1]
    o=np.argsort(k); k=k[o]; fi=fi[o]; Vi=Vi[o]
    same=np.where(k[1:]==k[:-1])[0]
    cos=(n[fi[same]]*n[fi[same+1]]).sum(1)
    sel=same[np.abs(cos)<math.cos(math.radians(ang))]
    # also open edges (boundaries, e.g. window/door frames)
    cnt=np.bincount(np.searchsorted(np.unique(k),k))
    P=[]
    for i in sel:
        a_,b_=V[Vi[i,0]],V[Vi[i,1]]; L=np.linalg.norm(b_-a_); m=max(2,int(L/step))
        t=np.linspace(0,1,m)[:,None]; P.append(a_+t*(b_-a_))
    return np.concatenate(P) if P else np.zeros((0,3))
def grad_img(eq):
    g=eq.astype(np.float32).mean(2)
    gx=np.abs(np.diff(g,axis=1,append=g[:,-1:])); gy=np.abs(np.diff(g,axis=0,append=g[-1:]))
    G=np.maximum(gx,gy)
    # small dilation
    G=np.maximum.reduce([G,np.roll(G,1,0),np.roll(G,-1,0),np.roll(G,1,1),np.roll(G,-1,1)])
    return G
def score_yaws(P, cam, G, mirror, yaws_deg):
    H,W=G.shape; d=P-cam
    th=np.arctan2(d[:,1],d[:,0]); lat=np.arctan2(d[:,2],np.hypot(d[:,0],d[:,1]))
    row=((np.pi/2-lat)/np.pi*H).astype(int).clip(0,H-1)
    keep=np.abs(lat)<np.radians(60); th,row=th[keep],row[keep]
    out=[]
    for y in yaws_deg:
        lon=((th-np.radians(y))*mirror+np.pi)%(2*np.pi)-np.pi
        col=((lon+np.pi)/(2*np.pi)*W).astype(int).clip(0,W-1)
        out.append(G[row,col].mean())
    return np.array(out)

def all_edges(V, F, ang=35, step=0.02):
    """crease edges + open (boundary) edges"""
    n=np.cross(V[F[:,1]]-V[F[:,0]],V[F[:,2]]-V[F[:,0]]); a=np.linalg.norm(n,axis=1); ok=a>1e-9; n[ok]/=a[ok,None]
    q=np.round(V/2e-3).astype(np.int64); _,w=np.unique(q,axis=0,return_inverse=True); w=w.ravel(); W=w[F]
    E=np.concatenate([W[:,[0,1]],W[:,[1,2]],W[:,[2,0]]]); fi=np.tile(np.arange(len(F)),3)
    Vi=np.concatenate([F[:,[0,1]],F[:,[1,2]],F[:,[2,0]]])
    key=np.sort(E,1); k=key[:,0]*(w.max()+1)+key[:,1]
    uk,inv,cnt=np.unique(k,return_inverse=True,return_counts=True)
    first=np.full(len(uk),-1); first[inv[::-1]]=np.arange(len(k))[::-1]
    sel=[]
    # open edges
    sel+=list(first[cnt==1])
    # creases
    o=np.argsort(k,kind='stable'); ks=k[o]; same=np.where(ks[1:]==ks[:-1])[0]
    i1,i2=o[same],o[same+1]; cos=np.abs((n[fi[i1]]*n[fi[i2]]).sum(1))
    sel+=list(i1[cos<np.cos(np.radians(ang))])
    P=[]
    for i in sel:
        a_,b_=V[Vi[i,0]],V[Vi[i,1]]; L=np.linalg.norm(b_-a_)
        if L<0.08: continue
        m=max(2,int(L/step)); t=np.linspace(0.05,0.95,m)[:,None]; P.append(a_+t*(b_-a_))
    return np.concatenate(P)

def visible(P, cam, Vd, Fd, H=256, W=512, tol=0.12):
    """depth-buffer visibility of points P from cam, using dense surface samples Vd (already subdivided verts)"""
    def proj(X):
        d=X-cam; r=np.linalg.norm(d,axis=1); th=np.arctan2(d[:,1],d[:,0]); lat=np.arcsin(np.clip(d[:,2]/np.maximum(r,1e-9),-1,1))
        return ((np.pi/2-lat)/np.pi*H).astype(int).clip(0,H-1), ((th+np.pi)/(2*np.pi)*W).astype(int).clip(0,W-1), r
    rr,cc,r=proj(Vd); zb=np.full((H,W),1e9); np.minimum.at(zb,(rr,cc),r)
    # erode holes: min over 3x3
    zb=np.minimum.reduce([zb]+[np.roll(np.roll(zb,i,0),j,1) for i in (-1,0,1) for j in (-1,0,1)])
    pr,pc,pr_=proj(P)
    return pr_ <= zb[pr,pc]*(1+0.04)+tol


# ------------------------------------------------------------------ colouring
class Panos:
    def __init__(self, panos, cal, cache_dir, kind, hires_dir=None):
        self.items = []
        for p in panos:
            c = cal.get(p["id"])
            faces = [os.path.join(cache_dir, kind, f"{p['id']}_{k}.jpg") for k in range(6)]
            if hires_dir:
                hi = [os.path.join(hires_dir, f"panoramas_{kind}", f"{p.get('label')}_{p['id']}_face{k}.jpg") for k in range(6)]
                if all(os.path.exists(f) for f in hi):
                    faces = hi
            if not c or not all(os.path.exists(f) for f in faces):
                continue
            self.items.append(dict(id=p["id"], label=p.get("label"), cam=np.array(p["position"], float),
                                   yaw=math.radians(c["yaw_deg"]), mirror=c["mirror"], faces=faces, img=None))

    def refine(self, V, F, Vd, log=print):
        """Re-fit each pano heading (and the global mirror) so the mesh's edges hit image edges."""
        E = all_edges(V, F)
        res = {}
        for it in self.items:
            cam = it["cam"]
            P = E[visible(E, cam, Vd, None) & (np.linalg.norm(E - cam, axis=1) < 9)]
            G = grad_img(equirect(it["faces"], 2048))
            y = np.arange(0, 360, 0.25)
            sc = {m: score_yaws(P, cam, G, m, y) for m in (1, -1)}
            res[it["id"]] = (P, G, sc)
        votes = {m: sum(float(sc[m].max() / max(np.median(sc[m]), 1e-6)) for _, _, sc in res.values()) for m in (1, -1)}
        mirror = self.items[0]["mirror"]                 # pano_pipeline already fixed the mirror; keep it
        out = {}
        for it in self.items:
            _, _, sc = res[it["id"]]
            s = sc[mirror]
            old = math.degrees(it["yaw"]) % 360
            off = (np.arange(len(s)) * 0.25 - old + 180) % 360 - 180
            s_win = np.where(np.abs(off) <= 10, s, -np.inf)       # only a local correction of the pipeline's heading
            k = int(s_win.argmax())
            new = k * 0.25
            conf = float(s[k] / max(np.median(s), 1e-6))
            if conf >= 1.3:
                it["yaw"], it["mirror"] = math.radians(new), mirror
            out[it["id"]] = {"label": it["label"], "yaw_deg": new, "mirror": mirror, "confidence": round(conf, 2),
                             "old_yaw_deg": round(old, 2), "used": conf >= 1.3}
            log(f"   pano {it['label']:>3}: yaw {old:6.1f} -> {new:6.2f}  conf {conf:4.2f}{'' if conf >= 1.3 else '  (kept old)'}")
        log(f"   global mirror {mirror:+d} (votes {votes[1]:.0f} / {votes[-1]:.0f})")
        return out

    def image(self, it):
        if it["img"] is None:
            it["img"] = equirect(it["faces"])
        return it["img"]

    def sample(self, it, P):
        d = P - it["cam"]
        theta = np.arctan2(d[:, 1], d[:, 0])
        lon = ((theta - it["yaw"]) * it["mirror"] + np.pi) % (2 * np.pi) - np.pi
        lat = np.arctan2(d[:, 2], np.hypot(d[:, 0], d[:, 1]))
        img = self.image(it)
        H, W = img.shape[:2]
        col = np.clip(((lon + np.pi) / (2 * np.pi) * W).astype(int), 0, W - 1)
        row = np.clip(((np.pi / 2 - lat) / np.pi * H).astype(int), 0, H - 1)
        return img[row, col].astype(np.float32) / 255.0, lat


def bake(P, N, panos, walls, max_dist=9.0, k=3, only=None, fallback=(0.7, 0.7, 0.7), depth=None):
    """Colour points P (normals N) from the best k panoramas that can see them."""
    acc = np.zeros((len(P), 3), np.float32)
    wsum = np.zeros(len(P), np.float32)
    # candidate weights per pano
    cand = []
    for it in panos.items:
        if only is not None and it["id"] not in only:
            continue
        d = it["cam"] - P
        dist = np.linalg.norm(d, axis=1)
        facing = (d * N).sum(1) / np.maximum(dist, 1e-9)
        ok = (dist < max_dist) & (np.abs(facing) > 0.08)
        idx = np.where(ok)[0]
        if len(idx):
            if depth is not None:
                idx = idx[visible(P[idx], it["cam"], depth, None, H=512, W=1024, tol=0.06)]
            else:
                idx = idx[~crosses(P[idx, :2], it["cam"][:2], walls)]
        w = np.zeros(len(P), np.float32)
        w[idx] = (np.abs(facing[idx]) ** 0.5) / (dist[idx] ** 2 + 0.25)
        cand.append(w)
    if not cand:
        return np.tile(np.array(fallback, np.float32), (len(P), 1)), np.zeros(len(P), bool)
    Wm = np.stack(cand, 1)                                         # (n, panos)
    top = np.argsort(-Wm, 1)[:, :k]
    keep = np.zeros_like(Wm, bool)
    np.put_along_axis(keep, top, True, 1)
    best = Wm.max(1, keepdims=True)
    keep &= Wm >= best * 0.35                                      # only blend views of similar quality
    Wm = np.where(keep, Wm, 0)
    its = [it for it in panos.items if only is None or it["id"] in only]
    for j, it in enumerate(its):
        idx = np.where(Wm[:, j] > 0)[0]
        if not len(idx):
            continue
        col, lat = panos.sample(it, P[idx])
        w = Wm[idx, j] * np.where(lat < -np.radians(68), 0.05, 1.0)  # tripod / nadir patch
        acc[idx] += col * w[:, None]
        wsum[idx] += w
    seen = wsum > 0
    C = np.tile(np.array(fallback, np.float32), (len(P), 1))
    C[seen] = acc[seen] / wsum[seen, None]
    return C, seen


def fill_unseen(V, F, C, seen, iters=30):
    """Diffuse colours into vertices no panorama saw (behind furniture etc.)."""
    C = C.copy()
    s = seen.astype(np.float32)
    for _ in range(iters):
        if s.all():
            break
        acc = np.zeros_like(C); cnt = np.zeros(len(C), np.float32)
        for a, b in ((0, 1), (1, 2), (2, 0), (1, 0), (2, 1), (0, 2)):
            np.add.at(acc, F[:, a], C[F[:, b]] * s[F[:, b], None])
            np.add.at(cnt, F[:, a], s[F[:, b]])
        new = (s == 0) & (cnt > 0)
        C[new] = acc[new] / cnt[new, None]
        s[new] = 1
    return C


# ------------------------------------------------------------------ furniture models
def box_parts(l, w, zb, zt):
    return [((-l / 2, l / 2), (-w / 2, w / 2), (zb, zt))]


def table_parts(l, w, zt):
    top = 0.045
    leg = min(0.06, l / 8, w / 8)
    inset = leg * 0.8
    parts = [((-l / 2, l / 2), (-w / 2, w / 2), (zt - top, zt))]
    for sx in (-1, 1):
        for sy in (-1, 1):
            cx, cy = sx * (l / 2 - inset - leg / 2), sy * (w / 2 - inset - leg / 2)
            parts.append(((cx - leg / 2, cx + leg / 2), (cy - leg / 2, cy + leg / 2), (0.0, zt - top)))
    return parts


def cuboid(xr, yr, zr):
    x0, x1 = xr; y0, y1 = yr; z0, z1 = zr
    V = np.array([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
                  [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], float)
    F = np.array([(0, 2, 1), (0, 3, 2), (4, 5, 6), (4, 6, 7), (0, 1, 5), (0, 5, 4),
                  (1, 2, 6), (1, 6, 5), (2, 3, 7), (2, 7, 6), (3, 0, 4), (3, 4, 7)])
    return V, F


def model_for(o, label):
    b = o["box"]
    l, w, _ = b["size_lwh_m"]
    zb, zt = b["z_bottom"], b["z_top"]
    lab = (label or "").lower()
    flat = "flat_top_extruded_to_floor" in (o.get("flags") or [])
    if (flat or any(k in lab for k in ("table", "desk"))) and zb < 0.05 and 0.4 < zt < 1.2 and "counter" not in lab and "cabinet" not in lab:
        parts, kind = table_parts(l, w, zt), "table"
    else:
        parts, kind = box_parts(l, w, zb, zt), "box"
    Vs, Fs, base = [], [], 0
    for p in parts:
        V, F = cuboid(*p)
        Vs.append(V); Fs.append(F + base); base += len(V)
    # unshare vertices per face so each side gets its own colours & flat normals
    V, F = np.concatenate(Vs), np.concatenate(Fs)
    V, F = V[F.ravel()], np.arange(len(F) * 3).reshape(-1, 3)
    return V, F, kind


def export_panos(md, empty_p, furn_p, width):
    """Full-resolution equirect JPGs + poses, for photo projection in editor3d.html."""
    od = os.path.join(md, "panos"); os.makedirs(od, exist_ok=True)
    fp = {it["id"]: it for it in furn_p.items}
    rows = []
    for it in empty_p.items:
        rec = {"id": it["id"], "label": it["label"], "position": [round(float(x), 4) for x in it["cam"]],
               "yaw_deg": round(math.degrees(it["yaw"]) % 360, 3), "mirror": it["mirror"]}
        for kind, src in (("defurnished", it), ("furnished", fp.get(it["id"]))):
            if not src:
                continue
            fn = f"panos/{it['id']}_{kind}.jpg"
            if not os.path.exists(os.path.join(md, fn)):
                Image.fromarray(equirect(src["faces"], width)).save(os.path.join(md, fn), quality=88)
            rec[kind] = fn
        rows.append(rec)
        it["img"] = None
    json.dump({"note": "equirect: column 0 = lon -180; world heading = yaw + mirror*lon (deg); row 0 = up",
               "panos": rows}, open(os.path.join(md, "pano_poses.json"), "w"), indent=1)
    print(f"exported {len(rows)} panoramas ({width} px) -> {od}")


# ------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pano-dir", default=None)
    ap.add_argument("--edge", type=float, default=0.09, help="max triangle edge (m) of the textured house mesh")
    ap.add_argument("--obj-edge", type=float, default=0.04)
    ap.add_argument("--max-objects", type=int, default=1000)
    ap.add_argument("--no-refine", action="store_true", help="use pano_pipeline headings as they are")
    ap.add_argument("--pano-width", type=int, default=4096, help="width of the exported equirect panoramas (0 = skip)")
    ap.add_argument("--only-export", action="store_true", help="just export panoramas + poses (uses poses_refined.json)")
    a = ap.parse_args()
    if not a.pano_dir:
        c = [d for d in glob.glob("pano_*") if os.path.isdir(d)]
        if len(c) != 1:
            sys.exit("pass --pano-dir pano_<sid>")
        a.pano_dir = c[0]
    md = os.path.join(a.pano_dir, "mesh_diff")
    t0 = time.time()
    plan = json.load(open(os.path.join(a.pano_dir, "plan.json")))
    objs_all = json.load(open(os.path.join(md, "objects.json")))
    cal = objs_all["calibration"]
    panos = json.load(open(os.path.join(a.pano_dir, "panos.json")))
    walls = [(np.array(w["a"], float), np.array(w["b"], float)) for w in plan["walls"] if w.get("type", "wall") == "wall"]
    labels = {}
    lp = os.path.join(md, "labels.json")
    if os.path.exists(lp):
        L = json.load(open(lp))
        labels = {str(k): (v.get("label") if isinstance(v, dict) else v) for k, v in (L.items() if isinstance(L, dict) else [])}
    cache = os.path.join(a.pano_dir, "cache")
    sid = os.path.basename(os.path.normpath(a.pano_dir)).replace("pano_", "")
    hires = os.path.join("assets_" + sid, "matterport")
    hires = hires if os.path.isdir(os.path.join(hires, "panoramas_defurnished")) else None
    empty_p = Panos(panos, cal, cache, "defurnished", hires)
    furn_p = Panos(panos, cal, cache, "furnished", hires)
    print("panorama faces from", hires or cache)
    print(f"{len(empty_p.items)} defurnished / {len(furn_p.items)} furnished panoramas with poses")

    pr = os.path.join(a.pano_dir, "poses_refined.json")
    if a.only_export:
        poses = json.load(open(pr)) if os.path.exists(pr) else {}
        for P_ in (empty_p, furn_p):
            for it in P_.items:
                r = poses.get(it["id"])
                if r and r.get("used"):
                    it["yaw"], it["mirror"] = math.radians(r["yaw_deg"]), r["mirror"]
        export_panos(md, empty_p, furn_p, a.pano_width)
        return

    # ---- house
    V, F = load_obj(os.path.join(md, "empty_room.obj"))
    V0, F0 = V, F
    V, F = subdivide(V, F, a.edge)
    N = normals(V, F)
    print(f"house mesh subdivided to {len(F)} triangles ({time.time()-t0:.0f}s)")
    if not a.no_refine:
        print("refining panorama headings against the mesh ...")
        poses = empty_p.refine(V0, F0, V)
        fp = {it["id"]: it for it in furn_p.items}
        for pid, r in poses.items():               # furnished and defurnished shots share the camera pose
            if r["used"] and pid in fp:
                fp[pid]["yaw"], fp[pid]["mirror"] = math.radians(r["yaw_deg"]), r["mirror"]
        json.dump(poses, open(os.path.join(a.pano_dir, "poses_refined.json"), "w"), indent=1)
        print(f"  saved {a.pano_dir}/poses_refined.json ({time.time()-t0:.0f}s)")
    C, seen = bake(V, N, empty_p, walls, depth=V)
    print(f"  coloured {seen.mean()*100:.0f}% of vertices directly ({time.time()-t0:.0f}s)")
    C = fill_unseen(V, F, C, seen)
    write_obj(os.path.join(md, "empty_room_textured.obj"), V, F, C, "empty_room")

    # ---- furniture
    od = os.path.join(md, "objects_tex"); os.makedirs(od, exist_ok=True)
    out = []
    todo = [o for o in objs_all["objects"] if o.get("layer") in ("furniture", "surface", "floor_covering")][: a.max_objects]
    for o in todo:
        b = o["box"]
        lab = o.get("label") or labels.get(str(o["id"]))
        Vl, Fl, kind = model_for(o, lab)
        Vl, Fl = subdivide(Vl, Fl, a.obj_edge)
        # world positions of the local model (rotate by yaw, move to centre, lift to floor)
        ang = math.radians(b["yaw_deg"])
        R = np.array([[math.cos(ang), -math.sin(ang)], [math.sin(ang), math.cos(ang)]])
        Pw = np.c_[Vl[:, :2] @ R.T + np.array(b["centre"][:2]), Vl[:, 2] + o["floor_z"]]
        Nw = normals(Pw, Fl)
        prefer = set()
        pv = o.get("primary_view") or {}
        if pv.get("pano"):
            prefer.add(pv["pano"])
        ids_by_label = {it["label"]: it["id"] for it in furn_p.items}
        prefer |= {ids_by_label[s] for s in o.get("seen_from_panos") or [] if s in ids_by_label}
        Cl, seen_o = bake(Pw, Nw, furn_p, walls, max_dist=6.0, k=2, only=prefer or None, fallback=(0.55, 0.5, 0.45), depth=V)
        if seen_o.mean() < 0.5 and prefer:
            Cl2, s2 = bake(Pw, Nw, furn_p, walls, max_dist=6.0, k=2, fallback=(0.55, 0.5, 0.45), depth=V)
            Cl[~seen_o & s2] = Cl2[~seen_o & s2]; seen_o |= s2
        Cl[Nw[:, 2] < -0.7] *= 0.35                                  # undersides: dark
        Cl = fill_unseen(Vl, Fl, Cl, seen_o, iters=10)
        fn = f"objects_tex/obj_{o['id']:03d}.obj"
        write_obj(os.path.join(md, fn), Vl, Fl, Cl, f"obj_{o['id']:03d}")
        out.append({"id": o["id"], "file": fn, "model": kind, "label": lab, "seen_fraction": round(float(seen_o.mean()), 2)})
    json.dump({"house": "empty_room_textured.obj", "frame": "objects are local: origin = box centre (x,y) and floor (z), "
               "unrotated; rotate by yaw_deg and translate to the box centre", "objects": out},
              open(os.path.join(md, "scene_textured.json"), "w"), indent=1)
    if a.pano_width:
        export_panos(md, empty_p, furn_p, a.pano_width)
    print(f"{len(out)} furniture models written ({time.time()-t0:.0f}s) -> {md}")


if __name__ == "__main__":
    main()
