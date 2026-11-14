#!/usr/bin/env python3
r"""
matterpak.py - get the MatterPak (Matterport's downloadable bundle: textured OBJ of the furnished house, colored point
cloud, color floor plans) and turn its OBJ into the full-quality furnished mesh used by tile_objects.py.

Based on Model_download_test.py:
    model.bundle(id:"mp:matterpak") { availability assets { url filename } }
If the bundle is not unlocked, nothing is bought: unlocking (unlockModelBundle) charges the Matterport account, so do
that yourself in Matterport Cloud if you want it.

    python Code\matterpak.py                 # download (if needed), extract, convert
    python Code\matterpak.py --no-download   # use a zip that is already there
Looks for the zip in assets_<sid>/matterpak/ and, for convenience, in the repo root (it is moved into assets_<sid>/).

Outputs (same format as tiles_mesh.py, so tile_objects.py and mesh_furniture.py use it automatically):
    assets_<sid>/matterpak/                    extracted OBJ, MTL, textures, floor plans (cloud.xyz only with --cloud)
    assets_<sid>/tiles/furnished_mesh.obj      geometry, model frame (x east, y north, z up)
    assets_<sid>/tiles/furnished_mesh.npz      V, F, UV (top-left origin), per-face texture id, texture names
    assets_<sid>/tiles/furnished_tex/          the textures
    assets_<sid>/tiles/furnished_mesh.json     counts + alignment check against the defurnished OBJ
"""
import argparse, glob, json, os, shutil, sys, time, zipfile
from pathlib import Path

import numpy as np
import requests

API = "https://api.matterport.com/api/models/graph"


def secret(name):
    v = os.environ.get(name)
    if not v and Path(".env").exists():
        for line in Path(".env").read_text().splitlines():
            k, _, val = line.partition("=")
            if k.replace("$env:", "").strip() == name:
                v = val.strip().strip('"').strip("'")
    if not v:
        sys.exit(f"{name} is not set (.env or environment)")
    return v


def download(model, dest):
    auth = (secret("MATTERPORT_API_KEY"), secret("MATTERPORT_API_TOKEN"))
    q = """query($id: ID!){ model(id:$id){ name bundle(id:"mp:matterpak"){ id availability assets{ url filename } } } }"""
    r = requests.post(API, json={"query": q, "variables": {"id": model}}, auth=auth, timeout=120)
    r.raise_for_status()
    d = r.json()
    if d.get("errors"):
        sys.exit(f"GraphQL error: {d['errors'][0].get('message')}")
    b = d["data"]["model"]["bundle"]
    print("MatterPak availability:", b["availability"])
    if b["availability"] != "unlocked":
        sys.exit("Not unlocked. Unlock/buy it in Matterport Cloud (unlocking charges the account), then rerun.")
    saved = []
    for a in b.get("assets") or []:
        name = a.get("filename") or a["url"].split("?")[0].split("/")[-1]
        out = dest / name
        print("downloading", name, flush=True)
        with requests.get(a["url"], stream=True, timeout=600) as rr:          # signed URL: download immediately
            rr.raise_for_status()
            tmp = out.with_suffix(out.suffix + ".part")
            with open(tmp, "wb") as f:
                for chunk in rr.iter_content(1 << 20):
                    f.write(chunk)
            tmp.replace(out)
        saved.append(out)
    return saved


def find_zip(model, dest):
    zips = sorted(dest.glob("*.zip")) or sorted(Path(".").glob(f"*matterpak*{model}*.zip")) or sorted(Path(".").glob("*matterpak*.zip"))
    if not zips:
        return None
    z = zips[0]
    if z.parent.resolve() != dest.resolve():
        target = dest / z.name
        print(f"moving {z} -> {target}")
        shutil.move(str(z), str(target))
        z = target
    return z


def extract(z, dest, cloud):
    with zipfile.ZipFile(z) as zf:
        for n in zf.namelist():
            if n.endswith(".xyz") and not cloud:
                continue
            if not (dest / n).exists():
                zf.extract(n, dest)
    objs = sorted(dest.glob("*.obj"))
    if not objs:
        sys.exit("no OBJ inside the MatterPak")
    return objs[0]


