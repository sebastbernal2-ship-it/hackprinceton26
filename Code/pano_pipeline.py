#!/usr/bin/env python3
"""
pano_pipeline.py - Find, place and label furniture using only data the API already serves:
the floor plan (wall graph + rooms) and each panorama in its FURNISHED and DEFURNISHED versions.

  1. plan        walls, rooms, ceiling heights                         (Model API)
  2. panos       skybox faces, furnished + defurnished, cached on disk (Model API, defurnished view)
  3. calibrate   per pano: heading, mirror and camera height, found by matching the floor/wall and
                 ceiling/wall lines the plan predicts to the edges in the photo (no quaternion guessing)
  4. detect      furniture mask = furnished minus defurnished, cleaned, split into blobs
  5. place       each blob's bottom edge -> ray to the floor -> points on the plan; height from its top edge
  6. fuse        the same object seen from several panos -> one object, gravity-aligned box
  7. label       crop per object; optional vision-model label (ANTHROPIC_API_KEY), or edit labels.json

  $env:MATTERPORT_API_KEY="..."; $env:MATTERPORT_API_TOKEN="..."
  python pano_pipeline.py                       # model zvKHR9DHNjJ
  python pano_pipeline.py --label               # + label each object with Claude (needs ANTHROPIC_API_KEY)
  python pano_pipeline.py --labels pano_zvKHR9DHNjJ/labels.json   # merge hand-edited labels

Check debug/*.jpg first: the red (floor) and blue (ceiling) lines must sit on the room's edges.
If they don't, calibration failed for that pano and its objects are misplaced.

Deps: requests numpy scipy pillow matplotlib
"""
import argparse, base64, io, json, os, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

API = "https://api.matterport.com/api/models/graph"
DEFURNISHED = "matterport.model.defurnished"

Q_PLAN = """query Plan($id: ID!) { model(id: $id) {
  id name
  floors { id label vertices { id position { x y } } edges { id type thickness vertices { id } } }
  rooms { id floor { id } classifications { label confidence } boundary { edges { id } }
          dimensions(units: metric) { areaFloor width depth height } }
  view(type: "matterport.model.defurnished") { id }
} }"""

Q_PANOS = """query Panos($id: ID!) { model(id: $id) {
  panoLocations { id label position { x y z } rotation { x y z w } skybox(resolution: "RES") { status children } }
} }"""

SKIP_EDGE_TYPES = ("invisible", "opening")
EQ_W = 1024                  # analysis resolution of the equirect images
DIFF_THRESH = 28             # furnished vs defurnished colour difference (0-255) that counts as "changed"
MIN_BLOB = 600               # smallest blob, in pixels at EQ_W
FUSE_DIST = 0.6              # metres: detections closer than this are the same object
DEFAULT_CEIL = 2.7
NADIR_CUT = 66                # degrees below horizon: tripod patch, ignored


# ============================================================================ API
def secret(name, required=True):
    v = os.environ.get(name)
    if not v and Path(".env").exists():
        for line in Path(".env").read_text().splitlines():
            k, _, val = line.partition("=")
            if k.strip() == name:
                v = val.strip().strip('"').strip("'")
    if not v and required:
        sys.exit(f"{name} is not set (env var or .env file).")
    return v


def session():
    import requests
    s = requests.Session()
    s.auth = (secret("MATTERPORT_API_KEY"), secret("MATTERPORT_API_TOKEN"))
    return s


def gql(s, query, **variables):
    r = s.post(API, json={"query": query, "variables": variables}, timeout=120)
    if r.status_code in (401, 403):
        sys.exit(f"Matterport rejected the keys (HTTP {r.status_code}).")
    r.raise_for_status()
    body = r.json()
    if body.get("errors"):
        sys.exit("GraphQL error: " + body["errors"][0].get("message", ""))
    return body["data"]["model"]


# ============================================================================ plan
def build_plan(raw):
    walls, rooms = [], []
    for f in raw["floors"]:
        V = {v["id"]: (v["position"]["x"], v["position"]["y"]) for v in f["vertices"]}
        E = {e["id"]: [v["id"] for v in e["vertices"]] for e in f["edges"]}
        for e in f["edges"]:
            ids = E[e["id"]]
            if len(ids) == 2 and all(i in V for i in ids):
                t = (e.get("type") or "").lower()
                walls.append({"floor": f["id"], "type": e.get("type"), "a": V[ids[0]], "b": V[ids[1]],
                              "thickness": e.get("thickness") or 0.12,
                              "physical": not any(k in t for k in SKIP_EDGE_TYPES)})
        for r in raw["rooms"]:
            if (r.get("floor") or {}).get("id") != f["id"]:
                continue
            edges = [E[x["id"]] for x in (r.get("boundary") or {}).get("edges", []) if x["id"] in E]
            poly = chain(edges, V)
            c = r.get("classifications") or []
            label = c[0]["label"] if c else None
            if poly is None or label == "Void":
                continue
            d = r.get("dimensions") or {}
            rooms.append({"id": r["id"], "floor": f["id"], "label": label or "(unlabelled)", "polygon": poly,
                          "area_m2": d.get("areaFloor"), "height_m": d.get("height")})
    return {"model": raw["id"], "name": raw.get("name"), "walls": walls, "rooms": rooms,
            "defurnished_view": (raw.get("view") or {}).get("id")}


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


