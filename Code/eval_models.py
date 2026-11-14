#!/usr/bin/env python3
r"""
eval_models.py - objective realism check for furniture model GLBs: tears, empty/open sides, doubled surfaces.

How it measures: each model is viewed orthographically from 25 directions the way people see furniture (8 azimuths x
elevations 10/35/60 deg + straight down; never from below - the underside sits on the floor). Every pixel ray (1.5 cm)
collects the surface layers it crosses (dense point splats, 0.6 cm depth bins) and whether each layer faces the viewer
(outward normals from the triangle winding). A closed, single-layer object gives front, back, front, back... on every ray.
Defects per ray:
    see-through : the first layer seen is a BACK face -> you look into the object through a tear or a missing side
    doubled     : two front faces in a row -> a second shell (ghost copy / overlapping patch) over the real surface
    open%       = rays with any defect / rays that hit the object (lower is better; 0 = closed, clean surface)

Also reports boundary-edge length of the welded mesh (m of open edges = tears/seams) for information.

    python Code\eval_models.py --scene scene_tiles.json   --label raw
    python Code\eval_models.py --scene scene_refined.json --label refine --ids 0 2 8 --render out.png
    python Code\eval_models.py --scene scene_variant_A.json --all          # every object, not just the test set

--scene is relative to pano_<model>/mesh_diff/ (or absolute). Writes eval_<label>.json next to it.
"""
import argparse, io, json, math, os, struct, sys, time
import numpy as np
from PIL import Image

TEST_SET = [0, 8, 2, 10, 59, 4, 105, 44, 16, 36, 1, 116]   # sofas, bed, piano, wardrobes, table, chairs, dresser, ...


# ------------------------------------------------------------------ GLB (all primitives, any of: uv+jpeg, COLOR_0, factor)
def load_glb(path):
    b = open(path, "rb").read()
    off, js, bo = 12, None, None
    while off + 8 <= len(b):
        n, t = struct.unpack_from("<II", b, off)
        if t == 0x4E4F534A:
            js = json.loads(b[off + 8:off + 8 + n])
        elif t == 0x004E4942:
            bo = off + 8
        off += 8 + n + ((-n) % 4)

    def view(i):
        v = js["bufferViews"][i]; o = bo + v.get("byteOffset", 0); return b[o:o + v["byteLength"]]

    def acc(i):
        a = js["accessors"][i]; v = js["bufferViews"][a["bufferView"]]
        nc = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
        dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[a["componentType"]]
        x = np.frombuffer(b, dt, a["count"] * nc, bo + v.get("byteOffset", 0) + a.get("byteOffset", 0)).astype(float)
        if a["componentType"] == 5121 and a.get("normalized"):
            x = x / 255
        elif a["componentType"] == 5123 and a.get("normalized"):
            x = x / 65535
        return x.reshape(-1, nc) if nc > 1 else x

    prims = []
    for mesh in js["meshes"]:
        for p in mesh["primitives"]:
            P = acc(p["attributes"]["POSITION"])
            F = acc(p["indices"]).astype(np.int64).reshape(-1, 3) if "indices" in p else np.arange(len(P)).reshape(-1, 3)
            d = {"P": P, "F": F, "UV": None, "img": None, "COL": None, "color": np.array([0.6, 0.6, 0.6]),
                 "name": js["materials"][p["material"]].get("name") if "material" in p else None}
            if "TEXCOORD_0" in p["attributes"]:
                d["UV"] = acc(p["attributes"]["TEXCOORD_0"])
            if "COLOR_0" in p["attributes"]:
                c = acc(p["attributes"]["COLOR_0"])[:, :3]
                d["COL"] = np.clip(c, 0, 1) ** (1 / 2.2)          # linear -> display
            pbr = js["materials"][p["material"]].get("pbrMetallicRoughness", {}) if "material" in p else {}
            if "baseColorTexture" in pbr:
                img = js["images"][js["textures"][pbr["baseColorTexture"]["index"]]["source"]]
                d["img"] = np.asarray(Image.open(io.BytesIO(view(img["bufferView"]))).convert("RGB"), np.float32) / 255
            elif "baseColorFactor" in pbr:
                d["color"] = np.array(pbr["baseColorFactor"][:3])
            prims.append(d)
    return prims


