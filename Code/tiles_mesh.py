#!/usr/bin/env python3
r"""
tiles_mesh.py - turn the 3D Tiles downloaded by fetch_tiles.py into meshes in our model frame.

For each of assets_<sid>/tiles/furnished and .../defurnished:
  * reads tileset.json (+ external child tilesets), keeps the finest level of detail (leaf tiles)
  * parses .b3dm / .glb / .glTF tiles: node transforms, RTC_CENTER, Draco (needs `pip install DracoPy`),
    base-colour textures (jpg/png/webp; KTX2 is reported and skipped)
  * puts everything in one frame and auto-aligns it to our model frame (x east, y north, z up) by testing the
    plausible axis conventions against the defurnished OBJ we already have
  * writes  tiles/<label>_mesh.obj        geometry only (for mesh_furniture.py)
            tiles/<label>_mesh.npz        V, F, UV, per-face texture id  (for tile_objects.py)
            tiles/<label>_tex/tex_###.jpg textures
            tiles/<label>_mesh.json       frame used, counts, warnings

    python Code\tiles_mesh.py                      # both labels
    python Code\tiles_mesh.py --labels furnished   # one
Needs numpy + Pillow (+ DracoPy only if the tiles are Draco-compressed).
"""
import argparse, glob, io, json, math, os, struct, sys, time
import numpy as np
from PIL import Image

Y_UP_TO_Z_UP = np.array([[1, 0, 0, 0], [0, 0, -1, 0], [0, 1, 0, 0], [0, 0, 0, 1]], float)   # 3D Tiles spec


# ------------------------------------------------------------------ glTF / b3dm parsing
CTYPE = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def split_glb(b):
    if b[:4] != b"glTF":
        raise ValueError("not a GLB")
    off, js, binc = 12, None, b""
    while off + 8 <= len(b):
        n, t = struct.unpack("<II", b[off:off + 8])
        chunk = b[off + 8:off + 8 + n]
        if t == 0x4E4F534A:
            js = json.loads(chunk.decode("utf-8"))
        elif t == 0x004E4942:
            binc = chunk
        off += 8 + n + (-n % 4)
    return js, binc


def read_b3dm(b):
    magic, ver, length, ftj, ftb, btj, btb = struct.unpack("<4sIIIIII", b[:28])
    off = 28
    ft = json.loads(b[off:off + ftj].decode("utf-8").strip() or "{}") if ftj else {}
    off += ftj + ftb + btj + btb
    rtc = ft.get("RTC_CENTER")
    return b[off:], rtc


def accessor(js, binc, i, buffers):
    a = js["accessors"][i]
    dt = CTYPE[a["componentType"]]; nc = NCOMP[a["type"]]; n = a["count"]
    if "bufferView" not in a:
        return np.zeros((n, nc), dt)
    v = js["bufferViews"][a["bufferView"]]
    buf = buffers[v.get("buffer", 0)]
    start = v.get("byteOffset", 0) + a.get("byteOffset", 0)
    item = np.dtype(dt).itemsize * nc
    stride = v.get("byteStride") or item
    if stride == item:
        arr = np.frombuffer(buf, dt, n * nc, start).reshape(n, nc)
    else:
        raw = np.frombuffer(buf, np.uint8, stride * (n - 1) + item, start)
        arr = np.stack([raw[k * stride:k * stride + item].view(dt) for k in range(n)])
    if a.get("normalized"):
        arr = arr.astype(np.float32) / np.iinfo(dt).max
    return arr


def node_matrix(n):
    if "matrix" in n:
        return np.array(n["matrix"], float).reshape(4, 4).T
    T = np.eye(4); R = np.eye(4); Sc = np.eye(4)
    if "translation" in n:
        T[:3, 3] = n["translation"]
    if "rotation" in n:
        x, y, z, w = n["rotation"]
        R[:3, :3] = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
    if "scale" in n:
        Sc[:3, :3] = np.diag(n["scale"])
    return T @ R @ Sc


