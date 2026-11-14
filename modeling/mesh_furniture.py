#!/usr/bin/env python3
r"""
mesh_furniture.py - separate furniture from the empty room by comparing meshes.

Compares Matterport's *furnished-side* mesh (default: the simple-planes mesh, which
keeps flat furniture surfaces; a full furnished mesh works too if you have one) with
the *defurnished* mesh. Anything that exists in the first but not in the second is
furniture. It is clustered into objects, fused with the panorama boxes from
pano_pipeline.py, and exported so each object can be moved around the empty mesh.

    python modeling/mesh_furniture.py          (run from the repo root; finds the meshes itself)
    python modeling/mesh_furniture.py --furnished <obj> --empty <obj> --pano-dir pano_<sid>   (explicit)

Outputs (in <pano-dir>/mesh_diff/ unless --out):
    objects_fused.json    same schema as objects.json -> loads in planner.html / splat_remove.py
    objects_mesh.json     mesh-only clusters (before fusion)
    objects/obj_###.obj   one movable mesh per object (surface patches, or a box if too sparse)
    empty_room.obj        copy of the empty mesh (the thing objects get placed in)
    scene.json            empty mesh + objects with centre/yaw so a viewer can place them
    topdown.png           quick visual check (needs matplotlib)
    report.json

Only numpy is required. Coordinates: metres, Matterport model frame, z up.
"""
import argparse, json, math, os, shutil, sys
import numpy as np


# ----------------------------------------------------------------------------- OBJ
def load_obj(path):
    V, F, G = [], [], []
    grp = ""
    with open(path, "r", errors="ignore") as fh:
        for line in fh:
            if line.startswith("v "):
                V.append([float(x) for x in line.split()[1:4]])
            elif line.startswith("g ") or line.startswith("o "):
                grp = line.split(None, 1)[1].strip()
            elif line.startswith("f "):
                idx = [int(t.split("/")[0]) for t in line.split()[1:]]
                idx = [i - 1 if i > 0 else len(V) + i for i in idx]
                for k in range(1, len(idx) - 1):          # fan triangulation
                    F.append((idx[0], idx[k], idx[k + 1]))
                    G.append(grp)
    return np.array(V, float), np.array(F, int), np.array(G)


def write_obj(path, V, F, name="obj"):
    with open(path, "w") as fh:
        fh.write(f"o {name}\n")
        for v in V:
            fh.write(f"v {v[0]:.4f} {v[1]:.4f} {v[2]:.4f}\n")
        for f in F:
            fh.write(f"f {f[0]+1} {f[1]+1} {f[2]+1}\n")


def box_mesh(c, size, yaw_deg, zb, zt):
    l, w = size[0], size[1]
    a = math.radians(yaw_deg)
    ca, sa = math.cos(a), math.sin(a)
    corners = []
    for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        x, y = sx * l / 2, sy * w / 2
        corners.append((c[0] + x * ca - y * sa, c[1] + x * sa + y * ca))
    V = [[x, y, zb] for x, y in corners] + [[x, y, zt] for x, y in corners]
    F = [(0, 2, 1), (0, 3, 2), (4, 5, 6), (4, 6, 7),
         (0, 1, 5), (0, 5, 4), (1, 2, 6), (1, 6, 5),
         (2, 3, 7), (2, 7, 6), (3, 0, 4), (3, 4, 7)]
    return np.array(V, float), np.array(F, int)


# ----------------------------------------------------------------------------- sampling
def sample_surface(V, F, spacing, rng):
    """Random points on triangles (about one per spacing^2) + per-point normal z and tri id."""
    a, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    cr = np.cross(b - a, c - a)
    area = 0.5 * np.linalg.norm(cr, axis=1)
    nrm = cr / np.maximum(np.linalg.norm(cr, axis=1, keepdims=True), 1e-12)
    n = np.maximum(1, np.ceil(area / spacing ** 2)).astype(int)
    n = np.minimum(n, 6000)
    tri = np.repeat(np.arange(len(F)), n)
    r1, r2 = rng.random(len(tri)), rng.random(len(tri))
    s = np.sqrt(r1)
    P = (1 - s)[:, None] * a[tri] + (s * (1 - r2))[:, None] * b[tri] + (s * r2)[:, None] * c[tri]
    return P, nrm[tri], tri, area


