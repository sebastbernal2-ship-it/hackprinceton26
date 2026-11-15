#!/usr/bin/env python3
r"""
test_mesh_download.py - test the *download* of Matterport meshes, independently of everything else.

Answers one question: is the mesh broken because of how we download it, or because of what
Matterport serves? It does NOT modify or repair any mesh.

What it does
  1. Asks the API (schema introspection, so argument names/types are not guessed) which mesh and
     texture variants exist, for the furnished model AND its defurnished view, trying no filter,
     every format, every resolution, and every format x resolution pair.
  2. Downloads each distinct file TWO ways:
       A. "naive"  = what download_assets.py did (default headers, auto content-decoding)
       B. "strict" = Accept-Encoding: identity, binary, checks Content-Length, sniffs the first
                     bytes (gzip / zip / glb / ply / html-or-json error page) and unpacks wrappers
     and reports whether A and B are byte-identical.
  3. Validates every result (OBJ / GLB / PLY / ZIP): truncation, error pages saved as meshes,
     vertex/face counts, degenerate faces, open edges, flipped neighbours, missing MTL/textures,
     bounding box, units, up axis. Writes a top-down + side wireframe PNG for each (matplotlib).
  4. Compares with the files you already have in assets_<sid>/matterport/meshes (sha256).

Run (PowerShell, repo root, keys already in env or .env):
    python Code\test_mesh_download.py
    python Code\test_mesh_download.py --textures        # also fetch texture images (capped)
    python Code\test_mesh_download.py --local assets_zvKHR9DHNjJ\matterport\meshes   # no API: validate files already on disk

Output: mesh_test_<sid>/  (downloads, previews, report.json, report.txt)
"""
import argparse, gzip, hashlib, io, json, math, os, re, struct, sys, zipfile
from pathlib import Path

import requests

API = "https://api.matterport.com/api/models/graph"
FORMATS = ["obj", "dam", "glb", "gltf", "ply", "fbx", "e57", "xyz", "usdz", "zip"]
RESOLUTIONS = ["50k", "100k", "200k", "500k", "1m", "2m", "full", "high", "medium", "low", "simple_planes"]
LIKELY_FIELDS = ["id", "status", "filename", "format", "resolution", "quality", "provider", "url"]


# ----------------------------------------------------------------------------- API
def secret(name):
    v = os.environ.get(name)
    if not v and Path(".env").exists():
        for line in Path(".env").read_text().splitlines():
            k, _, val = line.partition("=")
            if k.strip() == name:
                v = val.strip().strip('"').strip("'")
    if not v:
        sys.exit(f"{name} is not set (environment or .env)")
    return v


class Api:
    def __init__(self):
        self.auth = (secret("MATTERPORT_API_KEY"), secret("MATTERPORT_API_TOKEN"))
        self.s = requests.Session()
        self.s.auth = self.auth

    def __call__(self, query, **variables):
        r = self.s.post(API, json={"query": query, "variables": variables}, timeout=120)
        r.raise_for_status()
        b = r.json()
        return b.get("data"), [e.get("message", "") for e in b.get("errors") or []]


def tref(t):
    if not t:
        return "String"
    if t["kind"] == "NON_NULL":
        return tref(t["ofType"]) + "!"
    if t["kind"] == "LIST":
        return "[" + tref(t["ofType"]) + "]"
    return t["name"]


def base_name(t):
    while t.get("ofType"):
        t = t["ofType"]
    return t.get("name")


TYPE_FRAG = "kind name ofType{kind name ofType{kind name ofType{kind name ofType{kind name}}}}"


def introspect(api, field):
    """-> (arg_types {name: sdl}, item_subfields [..]) for ModelAssets.<field>; None if not exposed."""
    d, _ = api('{__type(name:"ModelAssets"){fields{name args{name type{%s}} type{%s}}}}' % (TYPE_FRAG, TYPE_FRAG))
    fl = {f["name"]: f for f in (((d or {}).get("__type") or {}).get("fields") or [])}
    if field not in fl:
        return None
    f = fl[field]
    args = {a["name"]: tref(a["type"]) for a in f["args"]}
    tn = base_name(f["type"])
    d2, _ = api('{__type(name:"%s"){fields{name type{%s}}}}' % (tn, TYPE_FRAG))
    subs = []
    for x in ((d2 or {}).get("__type") or {}).get("fields") or []:
        bn = base_name(x["type"])
        if bn in ("String", "Int", "Float", "ID", "Boolean") or (bn and bn[0].isupper() and x["type"]["kind"] != "OBJECT"
                                                                 and bn not in ("Query",)):
            if x["type"]["kind"] != "OBJECT" and (x["type"].get("ofType") or {}).get("kind") != "OBJECT":
                subs.append(x["name"])
    return args, subs