class Collector:
    """Accumulates triangles from all tiles; textures are de-duplicated by content hash."""
    def __init__(self, texdir):
        self.V, self.F, self.UV, self.T = [], [], [], []
        self.nv = 0
        self.texdir = texdir
        self.tex_ids, self.tex_files = {}, []
        self.warn = set()

    def texture(self, js, binc, buffers, mat_index, base_dir):
        if mat_index is None:
            return -1
        m = js.get("materials", [])[mat_index]
        pbr = m.get("pbrMetallicRoughness", {})
        t = pbr.get("baseColorTexture") or (m.get("extensions", {}).get("KHR_materials_pbrSpecularGlossiness", {}).get("diffuseTexture"))
        if not t:
            return -1
        tex = js["textures"][t["index"]]
        src = tex.get("source")
        ext = tex.get("extensions", {})
        if src is None:
            if "KHR_texture_basisu" in ext:
                self.warn.add("KTX2/Basis textures are not supported by Pillow: those surfaces will be untextured")
                return -1
            src = (ext.get("EXT_texture_webp") or ext.get("EXT_texture_avif") or {}).get("source")
            if src is None:
                return -1
        img = js["images"][src]
        if "bufferView" in img:
            v = js["bufferViews"][img["bufferView"]]
            data = bytes(buffers[v.get("buffer", 0)][v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]])
        elif img.get("uri", "").startswith("data:"):
            import base64
            data = base64.b64decode(img["uri"].split(",", 1)[1])
        else:
            p = os.path.join(base_dir, img.get("uri", ""))
            if not os.path.exists(p):
                return -1
            data = open(p, "rb").read()
        key = hash(data)
        if key in self.tex_ids:
            return self.tex_ids[key]
        try:
            im = Image.open(io.BytesIO(data)).convert("RGB")
        except Exception:
            self.warn.add(f"undecodable texture ({img.get('mimeType')}) skipped")
            return -1
        tid = len(self.tex_files)
        fn = os.path.join(self.texdir, f"tex_{tid:04d}.jpg")
        im.save(fn, quality=90)
        self.tex_ids[key] = tid
        self.tex_files.append(os.path.basename(fn))
        return tid

    def add_gltf(self, js, binc, M_tile, base_dir):
        buffers = []
        for i, b in enumerate(js.get("buffers", [])):
            if "uri" not in b:
                buffers.append(binc)
            elif b["uri"].startswith("data:"):
                import base64
                buffers.append(base64.b64decode(b["uri"].split(",", 1)[1]))
            else:
                buffers.append(open(os.path.join(base_dir, b["uri"]), "rb").read())
        if "EXT_meshopt_compression" in (js.get("extensionsRequired") or []):
            self.warn.add("EXT_meshopt_compression tiles are not supported yet (tell Claude; a decoder can be added)")
            return
        scene = js.get("scenes", [{}])[js.get("scene", 0)] if js.get("scenes") else {"nodes": list(range(len(js.get("nodes", []))))}
        stack = [(n, M_tile) for n in scene.get("nodes", [])]
        while stack:
            ni, Mp = stack.pop()
            node = js["nodes"][ni]
            M = Mp @ node_matrix(node)
            for c in node.get("children", []):
                stack.append((c, M))
            if "mesh" not in node:
                continue
            for prim in js["meshes"][node["mesh"]]["primitives"]:
                if prim.get("mode", 4) != 4:
                    continue
                draco = prim.get("extensions", {}).get("KHR_draco_mesh_compression")
                if draco:
                    try:
                        import DracoPy
                    except ImportError:
                        self.warn.add("tiles are Draco-compressed: run  pip install DracoPy  and rerun"); continue
                    v = js["bufferViews"][draco["bufferView"]]
                    raw = bytes(buffers[v.get("buffer", 0)][v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]])
                    dm = DracoPy.decode(raw)
                    P = np.asarray(dm.points, float).reshape(-1, 3)
                    F = np.asarray(dm.faces, int).reshape(-1, 3)
                    uv = getattr(dm, "tex_coord", None)
                    UV = np.asarray(uv, float).reshape(-1, 2) if uv is not None and len(uv) else None
                else:
                    P = accessor(js, binc, prim["attributes"]["POSITION"], buffers).astype(float)
                    F = (accessor(js, binc, prim["indices"], buffers).reshape(-1, 3).astype(int) if "indices" in prim
                         else np.arange(len(P)).reshape(-1, 3))
                    UV = (accessor(js, binc, prim["attributes"]["TEXCOORD_0"], buffers).astype(float)
                          if "TEXCOORD_0" in prim["attributes"] else None)
                Ph = np.c_[P, np.ones(len(P))] @ M.T
                tid = self.texture(js, binc, buffers, prim.get("material"), base_dir) if UV is not None else -1
                self.V.append(Ph[:, :3]); self.F.append(F + self.nv)
                self.UV.append(UV if UV is not None else np.zeros((len(P), 2)))
                self.T.append(np.full(len(F), tid, np.int32))
                self.nv += len(P)

    def arrays(self):
        if not self.V:
            return None
        return np.concatenate(self.V), np.concatenate(self.F), np.concatenate(self.UV), np.concatenate(self.T)