def room_of(plan, xy):
    from matplotlib.path import Path as MPath
    for r in plan["rooms"]:
        if MPath(np.array(r["polygon"])).contains_point(xy, radius=0.05):
            return r
    return None


def raycast(origin, theta, walls, max_d=12.0):
    """Distance from origin along world azimuth theta (radians, from +x toward +y) to the nearest wall."""
    segs = [w for w in walls if w["physical"]]
    if not segs:
        return np.full(theta.shape, max_d)
    A = np.array([w["a"] for w in segs]); B = np.array([w["b"] for w in segs])
    half = np.array([w["thickness"] / 2 for w in segs])
    d = np.stack([np.cos(theta), np.sin(theta)], -1)[:, None, :]          # (N,1,2)
    e = (B - A)[None]                                                      # (1,M,2)
    ao = (A - origin)[None]
    cross = lambda u, v: u[..., 0] * v[..., 1] - u[..., 1] * v[..., 0]
    den = cross(d, e)
    with np.errstate(divide="ignore", invalid="ignore"):
        t = cross(ao, e) / den
        s = cross(ao, d) / den
    ok = (np.abs(den) > 1e-9) & (t > 0.05) & (s >= -0.02) & (s <= 1.02)
    t = np.where(ok, t - half[None], np.inf)
    out = t.min(1)
    return np.where(np.isfinite(out), np.maximum(out, 0.1), max_d)


# ============================================================================ panoramas
def download_views(s, plan, model, res, cache, max_panos):
    import requests
    views = {"furnished": model, "defurnished": plan["defurnished_view"]}
    if not views["defurnished"]:
        sys.exit("This model has no defurnished view, which the furniture masks need.")
    panos = {}
    jobs = []
    for name, vid in views.items():
        locs = gql(s, Q_PANOS.replace("RES", res), id=vid)["panoLocations"]
        for p in locs:
            sky = p.get("skybox") or {}
            kids = sky.get("children") or []
            if len(kids) != 6:
                continue
            e = panos.setdefault(p["id"], {"id": p["id"], "label": p.get("label"),
                                           "position": [p["position"][k] for k in "xyz"], "faces": {}})
            if name == "furnished" and p.get("rotation"):
                e["rotation"] = [p["rotation"][k] for k in "xyzw"]
            paths = []
            for k, url in enumerate(kids):
                fp = cache / name / f"{p['id']}_{k}.jpg"
                paths.append(fp)
                if not (fp.exists() and fp.stat().st_size > 0):
                    jobs.append((url, fp))
            e["faces"][name] = paths
    panos = [p for p in panos.values() if len(p["faces"]) == 2]
    panos.sort(key=lambda p: int(p["label"]) if str(p["label"]).isdigit() else 10**6)
    if max_panos:
        keep = {p["id"] for p in panos[:max_panos]}
        panos = [p for p in panos if p["id"] in keep]
        jobs = [j for j in jobs if j[1].name.split("_")[0] in keep]
    for name in views:
        (cache / name).mkdir(parents=True, exist_ok=True)

    def get(job):
        url, fp = job
        r = requests.get(url, timeout=120)
        r.raise_for_status()
        fp.write_bytes(r.content)

    if jobs:
        print(f"downloading {len(jobs)} skybox faces ...")
        with ThreadPoolExecutor(8) as ex:
            list(ex.map(get, jobs))
    print(f"{len(panos)} panos with both furnished and defurnished imagery")
    return panos


def equirect(faces, width=EQ_W):
    """Six skybox faces -> equirect (Matterport layout: 0 up, 1-4 horizon turning right, 5 down; y up, z fwd)."""
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


def grid(W):
    H = W // 2
    lon = (np.arange(W) + 0.5) / W * 2 * np.pi - np.pi
    lat = np.pi / 2 - (np.arange(H) + 0.5) / H * np.pi
    return lon, lat


def lat_to_row(lat, H):
    return np.clip(((np.pi / 2 - lat) / np.pi * H - 0.5).round().astype(int), 0, H - 1)