def coerce(sdl, value):
    return value if "[" in sdl else (value[0] if isinstance(value, list) else value)


def fetch_assets(api, mid, field, args_sdl, subs, params):
    decl = ",".join(f"${k}:{args_sdl[k]}" for k in params)
    use = ",".join(f"{k}:${k}" for k in params)
    q = ("query($id:ID!%s){model(id:$id){assets{%s%s{%s}}}}"
         % ((("," + decl) if decl else ""), field, ("(" + use + ")") if use else "", " ".join(subs)))
    vars_ = {k: coerce(args_sdl[k], v) for k, v in params.items()}
    d, e = api(q, id=mid, **vars_)
    items = (((d or {}).get("model") or {}).get("assets") or {}).get(field)
    return [x for x in (items or []) if x], e


def arg_for(args_sdl, word):
    for k in args_sdl:
        if word in k.lower():
            return k
    return None


def discover(api, mid, field, subs, args_sdl, log):
    """Every distinct file the API will give for this model id."""
    found = {}

    def add(items, how):
        for x in items:
            if not x.get("url"):
                continue
            key = x["url"].split("?")[0]
            found.setdefault(key, dict(x, _found_with=[]))["_found_with"].append(how)

    items, e = fetch_assets(api, mid, field, args_sdl, subs, {})
    add(items, "no args")
    if e:
        log(f"   [{field}] plain query: {e[0][:100]}")
    fk, rk = arg_for(args_sdl, "format"), arg_for(args_sdl, "resolution")
    if field == "textures":
        fk, rk = arg_for(args_sdl, "quality"), arg_for(args_sdl, "resolution")
        for qv in ["low", "high"]:
            if fk:
                it, _ = fetch_assets(api, mid, field, args_sdl, subs, {fk: [qv]})
                add(it, f"{fk}=[{qv}]")
        return list(found.values())
    for f in FORMATS if fk else []:
        it, _ = fetch_assets(api, mid, field, args_sdl, subs, {fk: [f]})
        add(it, f"{fk}=[{f}]")
    for r in RESOLUTIONS if rk else []:
        it, _ = fetch_assets(api, mid, field, args_sdl, subs, {rk: [r]})
        add(it, f"{rk}=[{r}]")
    if fk and rk:                                   # pairs, only for resolutions/formats that answered
        fmts = sorted({x.get("format") for x in found.values() if x.get("format")} | {"obj", "glb"})
        ress = sorted({x.get("resolution") for x in found.values() if x.get("resolution")} | {"500k", "1m", "full"})
        for f in fmts:
            for r in ress:
                it, _ = fetch_assets(api, mid, field, args_sdl, subs, {fk: [f], rk: [r]})
                add(it, f"{fk}=[{f}] {rk}=[{r}]")
    return list(found.values())


# ----------------------------------------------------------------------------- download
def sniff(b):
    h = b[:512]
    if h[:2] == b"\x1f\x8b":
        return "gzip"
    if h[:4] == b"PK\x03\x04":
        return "zip"
    if h[:4] == b"glTF":
        return "glb"
    if h[:3] == b"ply":
        return "ply"
    s = h.lstrip().lower()
    if s.startswith(b"<!doctype html") or s.startswith(b"<html"):
        return "html-error-page"
    if s.startswith(b"<?xml") or s.startswith(b"<error"):
        return "xml-error-page"
    if s[:1] in (b"{", b"["):
        return "json-error-page"
    try:
        t = h.decode("ascii")
        if re.search(r"^(v |vn |vt |f |g |o |mtllib |#)", t, re.M):
            return "obj"
    except UnicodeDecodeError:
        pass
    return "unknown"


def get_naive(url):
    """What download_assets.py did."""
    r = requests.get(url, stream=True, timeout=600)
    data = b"".join(r.iter_content(1 << 20))
    return r.status_code, data, dict(r.headers)


def get_strict(url, auth=None):
    r = requests.get(url, stream=True, timeout=600, headers={"Accept-Encoding": "identity"}, auth=auth)
    raw = b"".join(r.raw.stream(1 << 20, decode_content=False))
    return r.status_code, raw, dict(r.headers)


def sha(b):
    return hashlib.sha256(b).hexdigest()[:16]