def leaf_tiles(tileset_path):
    """(content path, accumulated transform) for every leaf tile, following external tilesets."""
    out = []

    def walk(node, M, base):
        if "transform" in node:
            M = M @ np.array(node["transform"], float).reshape(4, 4).T
        kids = node.get("children") or []
        contents = [c for c in ([node.get("content")] + (node.get("contents") or [])) if c]
        for c in contents:
            uri = (c.get("uri") or c.get("url") or "").split("?")[0]
            p = os.path.normpath(os.path.join(base, uri))
            if uri.endswith(".json"):
                if os.path.exists(p):
                    sub = json.load(open(p))
                    walk(sub["root"], M, os.path.dirname(p))
            elif not kids and os.path.exists(p):
                out.append((p, M))
        for k in kids:
            walk(k, M, base)
    ts = json.load(open(tileset_path))
    walk(ts["root"], np.eye(4), os.path.dirname(tileset_path))
    up = (ts.get("asset", {}).get("gltfUpAxis") or "Y").upper()
    return out, up


# ------------------------------------------------------------------ alignment to the model frame
def near_fraction(P, ref, r=0.12, cell=0.06):
    o = ref.min(0) - 1
    key = lambda X: np.floor((X - o) / cell).astype(np.int64)
    K = key(ref); pack = lambda I: (I[:, 0] + 4) * 2 ** 40 + (I[:, 1] + 4) * 2 ** 20 + (I[:, 2] + 4)
    S = np.unique(pack(K))
    I = key(P); hit = np.zeros(len(P), bool)
    k = int(math.ceil(r / cell))
    for dx in range(-k, k + 1):
        for dy in range(-k, k + 1):
            for dz in range(-k, k + 1):
                kk = pack(I + np.array([dx, dy, dz]))
                pos = np.clip(np.searchsorted(S, kk), 0, len(S) - 1)
                hit |= S[pos] == kk
    return hit.mean()


CANDIDATES = {
    "as-is (z up)": np.eye(3),
    "y-up glTF -> z-up": np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], float),
    "Showcase frame -> model (x, -z, y)": np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], float).T,
    "y-up, x flipped": np.array([[-1, 0, 0], [0, 0, 1], [0, 1, 0]], float),
}


def align(V, ref, log):
    rng = np.random.default_rng(0)
    sv = V[rng.choice(len(V), min(len(V), 60000), replace=False)]
    sr = ref[rng.choice(len(ref), min(len(ref), 200000), replace=False)]
    best = None
    for name, R in CANDIDATES.items():
        P = sv @ R.T
        # allow a translation: match centroids of the bounding boxes, then test
        t = (sr.min(0) + sr.max(0)) / 2 - (P.min(0) + P.max(0)) / 2
        for tt, tag in ((np.zeros(3), "no shift"), (t, "bbox-centred")):
            f = near_fraction(P + tt, sr)
            log(f"   frame test: {name:38s} {tag:13s} overlap {f:.2f}")
            if best is None or f > best[0]:
                best = (f, name, R, tt)
    return best


def sample_obj(path, n=200000):
    V, F = [], []
    for line in open(path, errors="ignore"):
        if line.startswith("v "):
            V.append([float(x) for x in line.split()[1:4]])
        elif line.startswith("f "):
            ix = [int(t.split("/")[0]) - 1 for t in line.split()[1:]]
            for k in range(1, len(ix) - 1):
                F.append((ix[0], ix[k], ix[k + 1]))
    V, F = np.array(V), np.array(F)
    tri = V[F]; area = 0.5 * np.linalg.norm(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1)
    rng = np.random.default_rng(1)
    t = rng.choice(len(F), n, p=area / area.sum()); r1, r2 = rng.random(n), rng.random(n); s = np.sqrt(r1)
    return (1 - s)[:, None] * tri[t, 0] + (s * (1 - r2))[:, None] * tri[t, 1] + (s * r2)[:, None] * tri[t, 2]