# ------------------------------------------------------------------ dense lattice samples (no gaps at `spacing`)
def lattice_samples(prims, spacing, cap=3_000_000):
    X, N, C = [], [], []
    tot = sum(len(p["F"]) for p in prims)
    for p in prims:
        if not len(p["F"]):
            continue
        T = p["P"][p["F"]]
        cr = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]); ln = np.linalg.norm(cr, axis=1)
        ok = ln > 1e-12; T, cr, ln, Fi = T[ok], cr[ok], ln[ok], np.flatnonzero(ok)
        nrm = cr / ln[:, None]
        L = np.linalg.norm(T - np.roll(T, 1, axis=1), axis=2).max(1)
        K = np.clip(np.ceil(L / spacing).astype(int), 1, 200)
        for k in np.unique(K):
            sel = np.flatnonzero(K == k)
            ii, jj = np.meshgrid(np.arange(k + 1), np.arange(k + 1), indexing="ij")
            m = ii + jj <= k
            bc = np.c_[ii[m], jj[m]] / k                    # (q,2)
            b0 = 1 - bc.sum(1)
            Tt = T[sel]
            pts = (b0[None, :, None] * Tt[:, None, 0] + bc[None, :, 0, None] * Tt[:, None, 1] + bc[None, :, 1, None] * Tt[:, None, 2])
            X.append(pts.reshape(-1, 3)); N.append(np.repeat(nrm[sel], len(b0), 0))
            if p["COL"] is not None:
                Cv = p["COL"][p["F"][Fi[sel]]]
                col = b0[None, :, None] * Cv[:, None, 0] + bc[None, :, 0, None] * Cv[:, None, 1] + bc[None, :, 1, None] * Cv[:, None, 2]
                C.append(col.reshape(-1, 3))
            elif p["UV"] is not None and p["img"] is not None:
                U = p["UV"][p["F"][Fi[sel]]]
                uv = (b0[None, :, None] * U[:, None, 0] + bc[None, :, 0, None] * U[:, None, 1] + bc[None, :, 1, None] * U[:, None, 2]).reshape(-1, 2)
                h, w = p["img"].shape[:2]
                C.append(p["img"][np.clip(np.rint(uv[:, 1] * (h - 1)), 0, h - 1).astype(int), np.clip(np.rint(uv[:, 0] * (w - 1)), 0, w - 1).astype(int)])
            else:
                C.append(np.tile(p["color"], (len(sel) * len(b0), 1)))
    if not X:
        return np.zeros((0, 3)), np.zeros((0, 3)), np.zeros((0, 3))
    X, N, C = np.vstack(X), np.vstack(N), np.vstack(C)
    if len(X) > cap:
        k = np.random.default_rng(0).choice(len(X), cap, replace=False); X, N, C = X[k], N[k], C[k]
    return X, N, C


def view_dirs():
    out = []
    for el in (10, 35, 60):
        for az in range(0, 360, 45):
            e, a = math.radians(el), math.radians(az)
            out.append((-math.cos(e) * math.cos(a), -math.cos(e) * math.sin(a), -math.sin(e)))   # camera -> scene
    out.append((0.0, 0.0, -1.0))
    return np.array(out)


def basis(v):
    up = np.array([0, 0, 1.0]) if abs(v[2]) < 0.95 else np.array([1.0, 0, 0])
    u = np.cross(up, v); u /= np.linalg.norm(u); w = np.cross(v, u)
    return u, w


