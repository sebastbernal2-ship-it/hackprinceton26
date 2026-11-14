#!/usr/bin/env python3
"""
interior_pipeline.py - Stage 0 of the furniture-extraction pipeline.

Takes interior 3D geometry + the Matterport floor plan (wall graph and rooms) and produces:
  plan.json          walls (segments + thickness), rooms (polygons, labels, sizes), floor/ceiling heights, panos
  objects.json       one entry per candidate object: room, gravity-aligned box, footprint, floor contact,
                     clearance to nearest wall, nearest pano + view direction (for labelling), label slot
  labels.json        editable {object_id: label} file - fill it (by hand or a VLM), re-run with --labels
  objects.ply        candidate-object points, real colours, with an `instance` id per point
  structure.ply      floor / wall / ceiling points (coloured by class) - the "empty shell" seed
  overview.png       floor plan + every object box, numbered

What it covers from the plan:
  step 2 (split structure from furniture, using the floor plan)   -> geometric version, done here
  step 5 (placeable pose: box, footprint, clearance)              -> done here
  step 2 labels / step 1 instance features / step 3 completion    -> hooks only (labels.json, nearest_pano)

Geometry input, ONE of:
  (default)              stream cloud.xyz from the model's MatterPak (needs it unlocked)
  --cloud FILE           local .ply (points or 3DGS splat) or .xyz, IN THE MATTERPORT MODEL FRAME
                         (e.g. an interior splat trained from the panos). The hackathon drone splat
                         is exterior and in its own local frame, so it will be rejected.

  $env:MATTERPORT_API_KEY="..."; $env:MATTERPORT_API_TOKEN="..."
  python interior_pipeline.py                      # MatterPak is always the source
  python interior_pipeline.py --cloud my_interior.ply --labels interior_zvKHR9DHNjJ/labels.json

Deps: requests numpy pandas scipy matplotlib
"""
import argparse, io, json, os, sys, zipfile
from pathlib import Path

import numpy as np

API = "https://api.matterport.com/api/models/graph"

Q_PLAN = """query Plan($id: ID!) { model(id: $id) {
  id name
  floors { id label vertices { id position { x y } } edges { id type thickness vertices { id } } }
  rooms { id floor { id } classifications { label confidence } boundary { edges { id } }
          dimensions(units: metric) { areaFloor width depth height } }
  panoLocations { id label position { x y z } }
} }"""

Q_ALL_RESOURCES = """query Res($id: ID!) { model(id: $id) { assets { resources { status filename url } } } }"""

Q_MATTERPAK = """query MatterPak($id: ID!) { model(id: $id) {
  bundle(id: "mp:matterpak") { availability }
  assets { resources(format: "matterpak") { status filename url } }
} }"""

# Distances in metres. Tune here.
FLOOR_BAND = 0.06      # points this close above the floor are "floor" (rugs end up here)
CEIL_BAND = 0.12       # points this close below the ceiling are "ceiling"
WALL_MARGIN = 0.10     # added to half the wall thickness
VOXEL = 0.04           # clustering resolution
MIN_POINTS = 150       # smallest cluster kept (after stride)
MIN_SIZE = 0.15        # smallest box side kept
SKIP_EDGE_TYPES = ("invisible", "opening")   # wall-graph edges that aren't physical walls (guess)
CLASS_COLOURS = {"floor": (150, 120, 90), "wall": (200, 200, 200), "ceiling": (120, 160, 220)}


# ----------------------------------------------------------------------------- API
def secret(name):
    v = os.environ.get(name)
    if not v and Path(".env").exists():
        for line in Path(".env").read_text().splitlines():
            k, _, val = line.partition("=")
            if k.strip() == name:
                v = val.strip().strip('"').strip("'")
    if not v:
        sys.exit(f"{name} is not set (env var or .env file).")
    return v


def session():
    import requests
    s = requests.Session()
    s.auth = (secret("MATTERPORT_API_KEY"), secret("MATTERPORT_API_TOKEN"))
    return s