# ============================================================================ calibration
def calibrate(img, pos, plan, mirrors=(1, -1), heights=None, yaw_window=None):
    """Search heading (0.5 deg), mirror and camera height so the plan's floor/ceiling lines hit image edges."""
    from scipy import ndimage
    H, W = img.shape[:2]
    g = ndimage.gaussian_filter(img.astype(np.float32).mean(2), 1.0)
    grad = np.abs(np.diff(g, axis=0, prepend=g[:1]))
    grad = ndimage.maximum_filter(grad, size=(3, 1))
    lon, _ = grid(W)
    room = room_of(plan, pos[:2])
    ceil = (room or {}).get("height_m") or DEFAULT_CEIL
    walls = [w for w in plan["walls"] if not room or w["floor"] == room["floor"]]
    step = 0.5
    thetas = np.radians(np.arange(0, 360, step))
    dtab = raycast(np.asarray(pos[:2]), thetas, walls)
    cols = np.arange(W)
    lon_deg = np.degrees(lon)
    best = None
    heights = np.arange(1.1, 1.95, 0.05) if heights is None else heights
    for mirror in mirrors:
        idx = (((np.arange(0, 360, step)[:, None] + mirror * lon_deg[None]) % 360) / step).astype(int) % len(dtab)
        D = dtab[idx]                                                      # (yaws, W)
        for h in heights:
            rf = lat_to_row(-np.arctan(h / D), H)
            rc = lat_to_row(np.arctan(max(ceil - h, 0.2) / D), H)
            score = grad[rf, cols].mean(1) + grad[rc, cols].mean(1)
            if yaw_window is not None:                     # (centre_deg, half_width_deg)
                off = (np.arange(0, 360, step) - yaw_window[0] + 180) % 360 - 180
                score = np.where(np.abs(off) <= yaw_window[1], score, -np.inf)
                med = float(np.median(grad[rf, cols].mean(1) + grad[rc, cols].mean(1)))
            k = int(np.argmax(score))
            if best is None or score[k] > best["score"]:
                best = {"yaw_deg": float(k * step), "mirror": mirror, "cam_height_m": round(float(h), 2),
                        "score": float(score[k]),
                        "median": med if yaw_window is not None else float(np.median(score))}
    best["confidence"] = round(best["score"] / max(best["median"], 1e-6), 2)
    best["ceiling_m"] = ceil
    best["room"] = (room or {}).get("label")
    return best, dtab, step


def world_theta(lon, cal):
    return np.radians(cal["yaw_deg"]) + cal["mirror"] * lon


def quat_rotate(q, v):
    x, y, z, w = q
    u = np.array([x, y, z]); v = np.asarray(v, float)
    return 2 * u.dot(v) * u + (w * w - u.dot(u)) * v + 2 * w * np.cross(u, v)


def fit_quat_heading(panos, cals, min_conf=2.0):
    """Learn how Matterport's (undocumented) pano quaternion maps to our heading, from the confidently
    calibrated panos: heading = sign * angle(component j, component i of q*e) + offset. Tries every
    axis/plane/sign; keeps the one whose offsets agree best. Returns a function pano -> heading, or None."""
    good = [(p, cals[p["id"]]) for p in panos if p.get("rotation") and cals[p["id"]]["confidence"] >= min_conf]
    if len(good) < 3:
        return None, f"only {len(good)} confident panos with rotations"
    axes = [np.eye(3)[i] * sg for i in range(3) for sg in (1, -1)]
    best = None
    for e in axes:
        vs = np.array([quat_rotate(p["rotation"], e) for p, _ in good])
        for i in range(3):
            for j in range(3):
                if i == j:
                    continue
                cand = np.degrees(np.arctan2(vs[:, j], vs[:, i]))
                for sg in (1, -1):
                    r = np.radians(np.array([c["yaw_deg"] for _, c in good]) - sg * cand)
                    wts = np.array([c["confidence"] for _, c in good])
                    mean = np.arctan2((wts * np.sin(r)).sum(), (wts * np.cos(r)).sum())
                    dev = np.degrees(np.abs((r - mean + np.pi) % (2 * np.pi) - np.pi))
                    spread = float(np.median(dev))
                    if best is None or spread < best[0]:
                        best = (spread, e, i, j, sg, float(np.degrees(mean)), float(np.mean(dev < 10)))
    spread, e, i, j, sg, off, frac = best
    if spread > 6 or frac < 0.6:
        return None, f"no consistent quaternion convention (median spread {spread:.1f} deg, {frac:.0%} agree)"
    def heading(p):
        v = quat_rotate(p["rotation"], e)
        return (sg * np.degrees(np.arctan2(v[j], v[i])) + off) % 360
    return heading, f"quaternion heading model: median error {spread:.1f} deg, {frac:.0%} of confident panos within 10 deg"


# ============================================================================ detection
def furniture_mask(F, D):
    from scipy import ndimage
    Ff = ndimage.uniform_filter(F.astype(np.float32), size=(5, 5, 1))
    Df = ndimage.uniform_filter(D.astype(np.float32), size=(5, 5, 1))
    ratio = np.median(Ff, (0, 1)) / np.maximum(np.median(Df, (0, 1)), 1)
    diff = np.abs(Ff - Df * ratio).mean(2)
    H, W = diff.shape
    _, lat = grid(W)
    band = (lat < np.radians(72))[:, None]                               # ignore the ceiling cap
    m = (diff > DIFF_THRESH) & band
    m = ndimage.binary_opening(m, iterations=2)
    m = ndimage.binary_closing(m, iterations=4)
    m = ndimage.binary_fill_holes(m)
    lab, n = ndimage.label(m)
    sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
    tops = ndimage.minimum(np.arange(H)[:, None].repeat(W, 1), lab, range(1, n + 1))
    nadir_row = lat_to_row(np.array(-np.radians(NADIR_CUT)), H)
    # drop small blobs, and blobs lying wholly in the tripod patch under the camera
    keep = [i + 1 for i, (sz, t) in enumerate(zip(sizes, tops)) if sz >= MIN_BLOB and t < nadir_row]
    return lab, keep, diff


