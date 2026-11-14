"""Shared helpers: build contract-shaped draft Assets with honest status fields. No prices are ever set here."""
import math
import re
import uuid
from datetime import datetime, timezone

CATEGORIES = ("counter", "prep_table", "range", "oven", "fridge", "freezer_display", "sink", "hood",
              "dish", "seating", "table", "storage", "other")
MAX_DIM_M = 10.0

# ASSUMPTION placeholders (not code citations): working clearance in metres by category. Labelled as such on every asset.
_CLEAR = {
    "counter": (0.9, 0.0, 0.0), "prep_table": (0.9, 0.3, 0.1), "range": (1.0, 0.1, 0.1), "oven": (1.0, 0.1, 0.1),
    "fridge": (0.9, 0.05, 0.05), "freezer_display": (1.0, 0.05, 0.05), "sink": (0.9, 0.1, 0.0),
    "hood": (0.0, 0.0, 0.0), "dish": (0.9, 0.1, 0.05), "seating": (0.5, 0.2, 0.0), "table": (0.6, 0.3, 0.0),
    "storage": (0.7, 0.0, 0.0), "other": (0.6, 0.1, 0.1),
}
CLEARANCE_BASIS = ("ASSUMPTION: generic working-clearance placeholder for this category, not a code citation "
                   "or manufacturer spec; confirm against local health/fire code and the equipment datasheet.")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")[:40] or "item"


def finite_pos(v) -> float | None:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) and 0 < f <= MAX_DIM_M else None


def make_asset(*, name: str, category: str, dims: tuple | None, dims_status: str, source: str, origin: str,
               notes: str, profile_id: str | None, tags=(), image_refs=(), asset_id: str | None = None) -> dict:
    cat = category if category in CATEGORIES else "other"
    w, d, h = dims if dims else (0.0, 0.0, 0.0)
    f, s, b = _CLEAR[cat]
    return {
        "assetId": asset_id or f"{source[:3]}-{slug(name)}-{uuid.uuid4().hex[:8]}",
        "name": name or "Unnamed item", "category": cat, "source": source,
        "parentAssetId": None, "variantKind": "base",
        "dims": {"w": round(w, 3), "d": round(d, 3), "h": round(h, 3)}, "dimsStatus": dims_status,
        "dimRanges": None, "allowedSizes": None,
        "footprint": [[0, 0], [round(w, 3), 0], [round(w, 3), round(d, 3)], [0, round(d, 3)], [0, 0]],
        "clearance": {"front": f, "sides": s, "back": b}, "clearanceBasis": CLEARANCE_BASIS,
        "model": {"uri": "", "format": "box"}, "imageRefs": list(image_refs), "profileId": profile_id,
        "tags": list(tags), "priceRef": None,  # never invented; link to data/financial/catalog.json by a human/other slice
        "provenance": {"origin": origin, "retrievedAt": now_iso(), "notes": notes}, "status": "draft",
    }
