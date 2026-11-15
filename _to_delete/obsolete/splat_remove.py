#!/usr/bin/env python3
"""
splat_remove.py - Cut furniture out of a Gaussian splat using the boxes from pano_pipeline.py
(or the objects.json you exported from planner.html after editing).

  python Code\\splat_remove.py interior_splat.ply pano_zvKHR9DHNjJ\\objects.json --out emptied

Writes:
  empty_room.ply          the splat with every selected object's Gaussians removed (structure only)
  removed.ply             everything that was cut out
  objects/obj_###_<label>.ply   one splat per object - its Gaussians, ready to move or re-place
  report.json             Gaussians removed per object, and objects that caught nothing (box misplaced?)

The splat must be in the Matterport model frame (z up, metres) - e.g. trained from the panoramas with
the poses pano_pipeline.py calibrates, or a MatterPak-aligned splat. The hackathon's exterior drone
splat is in its own local frame and will not line up.

Boxes are deliberately generous (--pad): for emptying a room, cutting a little air costs nothing,
missing the edge of a sofa leaves a floating fragment. Furniture boxes stop just above the floor
(--keep-floor) so the floor survives; rugs are cut down to the floor itself.
Gaussians behind or under furniture were never photographed, so expect holes there; the defurnished
panoramas are the natural source to fill them later.

Deps: numpy
"""
import argparse, json, os, re, sys
from pathlib import Path

import numpy as np

T = {"char": "i1", "uchar": "u1", "short": "i2", "ushort": "u2", "int": "i4", "uint": "u4", "float": "f4",
     "double": "f8", "int8": "i1", "uint8": "u1", "int16": "i2", "uint16": "u2", "int32": "i4", "uint32": "u4",
     "float32": "f4", "float64": "f8"}
ALL_LAYERS = ["floor_covering", "furniture", "surface", "wall", "ceiling"]