def place(lab, k, cal, pano, dtab, step, jump=0.5, D=None, wall_items=False):
    """Blob -> floor points. One blob can hold several objects at different depths (table in front of a
    sofa); it is split wherever the floor distance jumps by more than `jump` metres between columns."""
    H, W = lab.shape
    lon, lat = grid(W)
    from scipy import ndimage
    blob = lab == k
    rows, cols = np.nonzero(blob)
    core = ndimage.binary_erosion(blob, iterations=3)          # the mask is dilated by blur/closing
    core_top = np.where(core.any(0), np.argmax(core, 0), -1)
    h = cal["cam_height_m"]
    ucols = np.unique(cols)
    samples = []
    stride = max(1, len(ucols) // 160)
    for c in ucols[::stride]:
        rc = rows[cols == c]
        th = world_theta(lon[c], cal)
        dwall = dtab[int(round(np.degrees(th) % 360 / step)) % len(dtab)]
        pb = lat[rc.max()]
        d_floor = h / np.tan(-pb) if pb < -np.radians(1) else np.inf
        if d_floor <= dwall + 0.15:                                    # stands on this room's floor
            elev, d = False, min(d_floor, dwall - 0.03)
        else:
            # bottom above the floor/wall line: wall-mounted, OR furniture seen through a doorway (the wall
            # graph has no openings). Doorway if the defurnished image just below the object looks like floor.
            if D is not None and is_opening(D, c, rc.max(), cal, dwall):
                continue
            if not wall_items:
                continue
            elev, d = True, dwall - 0.03
        # height: walk up from the bottom while the mask is unbroken (gaps <= 4 px), so art hanging above a
        # cabinet doesn't count as the cabinet's height
        colmask = blob[:, c]
        r = rc.max(); gap = 0; top_row = r
        while r > 0 and gap <= 4:
            r -= 1
            if colmask[r]:
                top_row, gap = r, 0
            else:
                gap += 1
        top_row = max(top_row, core_top[c]) if core_top[c] >= 0 and core_top[c] <= rc.max() else top_row
        top_row = min(top_row + 3, rc.max())                       # undo the mask dilation at the top
        samples.append((c, th, d, lat[top_row], lat[rc.max()], elev, top_row, rc.max()))
    out, seg = [], [samples[0]] if samples else []
    for prev, cur in zip(samples, samples[1:]):
        if abs(cur[2] - prev[2]) > max(jump, 0.35 * min(cur[2], prev[2])) or cur[0] - prev[0] > 4 * stride + 4:
            out.append(seg); seg = []
        seg.append(cur)
    if seg:
        out.append(seg)
    dets = []
    for seg in out:
        if len(seg) < 3:
            continue
        c, th, d, top, bot, elev, trow, brow = map(np.array, zip(*seg))
        is_elev = elev.mean() > 0.5
        dref = float(np.median(d))
        xy = np.c_[pano["position"][0] + d * np.cos(th), pano["position"][1] + d * np.sin(th)]
        cmask = np.isin(cols, np.arange(c.min(), c.max() + 1))
        r0, r1 = int(trow.min()), int(brow.max())
        dets.append({"pano": pano["id"], "pano_label": pano["label"], "pano_xy": np.array(pano["position"][:2]),
                     "cam_h": h, "ceiling": cal["ceiling_m"], "xy": xy, "distance_m": dref,
                     "ray_theta": th, "ray_top_lat": top,
                     "z_bottom": float(max(0.0, h + dref * np.tan(np.median(bot)))) if is_elev else 0.0,
                     "elevated": bool(is_elev), "pixels": int(cmask.sum()),
                     "bbox_px": [int(c.min()), int(r0), int(c.max()), int(r1)],
                     "wraps": bool(c.min() == 0 or c.max() == W - 1)})
    return dets


def is_opening(D, c, bottom_row, cal, dwall, tol=30.0):
    """Compare the defurnished pixels just under an object's bottom edge with this room's floor
    just below the predicted floor/wall line in the same column."""
    H = D.shape[0]
    floor_row = lat_to_row(np.array(-np.arctan(cal["cam_height_m"] / dwall)), H)
    below = D[min(H - 1, bottom_row + 2): min(H, bottom_row + 8), c].astype(float)
    floor = D[min(H - 1, floor_row + 4): min(H, floor_row + 14), c].astype(float)
    if len(below) == 0 or len(floor) == 0 or bottom_row + 2 >= floor_row:
        return False
    return float(np.abs(below.mean(0) - floor.mean(0)).mean()) < tol


def ray_box(o, th, centre, size, yaw):
    """Entry and exit distance of 2D rays (origin o, angles th) through a rotated box; nan if missed."""
    t = np.radians(yaw)
    R = np.array([[np.cos(t), np.sin(t)], [-np.sin(t), np.cos(t)]])
    ol = R @ (o - centre)
    dl = np.stack([np.cos(th), np.sin(th)], 1) @ R.T
    half = np.asarray(size) / 2
    with np.errstate(divide="ignore", invalid="ignore"):
        t1 = (-half - ol) / dl; t2 = (half - ol) / dl
    tn = np.nanmax(np.minimum(t1, t2), 1); tf = np.nanmin(np.maximum(t1, t2), 1)
    hit = (tf > tn) & (tf > 0)
    return np.where(hit, np.maximum(tn, 0), np.nan), np.where(hit, tf, np.nan)


# ============================================================================ fusion + boxes
def min_area_box(xy):
    c = xy.mean(0)
    best = None
    for yaw in np.arange(0, 90, 2.0):
        t = np.radians(yaw)
        R = np.array([[np.cos(t), np.sin(t)], [-np.sin(t), np.cos(t)]])
        q = (xy - c) @ R.T
        ext = np.percentile(q, 97, 0) - np.percentile(q, 3, 0)
        if best is None or ext.prod() < best[0] - 1e-9:
            best = (ext.prod(), yaw, ext)
    yaw = best[1] if best[2][0] >= best[2][1] else best[1] + 90
    t = np.radians(yaw)
    R = np.array([[np.cos(t), np.sin(t)], [-np.sin(t), np.cos(t)]])
    q = (xy - c) @ R.T
    lo, hi = np.percentile(q, 3, 0), np.percentile(q, 97, 0)
    centre = c + ((lo + hi) / 2) @ R
    return centre, (hi - lo), yaw


MAX_SPAN = 3.5   # metres: a single detection wider than this is several objects run together


def fuse(dets):
    """Merge detections of the same object from different panos. A detection joins an object if its
    centroid is within FUSE_DIST, or its points come within 0.25 m - but only while the merged object
    stays about as big as its parts (stops chains of neighbours growing into one giant object)."""
    from scipy.spatial import cKDTree
    objs = []
    for d in sorted(dets, key=lambda d: -d["pixels"]):
        dspan = np.ptp(d["xy"], 0).max()
        if dspan > MAX_SPAN:
            continue
        c = d["xy"].mean(0)
        best, bscore = None, np.inf
        for o in objs:
            if o["elevated"] != d["elevated"] or d["pano"] in o["panos"]:
                continue
            cd = np.linalg.norm(o["centroid"] - c)
            near = cKDTree(o["xy"]).query(d["xy"])[0].min()
            if cd >= FUSE_DIST and near >= 0.25:
                continue
            merged = np.ptp(np.vstack([o["xy"], d["xy"]]), 0).max()
            if merged > 1.25 * max(np.ptp(o["xy"], 0).max(), dspan) + 0.3 or merged > MAX_SPAN:
                continue
            if cd < bscore:
                best, bscore = o, cd
        if best:
            best["xy"] = np.vstack([best["xy"], d["xy"]]); best["views"].append(d); best["panos"].add(d["pano"])
            best["centroid"] = best["xy"].mean(0)
        else:
            objs.append({"xy": d["xy"].copy(), "elevated": d["elevated"], "views": [d],
                         "panos": {d["pano"]}, "centroid": c})
    return objs


def box_corners(centre, size, yaw):
    t = np.radians(yaw)
    u, v = np.array([np.cos(t), np.sin(t)]), np.array([-np.sin(t), np.cos(t)])
    return np.array([centre + sx * size[0] / 2 * u + sy * size[1] / 2 * v for sx, sy in [(-1, -1), (1, -1), (1, 1), (-1, 1)]])


def solidify(o, min_depth=0.6):
    """Box from fused floor points. A camera only sees an object's near edge, so a thin box is pushed
    away from the camera to min_depth (a guess, flagged). Height: the top pixel is the FAR top edge, so it
    is measured at the box's far corner (or near corner if above eye level); median over views."""
    centre, size, yaw = min_area_box(o["xy"])
    flags = []
    if o["elevated"]:
        size = np.array([size[0], max(size[1], 0.05)])          # wall-mounted: stays flat on the wall
    elif size[1] < 0.3:
        t = np.radians(yaw)
        v = np.array([-np.sin(t), np.cos(t)])
        away = centre - min(o["views"], key=lambda w: w["distance_m"])["pano_xy"]
        v = v if away @ v >= 0 else -v
        centre = centre + v * (min_depth - size[1]) / 2
        size = np.array([size[0], min_depth])
        flags.append(f"depth unseen: set to {min_depth} m")
    tops = []
    for w in o["views"]:
        tin, tout = ray_box(w["pano_xy"], w["ray_theta"], centre, size, yaw)
        up = w["ray_top_lat"] >= 0
        z = np.where(up, w["cam_h"] + tin * np.tan(w["ray_top_lat"]),      # above eye: near top edge
                     w["cam_h"] - tout * np.tan(-w["ray_top_lat"]))        # below eye: far top edge
        z = z[np.isfinite(z)]
        if len(z):
            tops.append(float(np.median(z)))
    if not tops:
        tops = [o["views"][0]["cam_h"]]
    z_bot = float(np.median([w["z_bottom"] for w in o["views"]]))
    z_top = float(np.clip(np.median(tops), z_bot + 0.05, o["views"][0]["ceiling"]))
    return centre, size, yaw, z_bot, z_top, flags


# ============================================================================ labelling
def crop(eq_hi, det, scale, pad=0.15):
    c0, r0, c1, r1 = [v * scale for v in det["bbox_px"]]
    w, h = c1 - c0, r1 - r0
    c0, c1 = max(0, int(c0 - pad * w)), min(eq_hi.shape[1], int(c1 + pad * w))
    r0, r1 = max(0, int(r0 - pad * h)), min(eq_hi.shape[0], int(r1 + pad * h))
    return Image.fromarray(eq_hi[r0:r1, c0:c1])


def vlm_label(img, model):
    import requests
    key = secret("ANTHROPIC_API_KEY")
    buf = io.BytesIO(); img.convert("RGB").save(buf, "JPEG", quality=85)
    prompt = ("This crop is from a 360-degree photo of a home interior. Name the main piece of furniture or "
              "decor in the centre of the crop. Reply with JSON only: {\"label\": \"<1-3 words, lowercase>\", "
              "\"furniture\": true|false, \"confidence\": 0-1}. Use furniture=false for walls, doors, windows, "
              "floor, people, reflections or editing artefacts.")
    r = requests.post("https://api.anthropic.com/v1/messages", timeout=120,
                      headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                      json={"model": model, "max_tokens": 100, "messages": [{"role": "user", "content": [
                          {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg",
                                                       "data": base64.b64encode(buf.getvalue()).decode()}},
                          {"type": "text", "text": prompt}]}]})
    r.raise_for_status()
    txt = r.json()["content"][0]["text"]
    try:
        return json.loads(txt[txt.index("{"): txt.rindex("}") + 1])
    except ValueError:
        return {"label": txt.strip()[:40], "furniture": None, "confidence": None}