def read_textured_obj(path):
    """OBJ with v / vt / usemtl -> V, F (per-corner unique v/vt pairs), UV, per-face material name."""
    V, VT, faces, mats, cur = [], [], [], [], None
    mtl_names = []
    for line in open(path, errors="ignore"):
        if line.startswith("v "):
            V.append(line.split()[1:4])
        elif line.startswith("vt "):
            VT.append(line.split()[1:3])
        elif line.startswith("usemtl"):
            cur = line.split(None, 1)[1].strip()
            if cur not in mtl_names:
                mtl_names.append(cur)
        elif line.startswith("f "):
            corners = []
            for t in line.split()[1:]:
                p = t.split("/")
                vi = int(p[0]); ti = int(p[1]) if len(p) > 1 and p[1] else 0
                corners.append((vi - 1 if vi > 0 else len(V) + vi, (ti - 1 if ti > 0 else len(VT) + ti) if ti else -1))
            for k in range(1, len(corners) - 1):
                faces.append((corners[0], corners[k], corners[k + 1]))
                mats.append(mtl_names.index(cur) if cur in mtl_names else -1)
    V = np.array(V, float); VT = np.array(VT, float) if VT else np.zeros((1, 2))
    C = np.array(faces, np.int64)                       # (nf, 3, 2): vertex index, uv index
    pair = C[..., 0] * (len(VT) + 1) + (C[..., 1] + 1)
    uniq, inv = np.unique(pair.ravel(), return_inverse=True)
    vi = uniq // (len(VT) + 1); ti = uniq % (len(VT) + 1) - 1
    Vout = V[vi]
    UV = np.where(ti[:, None] >= 0, VT[np.maximum(ti, 0)], 0.0)
    UV[:, 1] = 1.0 - UV[:, 1]                           # OBJ: bottom-left origin -> image rows (top-left)
    return Vout, inv.reshape(-1, 3), UV, np.array(mats, np.int32), mtl_names


def mtl_textures(mtl_path):
    tex, cur = {}, None
    if not mtl_path.exists():
        return tex
    for line in open(mtl_path, errors="ignore"):
        if line.startswith("newmtl"):
            cur = line.split(None, 1)[1].strip()
        elif line.strip().startswith("map_Kd") and cur:
            tex[cur] = line.split(None, 1)[1].strip()
    return tex


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", default="zvKHR9DHNjJ")
    ap.add_argument("--no-download", action="store_true")
    ap.add_argument("--cloud", action="store_true", help="also extract cloud.xyz (~400 MB colored point cloud)")
    a = ap.parse_args()
    t0 = time.time()
    root = Path(f"assets_{a.model}")
    dest = root / "matterpak"; dest.mkdir(parents=True, exist_ok=True)
    z = find_zip(a.model, dest)
    if z is None and not a.no_download:
        saved = download(a.model, dest)
        z = next((s for s in saved if s.suffix == ".zip"), None)
    if z is None:
        sys.exit("no MatterPak zip found (and none downloaded)")
    print("MatterPak:", z)
    obj = extract(z, dest, a.cloud)
    print("OBJ:", obj.name, flush=True)

    V, F, UV, M, mtl_names = read_textured_obj(obj)
    texmap = mtl_textures(obj.with_suffix(".mtl"))
    tdir = root / "tiles" / "furnished_tex"; tdir.mkdir(parents=True, exist_ok=True)
    tex_files, mat_to_tex = [], {}
    for i, m in enumerate(mtl_names):
        fn = texmap.get(m) or (m if m.lower().endswith((".jpg", ".png")) else None)
        if fn and (dest / fn).exists():
            shutil.copyfile(dest / fn, tdir / Path(fn).name)
            mat_to_tex[i] = len(tex_files); tex_files.append(Path(fn).name)
    T = np.array([mat_to_tex.get(int(m), -1) for m in M], np.int32)

    info = {"source": f"MatterPak {z.name}", "obj": obj.name, "vertices": int(len(V)), "triangles": int(len(F)),
            "textures": len(tex_files), "textured_faces": float((T >= 0).mean()), "frame": "MatterPak OBJ (model frame)"}
    ref = sorted(glob.glob(str(root / "matterport" / "meshes" / "*defurnished*.obj")))
    if ref:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import tiles_mesh as tm
        f, name, R, tt = tm.align(V, tm.sample_obj(ref[0]), lambda s: None)
        info.update(alignment=name, alignment_overlap=round(float(f), 3), translation=[round(float(x), 4) for x in tt])
        if name != "as-is (z up)" or np.abs(tt).max() > 1e-6:
            print(f"   applying frame fix '{name}' (overlap {f:.2f})")
            V = V @ R.T + tt
        print(f"   alignment check vs the defurnished OBJ: '{name}', overlap {f:.2f}")
    out = root / "tiles"; out.mkdir(exist_ok=True)
    with open(out / "furnished_mesh.obj", "w") as fh:
        fh.write("".join(f"v {v[0]:.4f} {v[1]:.4f} {v[2]:.4f}\n" for v in V))
        fh.write("".join(f"f {f[0]+1} {f[1]+1} {f[2]+1}\n" for f in F))
    np.savez_compressed(out / "furnished_mesh.npz", V=V.astype(np.float32), F=F.astype(np.int32), UV=UV.astype(np.float32),
                        T=T, tex=np.array(tex_files))
    json.dump(info, open(out / "furnished_mesh.json", "w"), indent=1)
    print(f"{len(F)} triangles, {len(tex_files)} textures ({info['textured_faces']*100:.0f}% of faces textured) "
          f"-> {out} in {time.time()-t0:.0f}s")


if __name__ == "__main__":
    main()