def voxel_keys(P, cell, origin):
    I = np.floor((P - origin) / cell).astype(np.int64)
    return I


def pack(I, M=4096):
    return (I[:, 0] + 8) * M * M + (I[:, 1] + 8) * M + (I[:, 2] + 8)


class NearSet:
    """'is there a sample of the empty mesh within r metres?' via occupied voxels."""
    def __init__(self, P, r, cell=0.04):
        self.cell, self.origin = cell, P.min(0) - 0.5
        self.keys = np.unique(pack(voxel_keys(P, cell, self.origin)))
        k = int(math.ceil(r / cell))
        self.off = [(i, j, l) for i in range(-k, k + 1) for j in range(-k, k + 1)
                    for l in range(-k, k + 1) if i * i + j * j + l * l <= k * k]

    def near(self, Q):
        I = voxel_keys(Q, self.cell, self.origin)
        hit = np.zeros(len(Q), bool)
        for o in self.off:
            kk = pack(I + np.array(o))
            pos = np.searchsorted(self.keys, kk)
            pos[pos >= len(self.keys)] = len(self.keys) - 1
            hit |= self.keys[pos] == kk
        return hit


# ----------------------------------------------------------------------------- geometry
def seg_dist(P, a, b):
    ab = b - a
    t = np.clip(((P - a) @ ab) / max(ab @ ab, 1e-12), 0, 1)
    return np.linalg.norm(P - (a + t[:, None] * ab), axis=1)


def dist_to_walls(P2, walls):
    d = np.full(len(P2), 1e9)
    for w in walls:
        d = np.minimum(d, seg_dist(P2, np.array(w["a"], float), np.array(w["b"], float)))
    return d


def min_area_rect(P2):
    """Smallest-area oriented rectangle: returns centre, (l, w), yaw_deg with l >= w."""
    c0 = P2.mean(0)
    best = None
    for deg in np.arange(0, 90, 2.0):
        a = math.radians(deg)
        R = np.array([[math.cos(a), math.sin(a)], [-math.sin(a), math.cos(a)]])
        Q = (P2 - c0) @ R.T
        lo, hi = Q.min(0), Q.max(0)
        area = (hi[0] - lo[0]) * (hi[1] - lo[1])
        if best is None or area < best[0]:
            best = (area, deg, lo, hi, R)
    _, deg, lo, hi, R = best
    centre_local = (lo + hi) / 2
    centre = c0 + centre_local @ R
    l, w = hi[0] - lo[0], hi[1] - lo[1]
    yaw = deg
    if w > l:
        l, w, yaw = w, l, deg + 90
    return centre, (float(l), float(w)), float(yaw % 180)



def fill_ratio(P2, centre, size, yaw, step=0.10):
    a = math.radians(yaw)
    d = P2 - np.array(centre)
    u = d[:, 0] * math.cos(a) + d[:, 1] * math.sin(a)
    v = -d[:, 0] * math.sin(a) + d[:, 1] * math.cos(a)
    cells = set(zip(np.floor(u / step).astype(int), np.floor(v / step).astype(int)))
    return len(cells) * step * step / max(size[0] * size[1], 1e-6)


def split_concave(P, depth=0, min_fill=0.6):
    """Split an L/U-shaped cluster into rectangles. Returns a list of point arrays."""
    c, size, yaw = min_area_rect(P[:, :2])
    if depth >= 2 or len(P) < 200 or fill_ratio(P[:, :2], c, size, yaw) >= min_fill:
        return [P]
    a = math.radians(yaw)
    d = P[:, :2] - c
    uv = np.stack([d[:, 0] * math.cos(a) + d[:, 1] * math.sin(a),
                   -d[:, 0] * math.sin(a) + d[:, 1] * math.cos(a)], 1)
    best = None
    for ax in (0, 1):
        for t in np.linspace(uv[:, ax].min() + 0.3, uv[:, ax].max() - 0.3, 25) if np.ptp(uv[:, ax]) > 0.7 else []:
            m1 = uv[:, ax] < t
            if m1.sum() < 60 or (~m1).sum() < 60:
                continue
            sc = 0
            for m in (m1, ~m1):
                cc, sz, yw = min_area_rect(P[m][:, :2])
                sc += fill_ratio(P[m][:, :2], cc, sz, yw) * m.sum()
            sc /= len(P)
            if best is None or sc > best[0]:
                best = (sc, ax, t)
    if best is None or best[0] < fill_ratio(P[:, :2], c, size, yaw) + 0.1:
        return [P]
    _, ax, t = best
    m1 = uv[:, ax] < t
    return split_concave(P[m1], depth + 1) + split_concave(P[~m1], depth + 1)


