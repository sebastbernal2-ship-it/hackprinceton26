#!/usr/bin/env python3
"""
export_scene_for_ui.py - convert objects.json (pano/segment pipelines) or scene.json
(mesh_furniture.py) into one small JSON the frontend tour can load.

    python modeling/export_scene_for_ui.py <objects.json|scene.json> [-o tour_scene.json]

Input frame (both formats): metres, Matterport model frame, x east, y north, z up.
Output (schema "tour_scene/1", same frame, so the frontend decides how to map to its
own axes; three.js Y-up is  x=east, y=up, z=-north):

    {
      "schema": "tour_scene/1",
      "frame": {"units": "metres", "x": "east", "y": "north", "z": "up"},
      "floor_z": <m or null>,
      "bounds": {"min": [x,y,z], "max": [x,y,z]} | null,     # axis-aligned, from box corners
      "objects": [{
          "id", "label" (null when unknown), "label_status": "estimated"|"unknown",
          "layer", "room" (label or null), "source", "confirmed",
          "centre_m": [x,y,z],            # centre of the oriented box
          "size_m": {"length","width","height"},   # length along yaw axis
          "yaw_deg": <degrees CCW about +z from +x>,
          "z_bottom_m", "z_top_m", "flags": [...]
      }]
    }

Provenance: every object here is an *estimate* from mesh differencing and/or panorama
inference. Labels that were not produced are exported as null/"unknown", never guessed.
Objects with missing or non-finite geometry are skipped and reported on stderr.
"""
import argparse
import json
import math
import sys

SCHEMA = "tour_scene/1"


def _finite(vals):
    return all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in vals)


def _room_label(r):
    if isinstance(r, dict):
        return r.get("label")
    return r if isinstance(r, str) else None


def _box_of(o, default_floor_z):
    """Return (centre[3], size[3], yaw, floor_z) or raise ValueError. Handles both input schemas."""
    if isinstance(o.get("box"), dict):                       # objects.json
        b = o["box"]
        c, s = list(b["centre"]), list(b["size_lwh_m"])
        yaw = b.get("yaw_deg", 0.0)
        floor = o.get("floor_z", default_floor_z)
    elif "position_xy" in o and "size_lwh_m" in o:           # scene.json (centre z not stored)
        floor = o.get("floor_z", default_floor_z)
        if floor is None:
            raise ValueError("no floor_z")
        s = list(o["size_lwh_m"])
        if len(s) != 3:
            raise ValueError("size_lwh_m needs 3 values")
        c = [o["position_xy"][0], o["position_xy"][1], floor + s[2] / 2.0]
        yaw = o.get("yaw_deg", 0.0)
    else:
        raise ValueError("unrecognised object schema")
    if len(c) != 3 or len(s) != 3 or not _finite(c + s + [yaw]):
        raise ValueError("non-finite or malformed geometry")
    if min(s) <= 0:
        raise ValueError("non-positive size")
    return c, s, float(yaw), floor


def convert(data):
    if not isinstance(data, dict) or not isinstance(data.get("objects"), list):
        raise ValueError("input must be an object with an 'objects' list")
    default_floor = data.get("floor_z")
    out, skipped = [], []
    lo, hi = [math.inf] * 3, [-math.inf] * 3
    for i, o in enumerate(data["objects"]):
        try:
            c, s, yaw, floor = _box_of(o, default_floor)
        except (ValueError, KeyError, TypeError, IndexError) as e:
            skipped.append((o.get("id", i) if isinstance(o, dict) else i, str(e)))
            continue
        t = math.radians(yaw)
        # half-extent of the rotated footprint on each axis
        hx = abs(math.cos(t)) * s[0] / 2 + abs(math.sin(t)) * s[1] / 2
        hy = abs(math.sin(t)) * s[0] / 2 + abs(math.cos(t)) * s[1] / 2
        mn, mx = [c[0] - hx, c[1] - hy, c[2] - s[2] / 2], [c[0] + hx, c[1] + hy, c[2] + s[2] / 2]
        lo = [min(a, b) for a, b in zip(lo, mn)]
        hi = [max(a, b) for a, b in zip(hi, mx)]
        label = o.get("label") or None
        out.append({
            "id": o.get("id", i),
            "label": label,
            "label_status": "estimated" if label else "unknown",
            "layer": o.get("layer"),
            "room": _room_label(o.get("room")),
            "source": o.get("source"),
            "confirmed": bool(o.get("confirmed", False)),
            "centre_m": [round(v, 3) for v in c],
            "size_m": {"length": round(s[0], 3), "width": round(s[1], 3), "height": round(s[2], 3)},
            "yaw_deg": round(yaw, 1),
            "z_bottom_m": round(c[2] - s[2] / 2, 3),
            "z_top_m": round(c[2] + s[2] / 2, 3),
            "flags": list(o.get("flags") or []),
        })
    scene = {
        "schema": SCHEMA,
        "frame": {"units": "metres", "x": "east", "y": "north", "z": "up"},
        "floor_z": round(float(default_floor), 3) if isinstance(default_floor, (int, float)) and math.isfinite(default_floor) else None,
        "bounds": {"min": [round(v, 3) for v in lo], "max": [round(v, 3) for v in hi]} if out else None,
        "objects": out,
    }
    return scene, skipped


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", help="objects.json or scene.json")
    ap.add_argument("-o", "--out", default="tour_scene.json")
    a = ap.parse_args(argv)
    with open(a.input) as fh:
        data = json.load(fh)
    scene, skipped = convert(data)
    with open(a.out, "w") as fh:
        json.dump(scene, fh, indent=1)
    for oid, why in skipped:
        print(f"skipped object {oid}: {why}", file=sys.stderr)
    print(f"wrote {a.out}: {len(scene['objects'])} objects, {len(skipped)} skipped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