def download_both(url, auth):
    out = {"url_host": re.sub(r"^https?://([^/]+)/.*", r"\1", url)}
    try:
        sa, da, ha = get_naive(url)
    except Exception as e:
        sa, da, ha = None, b"", {"error": str(e)[:100]}
    try:
        sb, db, hb = get_strict(url)
        if sb in (401, 403) and auth:
            sb, db, hb = get_strict(url, auth)
            out["strict_needed_auth"] = True
    except Exception as e:
        sb, db, hb = None, b"", {"error": str(e)[:100]}
    cl = hb.get("Content-Length") or hb.get("content-length")
    errs = [h.get("error") for h in (ha, hb) if h.get("error")]
    if errs:
        out["error"] = errs[0]
    out.update(naive_status=sa, naive_bytes=len(da), naive_sha=sha(da) if da else None,
               strict_status=sb, strict_bytes=len(db), strict_sha=sha(db) if db else None,
               content_length=int(cl) if cl and str(cl).isdigit() else None,
               content_encoding=hb.get("Content-Encoding") or hb.get("content-encoding"),
               content_type=hb.get("Content-Type") or hb.get("content-type"),
               naive_equals_strict=(da == db) if da and db else None)
    out["truncated"] = bool(out["content_length"] and not out["content_encoding"]
                            and len(db) != out["content_length"])
    return out, db or da


def unwrap(data):
    """Peel gzip/zip wrappers. Returns [(name, bytes, kind)]."""
    k = sniff(data)
    if k == "gzip":
        return unwrap(gzip.decompress(data))
    if k == "zip":
        out = []
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            for n in z.namelist():
                if not n.endswith("/"):
                    b = z.read(n)
                    out.append((n, b, sniff(b)))
        return out
    return [(None, data, k)]


# ----------------------------------------------------------------------------- validation
def mesh_stats(V, F, extra=None):
    st = {"vertices": int(len(V)), "triangles": int(len(F))}
    if extra:
        st.update(extra)
    if not len(V) or not len(F):
        return st
    import numpy as np
    V = np.asarray(V, float)
    F = np.asarray(F, int)
    bad_idx = int(((F < 0) | (F >= len(V))).any(1).sum())
    st["bad_indices"] = bad_idx
    F = F[~((F < 0) | (F >= len(V))).any(1)]
    st["nonfinite_vertices"] = int((~np.isfinite(V)).any(1).sum())
    lo, hi = V.min(0), V.max(0)
    st["bbox_min"] = [round(float(x), 3) for x in lo]
    st["bbox_max"] = [round(float(x), 3) for x in hi]
    st["extent"] = [round(float(x), 3) for x in hi - lo]
    a, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    ar = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
    st["area_m2"] = round(float(ar.sum()), 1)
    st["degenerate_tris"] = int(((ar < 1e-9) | (F[:, 0] == F[:, 1]) | (F[:, 1] == F[:, 2]) | (F[:, 0] == F[:, 2])).sum())
    # edges (position-welded so duplicated vertices do not fake open edges)
    q = np.round(V / 1e-4).astype(np.int64)
    _, w = np.unique(q, axis=0, return_inverse=True)
    w = w.ravel()
    W = w[F]
    e = np.concatenate([W[:, [0, 1]], W[:, [1, 2]], W[:, [2, 0]]])
    lo_, hi_ = e.min(1), e.max(1)
    key = lo_.astype(np.int64) * (w.max() + 1) + hi_
    uk, inv, cnt = np.unique(key, return_inverse=True, return_counts=True)
    st["open_edge_fraction"] = round(float((cnt == 1).sum() / len(uk)), 3)
    st["nonmanifold_edge_fraction"] = round(float((cnt > 2).sum() / len(uk)), 3)
    # orientation consistency across shared edges
    fwd = (e[:, 0] < e[:, 1]).astype(int)
    s1 = np.bincount(inv, weights=fwd, minlength=len(uk))
    two = cnt == 2
    st["flipped_neighbour_fraction"] = round(float(((s1 == 0) | (s1 == 2))[two].sum() / max(two.sum(), 1)), 3)
    st["up_axis_guess"] = "z" if (hi - lo)[2] <= min((hi - lo)[0], (hi - lo)[1]) * 1.5 else "y?"
    return st