def cluster_points(P, radius):
    """Connected components of points closer than ~radius (voxel flood fill)."""
    cell = radius
    I = np.floor((P - P.min(0)) / cell).astype(np.int64)
    key = pack(I)
    uniq, inv = np.unique(key, return_inverse=True)
    parent = np.arange(len(uniq))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    index = {int(k): i for i, k in enumerate(uniq)}
    offs = [(i, j, l) for i in (-1, 0, 1) for j in (-1, 0, 1) for l in (-1, 0, 1)
            if (i, j, l) > (0, 0, 0)]
    for i, k in enumerate(uniq):
        base = int(k)
        for o in offs:
            nb = base + o[0] * 4096 * 4096 + o[1] * 4096 + o[2]
            j = index.get(nb)
            if j is not None:
                ra, rb = find(i), find(j)
                if ra != rb:
                    parent[ra] = rb
    roots = np.array([find(i) for i in range(len(uniq))])
    return roots[inv]


def rect_corners(c, size, yaw_deg):
    a = math.radians(yaw_deg)
    ca, sa = math.cos(a), math.sin(a)
    out = []
    for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        x, y = sx * size[0] / 2, sy * size[1] / 2
        out.append((c[0] + x * ca - y * sa, c[1] + x * sa + y * ca))
    return np.array(out)


def raster_overlap(b1, b2, step=0.04):
    """Overlap of two oriented rectangles: (intersection / smaller area, intersection / union)."""
    pts = np.vstack([rect_corners(*b1), rect_corners(*b2)])
    lo, hi = pts.min(0), pts.max(0)
    xs = np.arange(lo[0], hi[0], step) + step / 2
    ys = np.arange(lo[1], hi[1], step) + step / 2
    X, Y = np.meshgrid(xs, ys)
    Q = np.stack([X.ravel(), Y.ravel()], 1)

    def inside(c, size, yaw):
        a = math.radians(yaw)
        d = Q - np.array(c)
        u = d[:, 0] * math.cos(a) + d[:, 1] * math.sin(a)
        v = -d[:, 0] * math.sin(a) + d[:, 1] * math.cos(a)
        return (np.abs(u) <= size[0] / 2) & (np.abs(v) <= size[1] / 2)

    m1, m2 = inside(*b1), inside(*b2)
    inter, a1, a2 = (m1 & m2).sum(), m1.sum(), m2.sum()
    if min(a1, a2) == 0:
        return 0.0, 0.0
    return inter / min(a1, a2), inter / max(a1 + a2 - inter, 1)


def in_box(b, E, floor_z, pad=0.05):
    ang = math.radians(b["yaw_deg"]); d = E[:, :2] - np.array(b["centre"][:2])
    u = d[:, 0] * math.cos(ang) + d[:, 1] * math.sin(ang); v = -d[:, 0] * math.sin(ang) + d[:, 1] * math.cos(ang)
    h = E[:, 2] - floor_z
    return ((np.abs(u) <= b["size_lwh_m"][0] / 2 + pad) & (np.abs(v) <= b["size_lwh_m"][1] / 2 + pad)
            & (h >= b["z_bottom"] - 0.05) & (h <= b["z_top"] + 0.10))


