"""Deterministic layout/architectural-inefficiency findings from a Matterport plan.json.

plan.json (modeling/pano_pipeline.py build_plan): rooms[{id,label,polygon[[x,y],..],area_m2,height_m}], walls[...].
Every threshold below is an ASSUMPTION (rule of thumb for a restaurant), not a code requirement or sourced
standard. The same rules apply to every site. Findings are layout observations, not confirmed defects.
"""
import math
from .schema import coerce_finding

# name: (value, unit, rationale) -- all assumptions, adjustable
T = {
    "min_kitchen_width_m": (2.4, "m", "ASSUMPTION: a cook line plus a ~1 m aisle needs roughly >=2.4 m clear width"),
    "min_hood_clearance_m": (2.7, "m", "ASSUMPTION: commercial hood plus clearance typically wants >=2.7 m ceiling; local code governs"),
    "min_prep_to_dining_ratio": (0.20, "ratio", "ASSUMPTION: back-of-house (kitchen/prep) below ~20% of dining area is often cramped"),
    "max_aspect_ratio": (4.0, "ratio", "ASSUMPTION: rooms longer than 4:1 (oriented bbox) are awkward to lay out and serve"),
    "min_convexity": (0.75, "ratio", "ASSUMPTION: polygon area / convex hull area below 0.75 indicates an L/odd shape"),
}
KITCHEN_WORDS = ("kitchen", "prep", "back of house", "bar")
DINING_WORDS = ("dining", "restaurant", "seating", "lounge", "main", "front")


def _area(poly):
    return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]))) / 2


def _hull(pts):
    pts = sorted(set(map(tuple, pts)))
    if len(pts) < 3:
        return pts
    def cross(o, a, b): return (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0])
    lo, up = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0: lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0: up.pop()
        up.append(p)
    return lo[:-1] + up[:-1]


def _min_bbox(poly):
    """(long, short) side of the minimum-area oriented bounding box, via edge-aligned rotation."""
    best = None
    h = _hull(poly)
    for (x1, y1), (x2, y2) in zip(h, h[1:] + h[:1]):
        a = math.atan2(y2 - y1, x2 - x1); c, s = math.cos(-a), math.sin(-a)
        xs = [px * c - py * s for px, py in h]; ys = [px * s + py * c for px, py in h]
        w, d = max(xs) - min(xs), max(ys) - min(ys)
        if best is None or w * d < best[0]:
            best = (w * d, max(w, d), min(w, d))
    return (best[1], best[2]) if best else (0.0, 0.0)


def _has(label, words):
    return any(w in (label or "").lower() for w in words)


def _find(rid, cat, title, desc, rule, conf, step, sev="unknown"):
    t = {"title": title, "category": cat, "description": f"{desc} Rule: {rule}", "severity": sev,
         "modelConfidence": conf, "canConfirmFromImagery": False, "verificationStep": step}
    return t, rid


def geometry_findings(plan: dict, ref: str = "plan.json") -> list[dict]:
    raw, rooms = [], [r for r in plan.get("rooms", []) if r.get("polygon") and len(r["polygon"]) >= 3]
    for r in rooms:
        poly, label = r["polygon"], r.get("label") or r["id"]
        area = r.get("area_m2") or _area(poly)
        long_s, short_s = _min_bbox(poly)
        hull_a = _area(_hull(poly)) or 1e-9
        convex = _area(poly) / hull_a
        if _has(label, KITCHEN_WORDS[:2]):
            v, _, why = T["min_kitchen_width_m"]
            if 0 < short_s < v:
                raw.append(_find(r["id"], "layout_inefficiency", f"Narrow {label} ({short_s:.1f} m wide)",
                    f"Minimum width {short_s:.2f} m is below {v} m for a cook line with an aisle.",
                    f"min_kitchen_width_m={v}. {why}", 0.6,
                    "Measure on site; test a representative equipment layout against clearances and local code."))
            v, _, why = T["min_hood_clearance_m"]
            h = r.get("height_m")
            if h and h < v:
                raw.append(_find(r["id"], "kitchen_infrastructure", f"Low ceiling in {label} ({h:.2f} m) for hood",
                    f"Ceiling {h:.2f} m is below {v} m assumed for hood clearance.",
                    f"min_hood_clearance_m={v}. {why}", 0.6,
                    "Measure true ceiling height (Matterport height can be off); ask a hood vendor/AHJ for clearance requirements."))
        if short_s > 0 and long_s / short_s > T["max_aspect_ratio"][0] and area >= 4:
            v, _, why = T["max_aspect_ratio"]
            raw.append(_find(r["id"], "layout_inefficiency", f"Long narrow {label} ({long_s:.1f} x {short_s:.1f} m)",
                f"Aspect ratio {long_s / short_s:.1f}:1 creates a long dead-end path.",
                f"max_aspect_ratio={v}. {why}", 0.5, "Walk the space with a service-flow sketch; check turning and aisle widths."))
        if convex < T["min_convexity"][0] and area >= 6:
            v, _, why = T["min_convexity"]
            raw.append(_find(r["id"], "layout_inefficiency", f"Irregular shape in {label}",
                f"Area/convex-hull ratio {convex:.2f} suggests an L-shape or notches that waste usable floor.",
                f"min_convexity={v}. {why}", 0.5, "Confirm the shape on site and whether notches are usable."))
    kit = sum((r.get("area_m2") or _area(r["polygon"])) for r in rooms if _has(r.get("label"), KITCHEN_WORDS[:2]))
    din = sum((r.get("area_m2") or _area(r["polygon"])) for r in rooms if _has(r.get("label"), DINING_WORDS))
    v, _, why = T["min_prep_to_dining_ratio"]
    if kit > 0 and din > 0 and kit / din < v:
        raw.append(_find(None, "layout_inefficiency", f"Small prep/kitchen vs dining area ({kit / din:.0%})",
            f"Kitchen/prep {kit:.0f} m2 vs dining {din:.0f} m2.", f"min_prep_to_dining_ratio={v}. {why}", 0.5,
            "Confirm room labels and measured areas on site; judge against the intended menu and seat count."))
    return [f for i, (t, rid) in enumerate(raw, 1)
            if (f := coerce_finding(t, f"geo-{i}", "floorplan_geometry", ref, rid))]