def analyse(X, N, v, pix=0.015, dbin=0.006):
    """Per-pixel layer sequence along view v. Returns dict of pixel arrays + first-hit info for rendering."""
    u, w = basis(v)
    a, bb, d = X @ u, X @ w, X @ v
    i = np.floor((a - a.min()) / pix).astype(np.int64); j = np.floor((bb - bb.min()) / pix).astype(np.int64)
    k = np.floor((d - d.min()) / dbin).astype(np.int64)
    W = j.max() + 1
    pixid = i * W + j
    face = np.where((N @ v) < 0, 1, -1)                     # +1 front-facing (normal towards the camera)
    key = pixid * (k.max() + 2) + k
    o = np.argsort(key, kind="stable"); key_s, pix_s, k_s, f_s = key[o], pixid[o], k[o], face[o]
    uk, st = np.unique(key_s, return_index=True)
    fs = np.add.reduceat(f_s, st); pk = pix_s[st]; kk = k_s[st]
    new_layer = np.r_[True, (pk[1:] != pk[:-1]) | (kk[1:] != kk[:-1] + 1)]
    lid = np.cumsum(new_layer) - 1
    lsum = np.bincount(lid, fs); lsign = np.sign(lsum)
    lpix = pk[new_layer]
    first = np.r_[True, lpix[1:] != lpix[:-1]]
    see = first & (lsign < 0)
    dbl = (~first) & (lsign > 0) & (np.r_[0, lsign[:-1]] > 0)
    pixels = np.unique(lpix)
    bad_pix = np.unique(np.r_[lpix[see], lpix[dbl]])
    return {"n_pix": len(pixels), "see": int(np.unique(lpix[see]).size), "dbl": int(np.unique(lpix[dbl]).size),
            "bad": int(bad_pix.size), "lpix": lpix, "first": first, "see_pix": np.unique(lpix[see]),
            "dbl_pix": np.unique(lpix[dbl]), "i": i, "j": j, "d": d, "W": W, "pixid": pixid}


def weld_boundary_length(prims):
    V = np.vstack([p["P"] for p in prims if len(p["F"])]) if prims else np.zeros((0, 3))
    if not len(V):
        return 0.0
    off = np.r_[0, np.cumsum([len(p["P"]) for p in prims if len(p["F"])])]
    F = np.vstack([p["F"] + off[n] for n, p in enumerate([p for p in prims if len(p["F"])])])
    _, W = np.unique(np.round(V / 1e-3).astype(np.int64), axis=0, return_inverse=True); W = W.reshape(-1)
    FW = W[F]; E = np.sort(FW[:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2), 1)
    E = E[E[:, 0] != E[:, 1]]
    u, c = np.unique(E, axis=0, return_counts=True)
    bd = u[c == 1]
    rep = np.zeros(W.max() + 1, np.int64); rep[W] = np.arange(len(W))
    return float(np.linalg.norm(V[rep[bd[:, 0]]] - V[rep[bd[:, 1]]], axis=1).sum())


def evaluate(path):
    prims = load_glb(path)
    X, N, C = lattice_samples(prims, 0.005)
    if len(X) < 50:
        return None, None
    res = {"see": 0, "dbl": 0, "bad": 0, "n": 0}; per = []
    for v in view_dirs():
        r = analyse(X, N, v)
        res["see"] += r["see"]; res["dbl"] += r["dbl"]; res["bad"] += r["bad"]; res["n"] += r["n_pix"]
        per.append(r["bad"] / max(r["n_pix"], 1))
    out = {"open_pct": round(100 * res["bad"] / max(res["n"], 1), 2), "see_through_pct": round(100 * res["see"] / max(res["n"], 1), 2),
           "doubled_pct": round(100 * res["dbl"] / max(res["n"], 1), 2), "worst_view_pct": round(100 * max(per), 2),
           "open_edge_m": round(weld_boundary_length(prims), 2), "triangles": int(sum(len(p["F"]) for p in prims))}
    return out, (X, N, C)