def box_support(b, E, floor_z, cell=0.10, pad=0.05):
    """Share of the box footprint (cell x cell grid) with mesh-difference evidence inside the box height; + point count."""
    ang = math.radians(b["yaw_deg"]); L, W = b["size_lwh_m"][0] + 2 * pad, b["size_lwh_m"][1] + 2 * pad
    d = E[:, :2] - np.array(b["centre"][:2])
    u = d[:, 0] * math.cos(ang) + d[:, 1] * math.sin(ang); v = -d[:, 0] * math.sin(ang) + d[:, 1] * math.cos(ang)
    h = E[:, 2] - floor_z
    m = (np.abs(u) <= L / 2) & (np.abs(v) <= W / 2) & (h >= b["z_bottom"] - 0.05) & (h <= b["z_top"] + 0.10)
    nu, nv = max(1, int(math.ceil(L / cell))), max(1, int(math.ceil(W / cell)))
    if not m.any():
        return 0.0, 0
    iu = np.clip(((u[m] + L / 2) / cell).astype(int), 0, nu - 1); iv = np.clip(((v[m] + W / 2) / cell).astype(int), 0, nv - 1)
    return len(np.unique(iu * nv + iv)) / (nu * nv), int(m.sum())


def point_in_room(pt, rooms):
    from matplotlib.path import Path  # only used if matplotlib exists
    for r in rooms:
        if Path(np.array(r["polygon"])).contains_point(pt):
            return {"id": r["id"], "label": r.get("label")}
    return None