def gql(s, query, soft=False, **variables):
    r = s.post(API, json={"query": query, "variables": variables}, timeout=120)
    if r.status_code in (401, 403):
        sys.exit(f"Matterport rejected the keys (HTTP {r.status_code}).")
    r.raise_for_status()
    body = r.json()
    if body.get("errors"):
        if soft:
            return None
        sys.exit("GraphQL error: " + body["errors"][0].get("message", ""))
    return body["data"]["model"]


class HttpFile(io.RawIOBase):
    """Seekable file over HTTP range requests, so zipfile can read a remote zip in place."""
    def __init__(self, url, block=8 * 2**20):
        import requests
        self.req, self.url, self.pos, self.block, self.buf, self.at = requests, url, 0, block, b"", -1
        self.size = int(requests.get(url, headers={"Range": "bytes=0-0"}, timeout=60)
                        .headers["Content-Range"].split("/")[1])
    def seekable(self): return True
    def readable(self): return True
    def tell(self): return self.pos
    def seek(self, off, whence=0):
        self.pos = {0: off, 1: self.pos + off, 2: self.size + off}[whence]; return self.pos
    def read(self, n=-1):
        n = self.size - self.pos if n is None or n < 0 else min(n, self.size - self.pos)
        if n <= 0:
            return b""
        if not (self.at <= self.pos and self.pos + n <= self.at + len(self.buf)):
            end = min(self.size, self.pos + max(n, self.block)) - 1
            r = self.req.get(self.url, headers={"Range": f"bytes={self.pos}-{end}"}, timeout=300)
            r.raise_for_status()
            self.at, self.buf = self.pos, r.content
        out = self.buf[self.pos - self.at: self.pos - self.at + n]
        self.pos += len(out); return out
    def readinto(self, b):
        d = self.read(len(b)); b[:len(d)] = d; return len(d)


# ----------------------------------------------------------------------------- plan
def build_plan(raw):
    floors = []
    for f in raw["floors"]:
        V = {v["id"]: (v["position"]["x"], v["position"]["y"]) for v in f["vertices"]}
        walls = []
        for e in f["edges"]:
            ids = [v["id"] for v in e["vertices"]]
            if len(ids) != 2 or not all(i in V for i in ids):
                continue
            t = (e.get("type") or "").lower()
            walls.append({"id": e["id"], "type": e.get("type"), "a": V[ids[0]], "b": V[ids[1]],
                          "thickness": e.get("thickness") or 0.12,
                          "physical": not any(s in t for s in SKIP_EDGE_TYPES)})
        floors.append({"id": f["id"], "label": f.get("label"), "walls": walls, "_V": V,
                       "_E": {e["id"]: [v["id"] for v in e["vertices"]] for e in f["edges"]}})
    fmap = {f["id"]: f for f in floors}
    rooms = []
    for r in raw["rooms"]:
        f = fmap.get((r.get("floor") or {}).get("id"))
        if not f:
            continue
        edges = [f["_E"][e["id"]] for e in (r.get("boundary") or {}).get("edges", []) if e["id"] in f["_E"]]
        poly = chain(edges, f["_V"])
        c = r.get("classifications") or []
        d = r.get("dimensions") or {}
        label = c[0]["label"] if c else None
        if poly is None or label == "Void":
            continue
        rooms.append({"id": r["id"], "floor": f["id"], "label": label or "(unlabelled)", "polygon": poly,
                      "area_m2": d.get("areaFloor"), "height_m": d.get("height")})
    panos = [{"id": p["id"], "label": p.get("label"), "position": [p["position"][k] for k in "xyz"]} for p in raw["panoLocations"]]
    for f in floors:
        del f["_V"], f["_E"]
    return {"model": raw["id"], "name": raw.get("name"), "floors": floors, "rooms": rooms, "panos": panos}


def chain(edges, V):
    if not edges:
        return None
    loop, rest = list(edges[0]), [list(e) for e in edges[1:]]
    while rest:
        for i, (a, b) in enumerate(rest):
            if loop[-1] in (a, b):
                loop.append(b if a == loop[-1] else a); rest.pop(i); break
        else:
            break
    pts = [list(V[v]) for v in loop if v in V]
    return pts if len(pts) >= 3 else None


# ----------------------------------------------------------------------------- geometry
def load_cloud(path, stride):
    p = Path(path)
    if p.suffix.lower() in (".xyz", ".txt", ".csv"):
        import pandas as pd
        return xyz_text(open(p, "rb"), stride)
    return load_ply(p, stride)


