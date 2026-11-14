"""Convert modeling-pipeline detected furniture (objects.json) into draft Assets.

Dimensions are scan-derived boxes (box.size_lwh_m: length along yaw axis, width, height): dimsStatus 'estimated'.
A detected box is a bounding volume, not a measured product size, and its label is a detector guess.
"""
import json
from pathlib import Path

from .common import CATEGORIES, finite_pos, make_asset

# detector label keywords -> catalog category (first match wins); unknown labels -> 'other'
_KEYS = [("prep", "prep_table"), ("counter", "counter"), ("island", "counter"), ("range", "range"), ("stove", "range"),
         ("oven", "oven"), ("freezer", "freezer_display"), ("fridge", "fridge"), ("refrigerator", "fridge"),
         ("sink", "sink"), ("hood", "hood"), ("dish", "dish"), ("chair", "seating"), ("stool", "seating"),
         ("booth", "seating"), ("bench", "seating"), ("sofa", "seating"), ("table", "table"),
         ("shelf", "storage"), ("shelv", "storage"), ("cabinet", "storage"), ("rack", "storage")]


def category_for(label) -> str:
    t = (label or "").lower()
    for k, c in _KEYS:
        if k in t:
            return c
    return "other"


def assets_from_objects(data: dict, profile_id: str | None = None, scan_name: str = "scan") -> dict:
    """Return {assets, skipped:[(id, reason)]}. Skips malformed boxes instead of guessing."""
    if not isinstance(data, dict) or not isinstance(data.get("objects"), list):
        raise ValueError("input must be an object with an 'objects' list")
    out, skipped = [], []
    for i, o in enumerate(data["objects"]):
        oid = o.get("id", i) if isinstance(o, dict) else i
        try:
            size = o["box"]["size_lwh_m"]
            if len(size) != 3:
                raise ValueError("size_lwh_m needs 3 values")
            l, w, h = (finite_pos(v) for v in size)
            if None in (l, w, h):
                raise ValueError("non-positive or non-finite size")
        except (KeyError, TypeError, ValueError) as e:
            skipped.append((oid, f"bad box: {e}"))
            continue
        label = o.get("label") or None
        cat = category_for(label)
        # asset-local frame: w along yaw axis (scan length), d across; yaw itself is placement, not asset geometry
        out.append(make_asset(
            name=(label or f"Unlabelled scan object {oid}"), category=cat, dims=(l, w, h), dims_status="estimated",
            source="extracted", origin=f"scan:{scan_name}", profile_id=profile_id, tags=["scan-derived"],
            notes=(f"Scan-derived bounding box of detected object {oid} (detector label: {label!r}, "
                   f"source: {o.get('source')}). Estimated from reconstruction, not measured; "
                   "label is a detector guess; confirm on site.")))
    return {"assets": out, "skipped": skipped}


def load_objects_file(path: str | Path, profile_id: str | None = None) -> dict:
    p = Path(path)
    return assets_from_objects(json.loads(p.read_text()), profile_id, scan_name=p.parent.name)