def read_obj(b):
    V, F, G, mtl, usemtl, vt = [], [], set(), [], set(), 0
    txt = b.decode("utf-8", "ignore").splitlines()
    for line in txt:
        if line.startswith("v "):
            V.append([float(x) for x in line.split()[1:4]])
        elif line.startswith("f "):
            ix = [int(t.split("/")[0]) for t in line.split()[1:]]
            ix = [i - 1 if i > 0 else len(V) + i for i in ix]
            for k in range(1, len(ix) - 1):
                F.append((ix[0], ix[k], ix[k + 1]))
        elif line.startswith("g ") or line.startswith("o "):
            G.add(line.split(None, 1)[1].strip())
        elif line.startswith("mtllib"):
            mtl.append(line.split(None, 1)[1].strip())
        elif line.startswith("usemtl"):
            usemtl.add(line.split(None, 1)[1].strip())
        elif line.startswith("vt "):
            vt += 1
    last = txt[-1] if txt else ""
    return V, F, {"groups": len(G), "mtllib": mtl, "materials_used": len(usemtl), "uv_coords": vt,
                  "ends_cleanly": last.startswith(("f ", "v ", "vt ", "vn ", "#", "g ", "o ", "s ", "usemtl"))}


def read_glb(b):
    magic, ver, length = struct.unpack("<4sII", b[:12])
    info = {"glb_version": ver, "declared_length": length, "length_matches_file": length == len(b)}
    off, js, binchunk = 12, None, None
    while off + 8 <= len(b):
        cl, ct = struct.unpack("<II", b[off:off + 8])
        chunk = b[off + 8:off + 8 + cl]
        if ct == 0x4E4F534A:
            js = json.loads(chunk.decode("utf-8", "ignore"))
        elif ct == 0x004E4942:
            binchunk = chunk
        off += 8 + cl + (-cl % 4)
    if js is None:
        return [], [], dict(info, error="no JSON chunk")
    info.update(meshes=len(js.get("meshes", [])), nodes=len(js.get("nodes", [])),
                materials=len(js.get("materials", [])), textures=len(js.get("textures", [])),
                images=len(js.get("images", [])))
    import numpy as np
    V, F = [], []
    acc, bv = js.get("accessors", []), js.get("bufferViews", [])
    ctype = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
    ncomp = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}

    def read(ai):
        a = acc[ai]
        v = bv[a["bufferView"]]
        dt = np.dtype("<" + ctype[a["componentType"]])
        n, nc = a["count"], ncomp[a["type"]]
        start = v.get("byteOffset", 0) + a.get("byteOffset", 0)
        stride = v.get("byteStride") or dt.itemsize * nc
        if stride == dt.itemsize * nc:
            arr = np.frombuffer(binchunk, dt, n * nc, start).reshape(n, nc)
        else:
            arr = np.stack([np.frombuffer(binchunk, dt, nc, start + i * stride) for i in range(n)])
        return arr

    try:
        for m in js.get("meshes", []):
            for p in m.get("primitives", []):
                if "POSITION" not in p["attributes"] or binchunk is None:
                    continue
                base = len(V)
                V.extend(read(p["attributes"]["POSITION"]).astype(float).tolist())
                if "indices" in p:
                    idx = read(p["indices"]).ravel().astype(int) + base
                else:
                    idx = np.arange(base, len(V))
                F.extend(idx[: len(idx) // 3 * 3].reshape(-1, 3).tolist())
    except Exception as ex:
        info["decode_error"] = str(ex)[:100]
    return V, F, info


def read_ply(b):
    head_end = b.find(b"end_header")
    head = b[:head_end].decode("ascii", "ignore")
    info = {"ply_format": re.search(r"format (\S+)", head).group(1) if "format" in head else "?"}
    mv = re.search(r"element vertex (\d+)", head)
    mf = re.search(r"element face (\d+)", head)
    info["declared_vertices"] = int(mv.group(1)) if mv else 0
    info["declared_faces"] = int(mf.group(1)) if mf else 0
    return [], [], info


def validate(name, data, kind, outdir, preview=True):
    info = {"file": name, "bytes": len(data), "kind": kind}
    V, F, extra = [], [], {}
    try:
        if kind == "obj":
            V, F, extra = read_obj(data)
        elif kind == "glb":
            V, F, extra = read_glb(data)
        elif kind == "ply":
            V, F, extra = read_ply(data)
        elif kind.endswith("error-page"):
            extra = {"ERROR": "this 'mesh' is actually an error page: " + data[:160].decode("utf-8", "ignore")}
    except Exception as e:
        extra = {"ERROR": f"parse failed: {e}"}
    try:
        info.update(mesh_stats(V, F, extra))
    except ImportError:
        info.update({"vertices": len(V), "triangles": len(F), **extra, "note": "numpy missing: no geometry checks"})
    verdict = []
    if kind in ("obj", "glb", "ply") and not info.get("triangles") and kind != "ply":
        verdict.append("BAD: no triangles found in a file that should be a mesh")
    if info.get("ERROR"):
        verdict.append("BAD: " + info["ERROR"][:80])
    if extra.get("ends_cleanly") is False:
        verdict.append("BAD: file ends mid-line (truncated?)")
    if info.get("bad_indices"):
        verdict.append(f"BAD: {info['bad_indices']} faces index missing vertices")
    if info.get("nonfinite_vertices"):
        verdict.append("BAD: NaN/inf vertices")
    if kind == "obj" and not extra.get("mtllib"):
        verdict.append("note: no MTL/texture reference (geometry only: will look untextured)")
    if kind == "obj" and not extra.get("uv_coords"):
        verdict.append("note: no UV coordinates")
    if info.get("open_edge_fraction", 0) > 0.2:
        verdict.append(f"geometry: {int(info['open_edge_fraction']*100)}% open edges (not watertight / holes)")
    if info.get("flipped_neighbour_fraction", 0) > 0.1:
        verdict.append(f"geometry: {int(info['flipped_neighbour_fraction']*100)}% of shared edges flipped (backface culling will hide faces)")
    if info.get("degenerate_tris", 0) > 0:
        verdict.append(f"geometry: {info['degenerate_tris']} degenerate triangles")
    info["verdict"] = verdict or ["ok"]
    if preview and len(V) and len(F):
        try:
            import numpy as np, matplotlib
            matplotlib.use("Agg")
            import matplotlib.pyplot as plt
            from matplotlib.collections import LineCollection
            Va, Fa = np.array(V, float), np.array(F, int)
            if len(Fa) > 120000:
                Fa = Fa[:: len(Fa) // 120000 + 1]
            fig, ax = plt.subplots(1, 2, figsize=(14, 6))
            for a_, (i, j, t) in zip(ax, ((0, 1, "top (x,y)"), (0, 2, "side (x,z)"))):
                seg = np.concatenate([Va[Fa][:, [0, 1]][:, :, [i, j]], Va[Fa][:, [1, 2]][:, :, [i, j]],
                                      Va[Fa][:, [2, 0]][:, :, [i, j]]])
                a_.add_collection(LineCollection(seg, linewidths=0.2, colors="k", alpha=0.5))
                a_.set_xlim(Va[:, i].min(), Va[:, i].max()); a_.set_ylim(Va[:, j].min(), Va[:, j].max())
                a_.set_aspect("equal"); a_.set_title(f"{name}: {t}", fontsize=8)
            png = outdir / (re.sub(r"[^A-Za-z0-9._-]+", "_", name) + ".png")
            fig.savefig(png, dpi=90, bbox_inches="tight"); plt.close(fig)
            info["preview"] = str(png)
        except Exception as e:                                           # noqa
            info["preview_skipped"] = str(e)[:80]
    return info


# ----------------------------------------------------------------------------- run
def safe(s):
    return re.sub(r"[^A-Za-z0-9._-]+", "_", s)[:120] or "file"


def process_bytes(label, name, data, outdir, report, log):
    """Sniff, unwrap, save, validate one downloaded payload."""
    kind = sniff(data)
    parts = unwrap(data) if kind in ("gzip", "zip") else [(None, data, kind)]
    for inner, b, k in parts:
        nm = safe(f"{label}__{name}" + (f"__{inner}" if inner else ""))
        (outdir / nm).write_bytes(b)
        if k in ("obj", "glb", "ply") or k.endswith("error-page"):
            r = validate(nm, b, k, outdir)
        else:
            r = {"file": nm, "bytes": len(b), "kind": k, "verdict": [f"not validated ({k})"]}
        r["wrapper"] = kind if kind != k else None
        report["files"].append(r)
        log(f"   {nm}  [{k}{' <- ' + kind if kind != k else ''}]  "
            f"v={r.get('vertices','-')} tri={r.get('triangles','-')} | " + "; ".join(r["verdict"]))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", default="zvKHR9DHNjJ")
    ap.add_argument("--textures", action="store_true", help="also download texture images (capped)")
    ap.add_argument("--max-textures", type=int, default=30)
    ap.add_argument("--max-mb", type=float, default=300, help="skip files bigger than this")
    ap.add_argument("--local", default=None, help="validate files already on disk instead of calling the API")
    ap.add_argument("--out", default=None)
    a = ap.parse_args()

    outdir = Path(a.out or f"mesh_test_{a.model}")
    outdir.mkdir(parents=True, exist_ok=True)
    lines = []

    def log(s=""):
        print(s)
        lines.append(s)

    report = {"model": a.model, "files": [], "downloads": []}

    if a.local:
        log(f"validating files in {a.local}")
        for p in sorted(Path(a.local).rglob("*")):
            if p.is_file() and p.suffix.lower() in (".obj", ".glb", ".ply", ".gz", ".zip", ".gltf", ".dam"):
                process_bytes("local", p.name, p.read_bytes(), outdir, report, log)
        (outdir / "report.json").write_text(json.dumps(report, indent=1))
        (outdir / "report.txt").write_text("\n".join(lines))
        return

    api = Api()
    d, _ = api('query($id:ID!){model(id:$id){view(type:"matterport.model.defurnished"){id}}}', id=a.model)
    vid = (((d or {}).get("model") or {}).get("view") or {}).get("id")
    targets = [("furnished", a.model)] + ([("defurnished", vid)] if vid else [])
    log(f"targets: {targets}")

    known = {}
    old_dir = Path(f"assets_{a.model}") / "matterport" / "meshes"
    if old_dir.exists():
        for p in old_dir.glob("*"):
            if p.is_file():
                known[sha(p.read_bytes())] = p.name

    seen = set()
    fields = [("meshes", True)] + ([("textures", True)] if a.textures else [])
    for label, mid in targets:
        for field, _ in fields:
            ins = introspect(api, field)
            if ins is None:
                log(f"\n[{label}] ModelAssets has no '{field}' field"); continue
            args_sdl, subs = ins
            subs = [s for s in LIKELY_FIELDS if s in subs] or ["url"]
            if "url" not in subs:
                subs.append("url")
            log(f"\n=== {label} ({mid}) / {field}   args={args_sdl}  fields={subs}")
            items = discover(api, mid, field, subs, args_sdl, log)
            log(f"   {len(items)} distinct downloadable files")
            for x in items:
                log("   - " + " / ".join(str(x.get(k)) for k in ("format", "resolution", "quality", "status", "filename"))
                    + f"   found with: {', '.join(x['_found_with'][:3])}")
            if field == "textures":
                items = items[: a.max_textures]
            for x in items:
                key = x["url"].split("?")[0]
                if key in seen:
                    continue
                seen.add(key)
                name = x.get("filename") or Path(key).name or "file"
                if field == "textures":
                    try:
                        r = requests.get(x["url"], timeout=300)
                        (outdir / safe(f"{label}__tex__{name}")).write_bytes(r.content)
                    except Exception as e:
                        log(f"   texture {name}: {e}")
                    continue
                dl, data = download_both(x["url"], api.auth)
                dl.update(label=label, filename=name, format=x.get("format"), resolution=x.get("resolution"))
                dl["same_as_existing_file"] = known.get(dl["strict_sha"]) or known.get(dl["naive_sha"])
                report["downloads"].append(dl)
                flag = []
                if dl["naive_equals_strict"] is False:
                    flag.append("NAIVE != STRICT (download method matters!)")
                if dl["truncated"]:
                    flag.append("TRUNCATED")
                if dl.get("error"):
                    flag.append("DOWNLOAD ERROR: " + dl["error"])
                if dl["strict_status"] != 200:
                    flag.append(f"HTTP {dl['strict_status']}")
                log(f"\n   {label}/{name}: strict={dl['strict_bytes']}B naive={dl['naive_bytes']}B "
                    f"encoding={dl['content_encoding']} same_as_existing={dl['same_as_existing_file']} "
                    f"{' | '.join(flag) or 'download ok'}")
                if len(data) > a.max_mb * 1e6 or not data:
                    log("   (skipped validation)"); continue
                process_bytes(label, name, data, outdir, report, log)
    log("\n=== summary")
    for r in report["files"]:
        log(f"  {r['file'][:70]:70s} {r.get('triangles','-'):>8} tris  " + "; ".join(r["verdict"][:2]))
    (outdir / "report.json").write_text(json.dumps(report, indent=1))
    (outdir / "report.txt").write_text("\n".join(lines))
    log(f"\nsaved to {outdir}/  (report.txt, report.json, *.png previews)")
    log("Paste report.txt back to me.")


if __name__ == "__main__":
    main()