def write_obj(path, V, F):
    with open(path, "w") as fh:
        fh.write("".join(f"v {v[0]:.4f} {v[1]:.4f} {v[2]:.4f}\n" for v in V))
        fh.write("".join(f"f {f[0]+1} {f[1]+1} {f[2]+1}\n" for f in F))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", default="Jxmnkp6KpJN")
    ap.add_argument("--labels", nargs="*", default=["furnished", "defurnished"])
    ap.add_argument("--reference", default=None, help="OBJ in our model frame (default: the defurnished OBJ in assets_<sid>/matterport/meshes)")
    a = ap.parse_args()
    root = os.path.join(f"assets_{a.model}", "tiles")
    ref_path = a.reference or (sorted(glob.glob(os.path.join(f"assets_{a.model}", "matterport", "meshes", "*defurnished*.obj"))) or [None])[0]
    ref = sample_obj(ref_path) if ref_path else None
    for label in a.labels:
        t0 = time.time()
        ts = os.path.join(root, label, "tileset.json")
        if not os.path.exists(ts):
            print(f"[{label}] no {ts} - run fetch_tiles.py first"); continue
        tiles, up = leaf_tiles(ts)
        print(f"[{label}] {len(tiles)} leaf tiles (gltfUpAxis {up})", flush=True)
        texdir = os.path.join(root, f"{label}_tex"); os.makedirs(texdir, exist_ok=True)
        col = Collector(texdir)
        for p, M in tiles:
            b = open(p, "rb").read()
            Mt = M @ (Y_UP_TO_Z_UP if up == "Y" else np.eye(4))
            try:
                if b[:4] == b"b3dm":
                    g, rtc = read_b3dm(b)
                    if rtc:
                        T = np.eye(4); T[:3, 3] = rtc; Mt = M @ T @ (Y_UP_TO_Z_UP if up == "Y" else np.eye(4))
                    js, binc = split_glb(g)
                elif b[:4] == b"glTF":
                    js, binc = split_glb(b)
                elif p.endswith(".gltf"):
                    js, binc = json.loads(b.decode("utf-8")), b""
                else:
                    col.warn.add(f"unsupported tile format: {os.path.splitext(p)[1]} ({b[:4]!r})"); continue
                col.add_gltf(js, binc, Mt, os.path.dirname(p))
            except Exception as e:
                col.warn.add(f"tile failed: {os.path.basename(p)}: {e}")
        arr = col.arrays()
        if arr is None:
            print(f"[{label}] no geometry. warnings: {sorted(col.warn)}"); continue
        V, F, UV, T = arr
        info = {"label": label, "tiles": len(tiles), "vertices": int(len(V)), "triangles": int(len(F)),
                "textures": len(col.tex_files), "textured_faces": float((T >= 0).mean()), "warnings": sorted(col.warn)}
        if ref is not None:
            f, name, R, tt = align(V, ref, print)
            V = V @ R.T + tt
            info.update(frame=name, frame_overlap=round(float(f), 3), translation=[round(float(x), 4) for x in tt])
            if f < 0.3:
                info["warnings"].append(f"weak alignment to the reference mesh ({f:.2f}): check {label}_mesh.obj in a viewer")
        base = os.path.join(root, f"{label}_mesh")
        write_obj(base + ".obj", V, F)
        np.savez_compressed(base + ".npz", V=V.astype(np.float32), F=F.astype(np.int32), UV=UV.astype(np.float32),
                            T=T.astype(np.int32), tex=np.array(col.tex_files))
        json.dump(info, open(base + ".json", "w"), indent=1)
        print(f"[{label}] {len(F)} triangles, {len(col.tex_files)} textures, frame '{info.get('frame')}' "
              f"(overlap {info.get('frame_overlap')}) in {time.time()-t0:.0f}s")
        for w in info["warnings"]:
            print("   WARNING:", w)


if __name__ == "__main__":
    main()