def read_header(path):
    with open(path, "rb") as f:
        lines, props, n, fmt, other = [], [], None, None, False
        while True:
            raw = f.readline()
            if not raw:
                sys.exit("bad ply header")
            lines.append(raw)
            t = raw.decode("ascii", "ignore").split()
            if t[:1] == ["format"]:
                fmt = t[1]
            elif t[:1] == ["element"]:
                if t[1] == "vertex":
                    n = int(t[2])
                else:
                    other = True
            elif t[:1] == ["property"] and n is not None and not other:
                if t[1] == "list":
                    sys.exit("list properties in the vertex element are not supported")
                props.append((t[2], "<" + T[t[1]]))
            elif t[:1] == ["end_header"]:
                break
        off = f.tell()
    if fmt != "binary_little_endian":
        sys.exit(f"unsupported ply format {fmt}; convert to binary_little_endian")
    if other:
        print("note: extra PLY elements after the vertices are dropped from the outputs")
    dt = np.dtype(props)
    n = min(n, (os.path.getsize(path) - off) // dt.itemsize)
    return b"".join(lines), dt, n, off


def write_ply(path, header, records):
    hdr = re.sub(rb"element vertex \d+", b"element vertex %d" % len(records), header)
    with open(path, "wb") as f:
        f.write(hdr)
        f.write(records.tobytes())


def box_for(o, a):
    """World-frame oriented box (cx, cy, half_l, half_w, yaw, z0, z1) with padding and floor rules."""
    b, fz, layer = o["box"], float(o.get("floor_z") or 0.0), o.get("layer") or ("wall" if o.get("on_floor") is False else "furniture")
    pad = a.pad
    zb, zt = float(b["z_bottom"]), float(b["z_top"])
    if layer == "floor_covering":
        z0 = -0.03                                   # rugs: cut down to the floor surface itself
    elif layer == "furniture":
        z0 = max(zb, a.keep_floor)                   # keep the floor under furniture
    else:
        z0 = zb - pad                                # wall art, surface items, fixtures float: pad all round
    z1 = zt + a.pad_top
    L, W = b["size_lwh_m"][:2]
    cx, cy, t = float(b["centre"][0]), float(b["centre"][1]), np.radians(float(b["yaw_deg"]))
    cam = (o.get("primary_view") or {}).get("pano_xy")
    if o.get("confirmed") is False and cam and layer in ("furniture", "floor_covering") and a.grow_tentative > 0:
        # one camera saw only the near side: push the far side back along the box axis facing away from it
        u, v = np.array([np.cos(t), np.sin(t)]), np.array([-np.sin(t), np.cos(t)])
        away = np.array([cx, cy]) - np.array(cam)
        ax_, ext = (u, "L") if abs(away @ u) > abs(away @ v) else (v, "W")
        sgn = 1.0 if away @ ax_ >= 0 else -1.0
        cx, cy = cx + sgn * ax_[0] * a.grow_tentative / 2, cy + sgn * ax_[1] * a.grow_tentative / 2
        L, W = (L + a.grow_tentative, W) if ext == "L" else (L, W + a.grow_tentative)
    return (cx, cy, L / 2 + pad, W / 2 + pad, t, fz + z0, fz + z1, layer)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("splat", help="3DGS .ply (or any binary point .ply) in the Matterport model frame")
    ap.add_argument("objects", help="objects.json from pano_pipeline.py or exported from planner.html")
    ap.add_argument("--out", default="emptied")
    ap.add_argument("--pad", type=float, default=0.15, help="metres added around each box (default 0.15)")
    ap.add_argument("--grow-tentative", type=float, default=0.8,
                    help="objects seen from one pano: extend the unseen back side this far away from the camera")
    ap.add_argument("--pad-top", type=float, default=0.08, help="metres added above each box")
    ap.add_argument("--keep-floor", type=float, default=0.03, help="furniture boxes start this far above the floor")
    ap.add_argument("--layers", default=",".join(ALL_LAYERS), help=f"comma list from {ALL_LAYERS}")
    ap.add_argument("--confirmed-only", action="store_true", help="skip objects seen from only one pano")
    ap.add_argument("--chunk", type=int, default=2_000_000)
    a = ap.parse_args()

    doc = json.load(open(a.objects))
    want = set(a.layers.split(","))
    objs = []
    for o in doc["objects"]:
        bx = box_for(o, a)
        if bx[-1] in want and not (a.confirmed_only and o.get("confirmed") is False):
            objs.append((o, bx))
    print(f"{len(objs)} of {len(doc['objects'])} objects selected (layers: {','.join(sorted(want))})")

    header, dt, n, off = read_header(a.splat)
    g = np.memmap(a.splat, dtype=dt, mode="r", offset=off, shape=(n,))
    print(f"{n:,} Gaussians in {a.splat}")

    owner = np.full(n, -1, np.int32)                 # which object each Gaussian belongs to (first box wins)
    for s in range(0, n, a.chunk):
        e = min(n, s + a.chunk)
        x = np.asarray(g["x"][s:e], np.float64); y = np.asarray(g["y"][s:e], np.float64); z = np.asarray(g["z"][s:e], np.float64)
        own = owner[s:e]
        for k, (o, (cx, cy, hl, hw, t, z0, z1, _)) in enumerate(objs):
            dx, dy = x - cx, y - cy
            lx = np.cos(t) * dx + np.sin(t) * dy
            ly = -np.sin(t) * dx + np.cos(t) * dy
            inside = (np.abs(lx) <= hl) & (np.abs(ly) <= hw) & (z >= z0) & (z <= z1) & (own < 0)
            own[inside] = k

    out = Path(a.out); (out / "objects").mkdir(parents=True, exist_ok=True)
    keep = owner < 0
    write_ply(out / "empty_room.ply", header, np.asarray(g[keep]))
    write_ply(out / "removed.ply", header, np.asarray(g[~keep]))
    counts = np.bincount(owner[~keep], minlength=len(objs)) if (~keep).any() else np.zeros(len(objs), int)
    report = []
    for k, (o, bx) in enumerate(objs):
        label = re.sub(r"[^a-z0-9]+", "_", (o.get("label") or "object").lower()).strip("_")
        if counts[k]:
            write_ply(out / "objects" / f"obj_{o['id']:03d}_{label}.ply", header, np.asarray(g[owner == k]))
        report.append({"id": o["id"], "label": o.get("label"), "layer": bx[-1], "gaussians": int(counts[k])})
    empty = [r for r in report if r["gaussians"] == 0]
    json.dump({"splat": str(a.splat), "gaussians_total": int(n), "gaussians_removed": int((~keep).sum()),
               "pad_m": a.pad, "keep_floor_m": a.keep_floor, "objects": report,
               "caught_nothing": [r["id"] for r in empty]}, open(out / "report.json", "w"), indent=1)
    print(f"removed {(~keep).sum():,} Gaussians ({(~keep).mean():.1%}) -> {out}/empty_room.ply, removed.ply, objects/")
    if empty:
        print(f"{len(empty)} boxes caught no Gaussians (ids {[r['id'] for r in empty][:15]}): misplaced, or the splat "
              "is not in the Matterport frame")


if __name__ == "__main__":
    main()