# ============================================================================ debug + overview
def debug_image(F, lab, keep, cal, dtab, step, path):
    H, W = lab.shape
    img = F.copy()
    m = np.isin(lab, keep)
    img[m] = (0.5 * img[m] + 0.5 * np.array([0, 255, 0])).astype(np.uint8)
    lon, _ = grid(W)
    th = world_theta(lon, cal)
    D = dtab[(np.round(np.degrees(th) % 360 / step).astype(int)) % len(dtab)]
    h = cal["cam_height_m"]
    rf = lat_to_row(-np.arctan(h / D), H)
    rc = lat_to_row(np.arctan(max(cal["ceiling_m"] - h, 0.2) / D), H)
    for dr in (-1, 0, 1):
        img[np.clip(rf + dr, 0, H - 1), np.arange(W)] = (255, 0, 0)
        img[np.clip(rc + dr, 0, H - 1), np.arange(W)] = (0, 90, 255)
    Image.fromarray(img).save(path, quality=85)


def overview(path, plan, panos, cals, objects):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(13, 10))
    for r in plan["rooms"]:
        p = np.array(r["polygon"]); ax.fill(*p.T, alpha=0.08)
        ax.text(*p.mean(0), r["label"], fontsize=7, color="#666", ha="center")
    for w in plan["walls"]:
        ax.plot(*zip(w["a"], w["b"]), color="#111" if w["physical"] else "#bbb", lw=2)
    for p in panos:
        c = cals.get(p["id"])
        if not c:
            continue
        x, y = p["position"][:2]
        t = np.radians(c["yaw_deg"])
        good = c["confidence"] >= 1.3
        ax.plot(x, y, "o", color="#2B3A67" if good else "#d33", ms=4)
        ax.arrow(x, y, 0.35 * np.cos(t), 0.35 * np.sin(t), head_width=0.08, color="#2B3A67" if good else "#d33")
    cmap = plt.get_cmap("tab20")
    for o in objects:
        L, Wd = o["box"]["size_lwh_m"][:2]
        t = np.radians(o["box"]["yaw_deg"])
        u, v = np.array([np.cos(t), np.sin(t)]), np.array([-np.sin(t), np.cos(t)])
        c = np.array(o["box"]["centre"][:2])
        P = np.array([c + sx * L / 2 * u + sy * Wd / 2 * v for sx, sy in [(-1, -1), (1, -1), (1, 1), (-1, 1), (-1, -1)]])
        col = cmap(o["id"] % 20)
        ax.fill(*P.T, color=col, alpha=0.35); ax.plot(*P.T, color=col, lw=1)
        ax.text(*c, f"{o['id']}" + (f" {o['label']}" if o["label"] else ""), fontsize=6, ha="center", va="center")
    ax.set_aspect("equal"); ax.set_xlabel("x (m)"); ax.set_ylabel("y (m)")
    ax.set_title(f"{plan['name']}: {len(objects)} objects (red panos = low-confidence calibration)")
    fig.savefig(path, dpi=160, bbox_inches="tight")