# ------------------------------------------------------------------ render: colour first hit; defects magenta/cyan
def render_views(X, N, C, views, pix=0.012):
    imgs = []
    for v in views:
        r = analyse(X, N, v, pix=pix)
        i, j, d = r["i"], r["j"], r["d"]
        H, Wd = i.max() + 1, r["W"]
        depth = np.full(H * Wd, np.inf); pid = r["pixid"]
        np.minimum.at(depth, pid, d)
        top = d <= depth[pid] + 0.004
        img = np.ones((H * Wd, 3))
        shade = 0.55 + 0.45 * np.clip(-(N @ v), 0, 1)
        col = np.clip(C * shade[:, None], 0, 1)
        img[pid[top]] = col[top]
        img[r["see_pix"]] = img[r["see_pix"]] * 0.3 + np.array([1, 0, 1]) * 0.7
        img[r["dbl_pix"]] = img[r["dbl_pix"]] * 0.3 + np.array([0, 0.9, 1]) * 0.7
        img = img.reshape(H, Wd, 3).transpose(1, 0, 2)[::-1]        # u right, w up
        imgs.append(img)
    return imgs


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", default="zvKHR9DHNjJ")
    ap.add_argument("--scene", required=True)
    ap.add_argument("--label", default=None)
    ap.add_argument("--ids", type=int, nargs="*")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--render", help="png with 4 views per object (magenta = see-through, cyan = doubled)")
    a = ap.parse_args()
    md = os.path.join(f"pano_{a.model}", "mesh_diff")
    sp = a.scene if os.path.isabs(a.scene) else os.path.join(md, a.scene)
    scene = json.load(open(sp))
    objs = {o["id"]: o for o in json.load(open(os.path.join(md, "objects.json")))["objects"]}
    ids = a.ids or (None if a.all else TEST_SET)
    rows, rend = [], []
    t0 = time.time()
    for r in scene["objects"]:
        if not r.get("file") or (ids is not None and r["id"] not in ids):
            continue
        fp = r["file"] if os.path.isabs(r["file"]) else os.path.join(md, r["file"])
        if not os.path.exists(fp):
            print(f"  obj {r['id']}: missing {fp}"); continue
        m, pts = evaluate(fp)
        if m is None:
            continue
        m.update(id=r["id"], kind=objs.get(r["id"], {}).get("kind"))
        rows.append(m)
        print(f"  obj {r['id']:3d} {str(m['kind']):12s} open {m['open_pct']:6.2f}%  see-through {m['see_through_pct']:6.2f}%  "
              f"doubled {m['doubled_pct']:6.2f}%  worst view {m['worst_view_pct']:6.2f}%  open edges {m['open_edge_m']:7.2f} m  "
              f"{m['triangles']} tris", flush=True)
        if a.render:
            rend.append((r["id"], m, render_views(*pts, view_dirs()[[1, 5, 11, 24]])))
    if rows:
        mean = {k: round(float(np.mean([x[k] for x in rows])), 2) for k in ("open_pct", "see_through_pct", "doubled_pct", "worst_view_pct", "open_edge_m")}
        print(f"MEAN over {len(rows)} objects: " + "  ".join(f"{k} {v}" for k, v in mean.items()) + f"   ({time.time() - t0:.0f}s)")
        label = a.label or os.path.splitext(os.path.basename(sp))[0]
        json.dump({"scene": sp, "mean": mean, "objects": rows}, open(os.path.join(md, f"eval_{label}.json"), "w"), indent=1)
    if a.render and rend:
        import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
        fig, axs = plt.subplots(len(rend), 4, figsize=(12, 3 * len(rend)), squeeze=False)
        for row, (oid, m, imgs) in zip(axs, rend):
            for ax, im in zip(row, imgs):
                ax.imshow(im); ax.axis("off")
            row[0].set_title(f"#{oid} {m['kind']}  open {m['open_pct']}%", fontsize=8, loc="left")
        plt.tight_layout(); plt.savefig(a.render, dpi=90); print("wrote", a.render)


if __name__ == "__main__":
    main()