def room_of(pt, rooms):
    x, y = pt
    for r in rooms:
        poly = r["polygon"]
        inside, j = False, len(poly) - 1
        for i in range(len(poly)):
            xi, yi = poly[i]
            xj, yj = poly[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi:
                inside = not inside
            j = i
        if inside:
            return {"id": r["id"], "label": r.get("label")}
    return None


# ----------------------------------------------------------------------------- main
def estimate_floor_z(P, N, bin_m=0.02):
    """Mode of upward-facing samples in the lowest 40% of heights (2 cm bins).
    Safe for perfectly flat floors (all samples at one height) and for meshes with
    no upward-facing low samples (falls back to the lowest sample height)."""
    if len(P) == 0:
        raise ValueError("empty mesh: cannot estimate floor height")
    low = P[(N[:, 2] > 0.8) & (P[:, 2] < np.percentile(P[:, 2], 40))]
    if len(low) == 0:
        return float(P[:, 2].min())
    z0, z1 = float(low[:, 2].min()), float(low[:, 2].max())
    # np.arange(z0, z1 + bin) yields a single edge (zero bins) when z0 == z1; build >= 1 bin explicitly
    nbins = max(1, int(math.ceil((z1 - z0) / bin_m)))
    hist, edges = np.histogram(low[:, 2], bins=nbins, range=(z0, z0 + nbins * bin_m))
    return float(edges[hist.argmax()] + bin_m / 2)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--furnished", default=None, help="OBJ with the furniture still in it (default: the simple-planes OBJ found in assets_<sid>/)")
    ap.add_argument("--empty", default=None, help="defurnished OBJ (default: found in assets_<sid>/)")
    ap.add_argument("--pano-dir", default=None, help="pano_<sid>/ folder (default: the only pano_*/ folder here)")
    ap.add_argument("--out", default=None)
    ap.add_argument("--tol", type=float, default=0.12, help="metres: farther than this from the empty mesh = furniture")
    ap.add_argument("--spacing", type=float, default=0.05)
    ap.add_argument("--cluster-radius", type=float, default=0.20)
    ap.add_argument("--min-area", type=float, default=0.06, help="m2 footprint")
    ap.add_argument("--min-height", type=float, default=0.15)
    ap.add_argument("--wall-margin", type=float, default=0.10, help="ignore vertical evidence this close to a plan wall (m) beyond wall half-thickness")
    ap.add_argument("--match-overlap", type=float, default=0.25, help="footprint overlap needed to fuse mesh+pano")
    ap.add_argument("--min-support", type=float, default=0.12,
                    help="reject pano-only furniture/surface boxes whose footprint has mesh evidence in less than this share "
                         "of 10 cm cells AND fewer than --min-support-points evidence points (0 = keep all)")
    ap.add_argument("--min-support-points", type=int, default=30,
                    help="...a box with at least this many evidence points is kept anyway (thin lamps/plants in oversized boxes)")
    ap.add_argument("--no-plot", action="store_true")
    a = ap.parse_args()

    import glob
    if not a.pano_dir:
        c = [d for d in glob.glob("pano_*") if os.path.isdir(d)]
        if len(c) != 1:
            sys.exit("pass --pano-dir pano_<modelid> (found: %s)" % c)
        a.pano_dir = c[0]
    sid = os.path.basename(os.path.normpath(a.pano_dir)).replace("pano_", "")
    def find(pat):
        f = sorted(glob.glob(os.path.join("assets_%s" % sid, "matterport", "meshes", pat)))
        return f[0] if f else None
    a.furnished = a.furnished or find("*simple_planes*.obj")
    a.empty = a.empty or find("*defurnished*.obj")
    if not (a.furnished and a.empty):
        sys.exit("could not find the OBJ files; pass --furnished and --empty")
    print("furnished:", a.furnished, "\nempty    :", a.empty)

    rng = np.random.default_rng(7)
    out = a.out or os.path.join(a.pano_dir, "mesh_diff")
    os.makedirs(os.path.join(out, "objects"), exist_ok=True)

    plan = json.load(open(os.path.join(a.pano_dir, "plan.json")))
    walls = [w for w in plan["walls"] if w.get("type", "wall") == "wall"]
    rooms = plan["rooms"]
    pano_path = os.path.join(a.pano_dir, "objects.json")
    pano = json.load(open(pano_path)) if os.path.exists(pano_path) else None
    pano_objs = pano["objects"] if pano else []

    print("loading meshes ...")
    Ve, Fe, Ge = load_obj(a.empty)
    Vf, Ff, Gf = load_obj(a.furnished)
    print(f"  empty     : {len(Ve):6d} verts {len(Fe):6d} tris")
    print(f"  furnished : {len(Vf):6d} verts {len(Ff):6d} tris")

    # ---- floor height: mode of upward-facing empty-mesh samples below 0.6 m
    Pe, Ne, _, _ = sample_surface(Ve, Fe, 0.06, rng)
    floor_z = estimate_floor_z(Pe, Ne)
    if pano and pano_objs:
        floor_z = float(np.median([o["floor_z"] for o in pano_objs if "floor_z" in o] or [floor_z]))
    ceil_z = float(np.percentile(Pe[Ne[:, 2] < -0.8][:, 2], 50)) if (Ne[:, 2] < -0.8).any() else floor_z + 2.6
    print(f"  floor z = {floor_z:.3f} m   ceiling z ~ {ceil_z:.2f} m")

    # ---- which furnished-mesh points are NOT in the empty mesh?
    Pf, Nf, tri_id, tri_area = sample_surface(Vf, Ff, a.spacing, rng)
    near = NearSet(Pe, a.tol).near(Pf)
    extra = ~near
    print(f"  furnished samples: {len(Pf)}  not in empty mesh: {extra.sum()} ({100*extra.mean():.1f}%)")

    h = Pf[:, 2] - floor_z
    keep = extra & (h > 0.04) & (Pf[:, 2] < ceil_z - 0.15)
    horiz = np.abs(Nf[:, 2]) > 0.7
    # vertical surfaces right next to a plan wall are almost always wall-geometry disagreement
    dw = dist_to_walls(Pf[:, :2], walls) if len(walls) else np.full(len(Pf), 9)
    keep &= horiz | (dw > a.wall_margin + 0.15)
    # upward faces on top of walls or in the wall band are not furniture either
    keep &= ~(horiz & (dw < 0.12))
    E, Eh = Pf[keep], Pf[keep][:, 2] - floor_z
    print(f"  evidence points kept: {len(E)}")
    if len(E) == 0:
        sys.exit("no difference found between the meshes (are they in the same frame?)")

    # ---- cluster into objects
    lab = cluster_points(E, a.cluster_radius)
    Nk = Nf[keep]
    mesh_objs, dropped = [], 0
    for cl in np.unique(lab):
        sel = lab == cl
        parts = split_concave(E[sel])
        for P in parts:
            if len(P) < 12:
                dropped += 1
                continue
            c2, (l, w), yaw = min_area_rect(P[:, :2])
            zt = float(np.percentile(P[:, 2], 99)) - floor_z
            zmin = float(P[:, 2].min()) - floor_z
            flat = (zt - zmin) < 0.12
            flags = []
            if flat and 0.4 < zt < 1.25 and l * w >= 0.25:
                on_floor, zb = True, 0.0           # table / desk / counter: top plane only -> extend to floor
                flags.append("flat_top_extruded_to_floor")
            else:
                on_floor = zmin < 0.35
                zb = 0.0 if on_floor else zmin
            if l * w < a.min_area or (zt - zb) < a.min_height or l > 4.5 or w < 0.12:
                dropped += 1
                continue
            mesh_objs.append(dict(centre=[float(c2[0]), float(c2[1])], size=(l, w), yaw=yaw,
                                  zb=zb, zt=zt, on_floor=bool(on_floor), n=int(len(P)),
                                  fill=float(fill_ratio(P[:, :2], c2, (l, w), yaw)),
                                  horiz_frac=1.0 if flat else 0.6, flags=flags))
    print(f"  mesh clusters: {len(mesh_objs)} kept, {dropped} dropped (too small/thin/large)")

    # ---- fuse with the panorama boxes
    # one pano box per mesh cluster (best overlap wins); the mesh is exact about heights and,
    # for flat-topped pieces, about the footprint; the panoramas keep their own box as pano_box.
    fused = [json.loads(json.dumps(o)) for o in pano_objs]
    for o in fused:
        o["source"] = "pano"
    cand = [i for i, o in enumerate(fused) if o.get("layer") in ("furniture", "surface")]
    used = set()
    for mi, m in enumerate(mesh_objs):
        mfp = (m["centre"], m["size"], m["yaw"])
        scored = []
        for i in cand:
            b = fused[i]["box"]
            ov, iou = raster_overlap((b["centre"][:2], b["size_lwh_m"][:2], b["yaw_deg"]), mfp)
            if ov >= a.match_overlap:
                scored.append((iou + ov, i, ov))
        if not scored:
            continue
        scored.sort(reverse=True)
        _, i, ov = scored[0]
        used.add(mi)
        new = fused[i]
        b = new["box"]
        new["pano_box"] = json.loads(json.dumps(b))
        new["source"] = "pano+mesh"
        new["mesh_match"] = {"overlap": round(ov, 2), "mesh_points": m["n"],
                             "mesh_height_m": round(m["zt"] - m["zb"], 3)}
        if m["horiz_frac"] > 0.5 and m["n"] >= 150:
            b["centre"][:2] = [round(m["centre"][0], 3), round(m["centre"][1], 3)]
            b["size_lwh_m"][:2] = [round(m["size"][0], 3), round(m["size"][1], 3)]
            b["yaw_deg"] = round(m["yaw"], 1)
            new.setdefault("flags", []).append("footprint_from_mesh")
        b["z_top"] = round(m["zt"], 3)
        b["z_bottom"] = round(m["zb"], 3) if not new.get("on_floor", True) else 0.0
        b["size_lwh_m"][2] = round(b["z_top"] - b["z_bottom"], 3)
        b["centre"][2] = round(floor_z + (b["z_top"] + b["z_bottom"]) / 2, 3)
        new["confirmed"] = True
        new["flags"] = list(dict.fromkeys(new.get("flags", []) + m["flags"]))
        # other pano boxes sitting inside this mesh object are probably the same thing
        for _, j, ov2 in scored[1:]:
            if ov2 >= 0.6:
                fused[j].setdefault("flags", []).append(f"duplicate_of_{new['id']}")

    nid = max([o["id"] for o in fused] + [-1]) + 1
    for i, m in enumerate(mesh_objs):
        if i in used:
            continue
        if any(raster_overlap((m["centre"], m["size"], m["yaw"]),
               (o["box"]["centre"][:2], o["box"]["size_lwh_m"][:2], o["box"]["yaw_deg"]))[0] > 0.6
               for o in fused if o.get("layer") == "wall"):
            continue                                   # explained by a wall-mounted item
        fused.append({
            "id": nid, "label": None, "label_source": None, "furniture": None,
            "room": room_of(m["centre"], rooms),
            "box": {"centre": [round(m["centre"][0], 3), round(m["centre"][1], 3),
                               round(floor_z + (m["zb"] + m["zt"]) / 2, 3)],
                    "size_lwh_m": [round(m["size"][0], 3), round(m["size"][1], 3), round(m["zt"] - m["zb"], 3)],
                    "yaw_deg": round(m["yaw"], 1), "z_bottom": round(m["zb"], 3), "z_top": round(m["zt"], 3)},
            "on_floor": m["on_floor"],
            "layer": "furniture" if m["on_floor"] and (m["zt"] - m["zb"]) > 0.3 else
                     ("surface" if not m["on_floor"] else "floor_covering"),
            "floor_z": round(floor_z, 3), "confirmed": False, "seen_from_panos": [],
            "primary_view": None, "flags": ["mesh_only"] + m["flags"], "source": "mesh",
            "mesh_match": {"mesh_points": m["n"]}})
        nid += 1

    # ---- mesh support for panorama-only boxes: how much of the footprint has furniture evidence under it that no
    # confirmed box (pano+mesh / mesh-only) already explains? Rugs / floor coverings are too thin for the mesh
    # difference, so they are scored but never rejected.
    conf = [o for o in fused if o["source"] in ("pano+mesh", "mesh") and o.get("layer") in ("furniture", "surface")]
    explained = np.zeros(len(E), bool)
    for o in conf:
        explained |= in_box(o["box"], E, floor_z)
    rejected, dups = [], []
    for o in fused:
        if o["source"] != "pano" or o.get("layer") not in ("furniture", "surface", "floor_covering"):
            continue
        if any(f.startswith("duplicate_of_") for f in o.get("flags") or []):
            continue
        cov, npts = box_support(o["box"], E, floor_z)
        cov_own, npts_own = box_support(o["box"], E[~explained], floor_z)
        o["mesh_support"] = {"coverage": round(cov, 3), "points": npts, "coverage_unexplained": round(cov_own, 3),
                             "points_unexplained": npts_own}
        if o["layer"] == "floor_covering":
            continue
        if cov < a.min_support and npts < a.min_support_points:
            o.setdefault("flags", []).append("no_mesh_support"); rejected.append(o)
        elif cov_own < a.min_support and npts_own < a.min_support_points:
            # its geometry is already inside a confirmed object's cut -> same convention as the fusion duplicates
            mine = in_box(o["box"], E, floor_z)
            best = max(conf, key=lambda c: int((mine & in_box(c["box"], E, floor_z)).sum()))
            o.setdefault("flags", []).append(f"duplicate_of_{best['id']}"); dups.append((o["id"], best["id"]))
    if rejected:
        ids = {id(o) for o in rejected}
        fused = [o for o in fused if id(o) not in ids]
    print(f"  pano-only boxes rejected (mesh support < {a.min_support:.0%} of footprint and < {a.min_support_points} points): "
          f"{len(rejected)}  ids {[o['id'] for o in rejected]}")
    print(f"  pano-only boxes whose evidence is all inside a confirmed object (marked duplicate_of_): {dups}")

    if pano:
        pano = dict(pano)
        pano["method"] = (pano.get("method", "") + " | fused with mesh difference "
                          "(simple-planes mesh minus defurnished mesh)")
    else:
        pano = {"model": plan.get("model"), "units": "metres", "layers": {}, "box_heights": {}}
    pano["objects"] = fused
    pano["objects_rejected"] = rejected      # kept for inspection; viewers/cutters only read "objects"
    json.dump(pano, open(os.path.join(out, "objects_fused.json"), "w"), indent=1)
    json.dump([{k: v for k, v in m.items()} for m in mesh_objs],
              open(os.path.join(out, "objects_mesh.json"), "w"), indent=1)

    # ---- per-object movable meshes + scene file
    shutil.copyfile(a.empty, os.path.join(out, "empty_room.obj"))
    cent_tri = (Vf[Ff[:, 0]] + Vf[Ff[:, 1]] + Vf[Ff[:, 2]]) / 3
    house_tri = NearSet(Pe, a.tol).near(cent_tri)          # computed once (was rebuilt per object)
    scene_objs = []
    for o in fused:
        if o.get("layer") not in ("furniture", "surface", "floor_covering"):
            continue
        b = o["box"]
        c, size, yaw = b["centre"], b["size_lwh_m"], b["yaw_deg"]
        zb, zt = floor_z + b["z_bottom"], floor_z + b["z_top"]
        ang = math.radians(yaw)
        d = cent_tri[:, :2] - np.array(c[:2])
        u = d[:, 0] * math.cos(ang) + d[:, 1] * math.sin(ang)
        v = -d[:, 0] * math.sin(ang) + d[:, 1] * math.cos(ang)
        sel = ((np.abs(u) <= size[0] / 2 + 0.04) & (np.abs(v) <= size[1] / 2 + 0.04)
               & (cent_tri[:, 2] >= zb - 0.04) & (cent_tri[:, 2] <= zt + 0.04))
        # keep only patches that are not part of the empty room
        sel &= ~house_tri
        name = f"obj_{o['id']:03d}"
        fn = os.path.join("objects", name + ".obj")
        kind = "box"
        if sel.sum() >= 4:
            used_v = np.unique(Ff[sel])
            remap = {int(g): i for i, g in enumerate(used_v)}
            Fl = np.array([[remap[int(x)] for x in t] for t in Ff[sel]])
            Vl = Vf[used_v].copy()
            Vl[:, :2] -= np.array(c[:2])               # local frame: origin at the box centre
            Vl[:, 2] -= floor_z
            write_obj(os.path.join(out, fn), Vl, Fl, name)
            kind = "surface_patches"
        else:
            Vb, Fb = box_mesh([0, 0], size, yaw, b["z_bottom"], b["z_top"])
            write_obj(os.path.join(out, fn), Vb, Fb, name)
        scene_objs.append({"id": o["id"], "file": fn.replace("\\", "/"), "kind": kind,
                           "label": o.get("label"), "layer": o["layer"], "source": o["source"],
                           "position_xy": c[:2], "floor_z": floor_z, "yaw_deg": yaw,
                           "size_lwh_m": size, "room": o.get("room")})
    json.dump({"empty_mesh": "empty_room.obj", "units": "metres", "up": "z", "floor_z": floor_z,
               "note": "object OBJ vertices are relative to position_xy (x,y) and floor_z (z); "
                       "kind=box files are already centred and yawed, surface_patches keep world orientation",
               "objects": scene_objs}, open(os.path.join(out, "scene.json"), "w"), indent=1)

    src = {}
    for o in fused:
        src[o["source"]] = src.get(o["source"], 0) + 1
    rep = {"floor_z": floor_z, "mesh_clusters": len(mesh_objs), "fused_objects": len(fused),
           "by_source": src, "evidence_points": int(len(E)), "tolerance_m": a.tol}
    json.dump(rep, open(os.path.join(out, "report.json"), "w"), indent=1)
    print("\nobjects:", src)

    if not a.no_plot:
        try:
            import matplotlib
            matplotlib.use("Agg")
            import matplotlib.pyplot as plt
            fig, ax = plt.subplots(figsize=(11, 8))
            for w in walls:
                ax.plot([w["a"][0], w["b"][0]], [w["a"][1], w["b"][1]], "k-", lw=1.5)
            ax.scatter(E[:, 0], E[:, 1], s=1, c=E[:, 2], cmap="viridis", alpha=0.5)
            colr = {"pano": "tab:blue", "pano+mesh": "tab:green", "mesh": "tab:red"}
            for o in fused:
                if o.get("layer") not in ("furniture", "surface"):
                    continue
                b = o["box"]
                k = rect_corners(b["centre"][:2], b["size_lwh_m"][:2], b["yaw_deg"])
                ax.add_patch(plt.Polygon(k, fill=False, ec=colr[o["source"]], lw=1.3))
            ax.set_aspect("equal")
            ax.set_title("black: walls | dots: mesh difference (colour = height) | "
                         "blue pano, green pano+mesh, red mesh-only")
            fig.savefig(os.path.join(out, "topdown.png"), dpi=110, bbox_inches="tight")
        except Exception as e:                                           # noqa
            print("plot skipped:", e)
    print(f"\nwritten to {out}")


if __name__ == "__main__":
    main()