# ============================================================================ main
def main():
    global DIFF_THRESH
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", default="zvKHR9DHNjJ")
    ap.add_argument("--res", default="high", choices=["low", "high", "2k", "4k"], help="skybox face size")
    ap.add_argument("--max-panos", type=int, default=0, help="0 = all; use 3-5 for a quick test")
    ap.add_argument("--diff-thresh", type=int, default=DIFF_THRESH)
    ap.add_argument("--min-confidence", type=float, default=1.3, help="skip panos calibrated below this")
    ap.add_argument("--wall-items", action="store_true", help="also keep wall-mounted items (art, mirrors, TVs)")
    ap.add_argument("--label", action="store_true", help="label each object with a vision model")
    ap.add_argument("--vlm", default="claude-haiku-5-5")
    ap.add_argument("--labels", help="hand-edited labels.json to merge in")
    ap.add_argument("--plan-raw", help="saved plan_raw.json (skips the plan API call)")
    ap.add_argument("--out")
    a = ap.parse_args()
    DIFF_THRESH = a.diff_thresh
    out = Path(a.out or f"pano_{a.model}")
    for sub in ("debug", "crops"):
        (out / sub).mkdir(parents=True, exist_ok=True)
    cache = out / "cache"

    s = session()
    raw = json.load(open(a.plan_raw)) if a.plan_raw else gql(s, Q_PLAN, id=a.model)
    json.dump(raw, open(out / "plan_raw.json", "w"))
    plan = build_plan(raw)
    print(f"plan: {len(plan['rooms'])} rooms, {len(plan['walls'])} wall edges, "
          f"edge types {sorted({str(w['type']) for w in plan['walls']})}")
    json.dump(plan, open(out / "plan.json", "w"), indent=1)

    panos = download_views(s, plan, a.model, a.res, cache, a.max_panos)
    # pass 1: free search (heading, mirror, height) per pano
    imgs, first = {}, {}
    for p in panos:
        F = equirect(p["faces"]["furnished"]); D = equirect(p["faces"]["defurnished"])
        imgs[p["id"]] = (F, D)
        first[p["id"]] = calibrate(F, p["position"], plan)[0]
    # the mirror is a property of the camera format, so it must be the same for every pano: weighted vote
    votes = {1: 0.0, -1: 0.0}
    for c in first.values():
        votes[c["mirror"]] += max(c["confidence"] - 1, 0)
    mirror = 1 if votes[1] >= votes[-1] else -1
    # camera height = pano z - floor z; floor z per storey (panos grouped by z) from the pass-1 heights
    zs = sorted((p["position"][2], p["id"]) for p in panos)
    groups, cur = [], [zs[0]]
    for z in zs[1:]:
        if z[0] - cur[-1][0] > 1.2:
            groups.append(cur); cur = []
        cur.append(z)
    groups.append(cur)
    floor_z = {}
    for g in groups:
        fz = float(np.median([z - first[i]["cam_height_m"] for z, i in g if first[i]["mirror"] == mirror] or
                             [z - first[i]["cam_height_m"] for z, i in g]))
        for _, i in g:
            floor_z[i] = fz
    print(f"global mirror {mirror:+d} (votes {votes[1]:.1f} vs {votes[-1]:.1f}); "
          f"floor z per storey: {sorted({round(v, 2) for v in floor_z.values()})}")

    first_with_h = {}
    for p in panos:   # re-score pass 1 at the pinned height so confidences are comparable
        first_with_h[p["id"]] = first[p["id"]]
    heading, msg = fit_quat_heading(panos, first_with_h)
    print(msg)

    # pass 2: heading only, with mirror and camera height pinned
    cals, dets, eqs = {}, [], {}
    for p in panos:
        F, D = imgs[p["id"]]
        h0 = p["position"][2] - floor_z[p["id"]]
        win = (heading(p), 4.0) if heading and p.get("rotation") else None
        cal, dtab, step = calibrate(F, p["position"], plan, mirrors=(mirror,),
                                    heights=h0 + np.array([-0.05, 0, 0.05]), yaw_window=win)
        cal["heading_source"] = "quaternion model (+-4 deg refined)" if win else "image search"
        cal["floor_z"] = round(floor_z[p["id"]], 3)
        cals[p["id"]] = cal
        lab, keep, _ = furniture_mask(F, D)
        debug_image(F, lab, keep, cal, dtab, step, out / "debug" / f"pano_{p['label']}.jpg")
        ok = cal["confidence"] >= a.min_confidence or win is not None
        print(f"  pano {p['label']:>3}: room {cal['room']}, yaw {cal['yaw_deg']:5.1f}, cam {cal['cam_height_m']} m, "
              f"confidence {cal['confidence']}{'' if ok else '  (SKIPPED)'}; {len(keep)} blobs")
        if not ok:
            continue
        own = room_of(plan, p["position"][:2])
        for k in keep:
            for d in place(lab, k, cal, p, dtab, step, D=D, wall_items=a.wall_items):
                r = room_of(plan, d["xy"].mean(0))
                if own is None or (r is not None and r["id"] == own["id"]):   # each pano reports its own room only
                    dets.append(d)
        eqs[p["id"]] = p
    json.dump([{k: p.get(k) for k in ("id", "label", "position", "rotation")} for p in panos], open(out / "panos.json", "w"), indent=1)

    labels = json.load(open(a.labels)) if a.labels else {}
    objects = []
    hi_cache = {}
    for o in fuse(dets):
        if len(o["xy"]) < 3:
            continue
        home = room_of(plan, o["xy"].mean(0))
        for md in (0.6, 0.3, 0.05):          # guessed depth must not push the box through a wall
            centre, size, yaw, z_bot, z_top, extra = solidify(o, min_depth=md)
            if o["elevated"] or home is None or (room_of(plan, centre) or {}).get("id") == home["id"]:
                break
        if max(size) < 0.25 or (z_top - z_bot) < 0.1:
            continue                                                  # slivers and flat patches (rugs, shadows)
        probe = centre
        if o["elevated"]:
            v = o["views"][0]["pano_xy"] - centre
            probe = centre + 0.15 * v / (np.linalg.norm(v) or 1)
        room = room_of(plan, probe)
        if room is None:
            continue                                                  # landed outside the plan: discard
        primary = min(o["views"], key=lambda v: v["distance_m"])
        oid = len(objects)
        rec = {"id": oid, "label": None, "label_source": None, "furniture": None,
               "room": {"id": room["id"], "label": room["label"]},
               "box": {"centre": [round(float(centre[0]), 3), round(float(centre[1]), 3),
                                  round((z_bot + z_top) / 2, 3)],
                       "size_lwh_m": [round(float(size[0]), 2), round(float(size[1]), 2), round(z_top - z_bot, 2)],
                       "yaw_deg": round(float(yaw), 1), "z_bottom": round(z_bot, 2), "z_top": round(z_top, 2)},
               "on_floor": not o["elevated"],
               "seen_from_panos": sorted({v["pano_label"] for v in o["views"]}, key=str),
               "primary_view": {"pano": primary["pano"], "pano_label": primary["pano_label"],
                                "distance_m": round(primary["distance_m"], 2), "bbox_px_at_1024": primary["bbox_px"]},
               "flags": extra}
        if len(o["views"]) == 1:
            rec["flags"].append("seen from one pano only")
        if o["elevated"]:
            rec["flags"].append("not touching the floor: wall-mounted, hanging or on a counter")
        if any(v["wraps"] for v in o["views"]):
            rec["flags"].append("crosses the panorama seam: may be split in two")
        pid = primary["pano"]
        if pid not in hi_cache:
            hi_cache = {pid: equirect(eqs[pid]["faces"]["furnished"], width=2048)}
        img = crop(hi_cache[pid], primary, 2)
        img.save(out / "crops" / f"obj_{oid:03d}.jpg", quality=88)
        if str(oid) in labels and labels[str(oid)]:
            rec["label"], rec["label_source"] = labels[str(oid)], "labels.json"
        elif a.label:
            try:
                res = vlm_label(img, a.vlm)
                rec["label"], rec["furniture"], rec["label_source"] = res.get("label"), res.get("furniture"), a.vlm
                rec["label_confidence"] = res.get("confidence")
            except Exception as e:                                    # keep going if one call fails
                rec["flags"].append(f"labelling failed: {e}"[:120])
        objects.append(rec)

    json.dump({"model": a.model, "units": "metres, Matterport model frame, z up, heights above floor",
               "method": "furnished minus defurnished panoramas, placed with plan-calibrated pano poses",
               "calibration": cals, "objects": objects}, open(out / "objects.json", "w"), indent=1)
    if not (out / "labels.json").exists() or a.labels or a.label:
        json.dump({str(o["id"]): o["label"] or "" for o in objects}, open(out / "labels.json", "w"), indent=1)
    overview(out / "overview.png", plan, panos, cals, objects)
    print(f"\n{len(objects)} objects -> {out}/objects.json, overview.png, crops/, debug/")
    print("Check debug/*.jpg first: red = predicted floor line, blue = ceiling line, green = detected furniture.")


if __name__ == "__main__":
    main()