def xyz_text(fh, stride):
    import pandas as pd
    chunks = pd.read_csv(fh, sep=r"\s+", header=None, usecols=range(6), names=list("xyzrgb"),
                         dtype=np.float32, chunksize=2_000_000, engine="c")
    a = pd.concat(c.iloc[::stride] for c in chunks).to_numpy()
    return a[:, :3].astype(np.float64), a[:, 3:6].clip(0, 255).astype(np.uint8)


def load_ply(path, stride):
    T = {"char": "i1", "uchar": "u1", "short": "i2", "ushort": "u2", "int": "i4", "uint": "u4",
         "float": "f4", "double": "f8", "uint8": "u1", "int32": "i4", "float32": "f4", "float64": "f8"}
    with open(path, "rb") as f:
        props, n, fmt = [], 0, None
        while True:
            t = f.readline().decode("ascii", "ignore").split()
            if not t and f.tell() > 1 << 20:
                sys.exit("bad ply header")
            if t[:1] == ["format"]: fmt = t[1]
            elif t[:2] == ["element", "vertex"]: n = int(t[2])
            elif t[:1] == ["property"] and len(t) == 3 and t[1] in T: props.append((t[2], "<" + T[t[1]]))
            elif t[:1] == ["end_header"]: break
        off = f.tell()
    if fmt != "binary_little_endian":
        sys.exit(f"unsupported ply format {fmt} (want binary_little_endian)")
    dt = np.dtype(props)
    n = min(n, (os.path.getsize(path) - off) // dt.itemsize)
    g = np.memmap(path, dtype=dt, mode="r", offset=off, shape=(n,))[::stride]
    P = np.stack([g[c] for c in "xyz"], 1).astype(np.float64)
    names = dt.names
    if "f_dc_0" in names:   # 3DGS splat: drop faint Gaussians, SH0 -> colour
        keep = 1 / (1 + np.exp(-g["opacity"].astype(np.float32))) > 0.3
        C = np.stack([g[f"f_dc_{i}"] for i in range(3)], 1).astype(np.float32)
        C = ((0.5 + 0.28209479 * C) * 255).clip(0, 255).astype(np.uint8)
        return P[keep], C[keep]
    if "red" in names:
        return P, np.stack([g[c] for c in ("red", "green", "blue")], 1).astype(np.uint8)
    return P, np.full((len(P), 3), 160, np.uint8)


def find_matterpak(s, model):
    d = gql(s, Q_MATTERPAK, id=model)
    tagged = d["assets"]["resources"] or []
    pak = next((x for x in tagged if x.get("url")), None)
    if pak:
        return pak, d
    # fall back: any resource whose filename looks like a MatterPak zip
    allr = (gql(s, Q_ALL_RESOURCES, soft=True, id=model) or {}).get("assets", {}).get("resources") or []
    pak = next((x for x in allr if x.get("url") and
                any(k in (x.get("filename") or "").lower() for k in ("matterpak", ".zip"))), None)
    if pak:
        return pak, d
    print(f"MatterPak bundle availability: {d['bundle']['availability']}")
    print(f"resources(format: matterpak): {[(x.get('filename'), x.get('status'), bool(x.get('url'))) for x in tagged] or 'none'}")
    print(f"all resources: {[(x.get('filename'), x.get('status'), bool(x.get('url'))) for x in allr] or 'none'}")
    sys.exit(f"No downloadable MatterPak for {model}. 'unlocked' only means it may be requested; no file "
             "has been delivered yet (see statuses above). Ask in the track channel to generate it, or try "
             "another model: python interior_pipeline.py --model <sid>")


def load_matterpak(s, model, stride):
    pak, _ = find_matterpak(s, model)
    zf = zipfile.ZipFile(HttpFile(pak["url"]))
    name = next((n for n in zf.namelist() if n.endswith("cloud.xyz")), None)
    if not name:
        sys.exit(f"no cloud.xyz in {pak['filename']}: {zf.namelist()[:10]}")
    print(f"streaming {name} ({zf.getinfo(name).compress_size / 1e6:.0f} MB zipped), every {stride}th point ...")
    return xyz_text(zf.open(name), stride)


# ----------------------------------------------------------------------------- classification
def seg_distance(P2, a, b):
    a, b = np.asarray(a), np.asarray(b)
    ab = b - a
    t = np.clip(((P2 - a) @ ab) / max(ab @ ab, 1e-12), 0, 1)
    return np.linalg.norm(P2 - (a + t[:, None] * ab), axis=1)


def classify(P, plan):
    from matplotlib.path import Path as MPath
    N = len(P)
    room = np.full(N, -1)
    for i, r in enumerate(plan["rooms"]):
        inside = MPath(np.array(r["polygon"])).contains_points(P[:, :2], radius=0.05)
        room[(room < 0) & inside] = i
    if (room >= 0).mean() < 0.05:
        sys.exit(f"only {(room >= 0).mean():.1%} of points fall inside the plan's rooms: this cloud is not in "
                 "the Matterport model frame. (The hackathon drone splat is exterior and locally framed.)")
    inside = room >= 0
    floor_z = float(np.percentile(P[inside, 2], 2))
    ceil_global = float(np.percentile(P[inside, 2], 98))
    ceil = np.full(N, ceil_global)
    for i, r in enumerate(plan["rooms"]):
        if r.get("height_m"):
            ceil[room == i] = floor_z + r["height_m"]
    wall_d = np.full(N, np.inf)
    for f in plan["floors"]:
        for w in f["walls"]:
            if w["physical"]:
                wall_d = np.minimum(wall_d, seg_distance(P[:, :2], w["a"], w["b"]) - w["thickness"] / 2)
    cls = np.full(N, "object", dtype=object)
    cls[~inside] = "outside"
    cls[inside & (wall_d < WALL_MARGIN)] = "wall"
    cls[inside & (P[:, 2] < floor_z + FLOOR_BAND)] = "floor"
    cls[inside & (P[:, 2] > ceil - CEIL_BAND)] = "ceiling"
    return cls, room, wall_d, floor_z, ceil_global


def cluster(P):
    from scipy import ndimage
    lo = P.min(0)
    idx = np.floor((P - lo) / VOXEL).astype(np.int64)
    shape = idx.max(0) + 1
    if np.prod(shape) > 300_000_000:
        sys.exit(f"voxel grid {shape} too big; raise VOXEL")
    grid = np.zeros(shape, bool)
    grid[tuple(idx.T)] = True
    lab, n = ndimage.label(grid, structure=np.ones((3, 3, 3)))
    return lab[tuple(idx.T)] - 1, n


def describe(i, P, C, plan, room_of, wall_d, floor_z):
    xy = P[:, :2]
    c = xy.mean(0)
    # minimum-area gravity-aligned box: try yaws every 2 deg on a subsample, keep the tightest
    sub = xy[:: max(1, len(xy) // 5000)] - c
    best = None
    for yaw in np.arange(0, 90, 2.0):
        t = np.radians(yaw)
        ax = np.array([np.cos(t), np.sin(t)])
        Rt = np.array([[ax[0], ax[1]], [-ax[1], ax[0]]])
        q = sub @ Rt.T
        ext = np.percentile(q, 98, 0) - np.percentile(q, 2, 0)
        if best is None or ext.prod() < best[0] - 1e-9:
            best = (ext.prod(), yaw, ext)
    yaw = best[1] if best[2][0] >= best[2][1] else best[1] + 90   # yaw = direction of the long side
    t = np.radians(yaw)
    ax = np.array([np.cos(t), np.sin(t)])
    R = np.array([[ax[0], ax[1]], [-ax[1], ax[0]]])
    loc = (xy - c) @ R.T
    lo, hi = np.percentile(loc, 2, 0), np.percentile(loc, 98, 0)
    zlo, zhi = np.percentile(P[:, 2], 1), np.percentile(P[:, 2], 99)
    centre_local = (lo + hi) / 2
    centre_xy = c + centre_local @ R
    cells = np.unique(np.floor(xy / 0.05).astype(np.int64), axis=0)
    r_ids, r_cnt = np.unique(room_of[room_of >= 0], return_counts=True)
    rm = plan["rooms"][int(r_ids[np.argmax(r_cnt)])] if len(r_ids) else None
    centroid = np.array([*centre_xy, (zlo + zhi) / 2])
    pano, view = None, None
    if plan["panos"]:
        pp = np.array([p["position"] for p in plan["panos"]])
        k = int(np.argmin(np.linalg.norm(pp - centroid, axis=1)))
        d = centroid - pp[k]
        pano = plan["panos"][k]["id"]
        view = {"yaw_deg_model_frame": round(float(np.degrees(np.arctan2(d[1], d[0]))), 1),
                "pitch_deg": round(float(np.degrees(np.arctan2(d[2], np.linalg.norm(d[:2])))), 1),
                "distance_m": round(float(np.linalg.norm(d)), 2)}
    return {
        "id": i, "label": None, "label_source": None,
        "room": {"id": rm["id"], "label": rm["label"]} if rm else None,
        "points": int(len(P)),
        "box": {"centre": [round(float(v), 3) for v in (*centre_xy, (zlo + zhi) / 2)],
                "size_lwh_m": [round(float(hi[0] - lo[0]), 2), round(float(hi[1] - lo[1]), 2),
                               round(float(zhi - zlo), 2)],
                "yaw_deg": round(yaw, 1), "z_bottom": round(float(zlo), 3), "z_top": round(float(zhi), 3)},
        "footprint_m2": round(len(cells) * 0.0025, 2),
        "on_floor": bool(zlo - floor_z < 0.10),
        "min_wall_clearance_m": round(float(max(0.0, np.percentile(wall_d, 2))), 2),
        "mean_rgb": C.mean(0).round().astype(int).tolist(),
        "nearest_pano": pano, "view_from_pano": view,
        "flags": [],
    }


# ----------------------------------------------------------------------------- output
def write_ply(path, P, C, inst=None):
    dt = [("p", "<f4", 3), ("c", "u1", 3)] + ([("i", "<i4")] if inst is not None else [])
    rec = np.empty(len(P), dtype=dt)
    rec["p"], rec["c"] = P, C
    hdr = (f"ply\nformat binary_little_endian 1.0\nelement vertex {len(P)}\nproperty float x\nproperty float y\n"
           "property float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\n")
    if inst is not None:
        rec["i"] = inst
        hdr += "property int instance\n"
    with open(path, "wb") as f:
        f.write((hdr + "end_header\n").encode()); f.write(rec.tobytes())


def overview(path, plan, objs, P_obj, inst):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(12, 9))
    for r in plan["rooms"]:
        poly = np.array(r["polygon"])
        ax.fill(*poly.T, alpha=0.08)
        ax.text(*poly.mean(0), r["label"], ha="center", va="center", fontsize=7, color="#555")
    rng = np.random.default_rng(0)
    cols = rng.uniform(0.15, 0.85, (max(len(objs), 1), 3))
    sel = rng.choice(len(P_obj), min(len(P_obj), 200_000), replace=False) if len(P_obj) else []
    if len(sel):
        ax.scatter(P_obj[sel, 0], P_obj[sel, 1], s=0.2, c=cols[inst[sel]], linewidths=0)
    for f in plan["floors"]:
        for w in f["walls"]:
            ax.plot(*zip(w["a"], w["b"]), color="#111" if w["physical"] else "#bbb", lw=2)
    for o in objs:
        b = o["box"]
        L, W = b["size_lwh_m"][:2]
        t = np.radians(b["yaw_deg"])
        u, v = np.array([np.cos(t), np.sin(t)]), np.array([-np.sin(t), np.cos(t)])
        c = np.array(b["centre"][:2])
        corners = np.array([c + sx * L / 2 * u + sy * W / 2 * v for sx, sy in [(-1, -1), (1, -1), (1, 1), (-1, 1), (-1, -1)]])
        ax.plot(*corners.T, color=cols[o["id"]], lw=1.2)
        ax.text(*c, str(o["id"]) + (f" {o['label']}" if o["label"] else ""), fontsize=6, ha="center", va="center")
    ax.set_aspect("equal"); ax.set_xlabel("x (m)"); ax.set_ylabel("y (m)")
    ax.set_title(f"{plan['name']} - {len(objs)} candidate objects")
    fig.savefig(path, dpi=160, bbox_inches="tight")


# ----------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", default="zvKHR9DHNjJ")
    ap.add_argument("--cloud", help="optional: local interior cloud instead of the MatterPak (default: MatterPak)")
    ap.add_argument("--stride", type=int, default=4, help="keep every Nth point (MatterPak cloud is ~10M)")
    ap.add_argument("--plan-raw", help="use a saved plan_raw.json instead of calling the API")
    ap.add_argument("--labels", help="labels.json from a previous run to merge in")
    ap.add_argument("--out")
    a = ap.parse_args()
    out = Path(a.out or f"interior_{a.model}")
    out.mkdir(parents=True, exist_ok=True)

    s = None
    if a.plan_raw:
        raw = json.load(open(a.plan_raw))
    else:
        s = session()
        raw = gql(s, Q_PLAN, id=a.model)
        json.dump(raw, open(out / "plan_raw.json", "w"))
    plan = build_plan(raw)
    print(f"plan: {len(plan['rooms'])} rooms, {sum(len(f['walls']) for f in plan['floors'])} wall edges, "
          f"{len(plan['panos'])} panos; edge types: {sorted({str(w['type']) for f in plan['floors'] for w in f['walls']})}")

    if a.cloud:
        P, C = load_cloud(a.cloud, a.stride)
    else:
        P, C = load_matterpak(s or session(), a.model, a.stride)
    print(f"{len(P):,} points")

    cls, room, wall_d, floor_z, ceil_z = classify(P, plan)
    counts = {k: int((cls == k).sum()) for k in ("floor", "wall", "ceiling", "object", "outside")}
    print("classes:", counts)
    plan.update(floor_z=round(floor_z, 3), ceiling_z_est=round(ceil_z, 3))
    json.dump(plan, open(out / "plan.json", "w"), indent=1)

    struct = np.isin(cls, ["floor", "wall", "ceiling"])
    sc = np.array([CLASS_COLOURS[k] for k in cls[struct]], np.uint8) if struct.any() else np.zeros((0, 3), np.uint8)
    write_ply(out / "structure.ply", P[struct], sc)

    m = cls == "object"
    Po, Co, Ro, Wo = P[m], C[m], room[m], wall_d[m]
    inst, n = cluster(Po) if len(Po) else (np.zeros(0, int), 0)
    labels = json.load(open(a.labels)) if a.labels else {}
    objs, remap = [], np.full(max(n, 1), -1)
    order = np.argsort(-np.bincount(inst, minlength=n)) if n else []
    for k in order:
        sel = inst == k
        if sel.sum() < MIN_POINTS:
            continue
        o = describe(len(objs), Po[sel], Co[sel], plan, Ro[sel], Wo[sel], floor_z)
        if max(o["box"]["size_lwh_m"]) < MIN_SIZE:
            continue
        if o["footprint_m2"] > 6:
            o["flags"].append("very large: probably several touching objects merged")
        if o["box"]["z_top"] > ceil_z - 0.3 and not o["on_floor"]:
            o["flags"].append("hangs from ceiling (light fixture?)")
        if o["min_wall_clearance_m"] < 0.05:
            o["flags"].append("touches wall: built-in, shelf, or wall-mounted?")
        if str(o["id"]) in labels:
            o["label"], o["label_source"] = labels[str(o["id"])], "labels.json"
        remap[k] = o["id"]
        objs.append(o)
    keep = remap[inst] >= 0 if n else np.zeros(0, bool)
    write_ply(out / "objects.ply", Po[keep], Co[keep], remap[inst[keep]])
    json.dump({"model": plan["model"], "units": "metres, Matterport model frame, z up",
               "floor_z": plan["floor_z"], "objects": objs}, open(out / "objects.json", "w"), indent=1)
    if not (out / "labels.json").exists() or a.labels:
        json.dump({str(o["id"]): o["label"] or "" for o in objs}, open(out / "labels.json", "w"), indent=1)
    overview(out / "overview.png", plan, objs, Po[keep], remap[inst[keep]])
    print(f"{len(objs)} candidate objects -> {out}/objects.json, overview.png")
    print("Note: object ids are by size and can change if you re-run with different settings or data.")


if __name__ == "__main__":
    main()
