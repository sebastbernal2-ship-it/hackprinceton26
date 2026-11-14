"""Expansion optionality from a Matterport-derived plan.json (rooms with polygons, walls with thickness) + growth timeline.

Wall thickness is a load-bearing HINT only (assumption thresholds). Nothing here is a structural determination.
"""
from __future__ import annotations

import math

M2_TO_SQFT = 10.7639
THICK_M, THIN_M = 0.20, 0.13  # assumption thresholds; plan.json default for unmeasured walls is 0.12
NOTICE = ("Scenario analysis, not a forecast. Wall thickness is a hint, not a structural determination: only a structural "
          "engineer can say whether a wall is load-bearing or may be opened. CoStar signals are same-property facts only.")


def _seg_overlap(p, q, r, s, tol=0.3):
    dx, dy = q[0] - p[0], q[1] - p[1]
    L = math.hypot(dx, dy)
    if L < 1e-6:
        return 0.0, None
    ux, uy = dx / L, dy / L

    def off(a):  # perpendicular distance from line pq
        return abs((a[0] - p[0]) * uy - (a[1] - p[1]) * ux)

    if off(r) > tol or off(s) > tol:
        return 0.0, None
    t1, t2 = sorted(((r[0] - p[0]) * ux + (r[1] - p[1]) * uy, (s[0] - p[0]) * ux + (s[1] - p[1]) * uy))
    lo, hi = max(0.0, t1), min(L, t2)
    if hi - lo <= 0:
        return 0.0, None
    m = (lo + hi) / 2
    return hi - lo, (p[0] + ux * m, p[1] + uy * m)


def _pt_seg(pt, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    L2 = dx * dx + dy * dy
    t = 0 if L2 == 0 else max(0, min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / L2))
    return math.hypot(pt[0] - (a[0] + t * dx), pt[1] - (a[1] + t * dy))


def _area(poly):
    n = len(poly)
    return abs(sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n))) / 2


def wall_hint(thickness):
    if thickness is None:
        return {"hint": "unknown", "text": "wall thickness not measured"}
    if thickness >= THICK_M:
        return {"hint": "thick", "text": "thick wall: could be structural or masonry; treat as possibly load-bearing"}
    if thickness <= THIN_M:
        return {"hint": "thin", "text": "thin wall: more likely a partition, not confirmed"}
    return {"hint": "intermediate", "text": "intermediate thickness: no hint"}


def adjacency(plan: dict, tol=0.3, min_shared=0.3) -> dict:
    rooms = {r["id"]: r for r in plan.get("rooms", []) if r.get("polygon")}
    walls = [w for w in plan.get("walls", []) if w.get("physical", True)]
    edges = {}
    ids = list(rooms)
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            if rooms[a].get("floor") != rooms[b].get("floor"):
                continue
            pa, pb = rooms[a]["polygon"], rooms[b]["polygon"]
            shared, mids = 0.0, []
            for k in range(len(pa)):
                p, q = pa[k], pa[(k + 1) % len(pa)]
                for j in range(len(pb)):
                    r, s = pb[j], pb[(j + 1) % len(pb)]
                    ln, mid = _seg_overlap(p, q, r, s, tol)
                    if ln >= min_shared:
                        shared += ln
                        mids.append(mid)
            if shared >= min_shared:
                ths = []
                for m in mids:
                    ths += [w.get("thickness") for w in walls if _pt_seg(m, w["a"], w["b"]) <= tol]
                th = max((t for t in ths if t), default=None)
                edges[(a, b)] = {"a": a, "b": b, "sharedWallLengthM": round(shared, 2), "wallThicknessM": th, **wall_hint(th),
                                 "hintStatus": "estimated (thickness hint only, assumption thresholds %.2f/%.2f m)" % (THICK_M, THIN_M)}
    return {"rooms": {k: {"label": v.get("label"), "areaM2": round(v.get("area_m2") or _area(v["polygon"]), 2)} for k, v in rooms.items()},
            "edges": list(edges.values())}


def candidates(plan: dict, base_ids: list, signals: dict | None = None, tol=0.3) -> dict:
    g = adjacency(plan, tol)
    base = set(base_ids)
    unknown = sorted(b for b in base if b not in g["rooms"])
    cands = {}
    for e in g["edges"]:
        if (e["a"] in base) != (e["b"] in base):
            other = e["b"] if e["a"] in base else e["a"]
            c = cands.setdefault(other, {"roomId": other, "label": g["rooms"][other]["label"], "areaM2": g["rooms"][other]["areaM2"],
                                         "areaSqFtGained": round(g["rooms"][other]["areaM2"] * M2_TO_SQFT, 1), "sharedWalls": []})
            c["sharedWalls"].append({k: e[k] for k in ("sharedWallLengthM", "wallThicknessM", "hint", "text")})
    out = []
    for c in cands.values():
        hints = {w["hint"] for w in c["sharedWalls"]}
        c["openingDifficultyHint"] = ("possible structural wall: engineer review before opening" if "thick" in hints else
                                      "thickness unknown: verify" if "unknown" in hints else "likely partition (hint only)")
        c["verifyWithEngineer"] = ["Is the shared wall load-bearing / shear wall? Header or beam needed for an opening?",
                                   "Egress, occupant load and fire separation change when merging spaces",
                                   "Permit scope for demolition / change of use"]
        c["coStarSignals"] = signals or {"status": "unknown"}
        out.append(c)
    out.sort(key=lambda c: -c["areaSqFtGained"])
    return {"baseRoomIds": sorted(base), "unknownBaseRoomIds": unknown, "candidates": out,
            "baseAreaSqFt": round(sum(g["rooms"][b]["areaM2"] for b in base if b in g["rooms"]) * M2_TO_SQFT, 1), "graph": g, "notice": NOTICE}


def co_star_signals(p: dict | None) -> dict:
    """Same-property CoStar facts. Lease expiry dates are sparse; reported as counts, never inferred."""
    if not p:
        return {"status": "unknown", "reason": "no property snapshot"}
    s = p.get("sameProperty") or {}
    o = s.get("occupancies")
    return {"status": "observed" if o is not None else "unknown", "occupancyRecordsSameProperty": o,
            "withExpiryDate": s.get("withToDate"), "latestExpiryYear": s.get("latestToDateYear"),
            "note": "Expiry dates are mostly unknown in the kit; absence of a date is not evidence a space is unavailable."}


PHASES = [
    {"id": "open", "label": "Open (core kitchen)", "monthOffset": 0, "items": ["__all_equipment__"]},
    {"id": "seating", "label": "Add seating", "monthOffset": 6, "items": []},
    {"id": "second_line", "label": "Add second kitchen line", "monthOffset": 12,
     "items": ["equip:range_6_burner", "equip:type_i_hood", "equip:reach_in_refrigerator", "equip:hand_sink"]},
    {"id": "expand", "label": "Expand into adjacent space", "monthOffset": 18, "items": []},
]
VERIFY = {
    "open": ["Change-of-use / certificate of occupancy for restaurant", "Grease interceptor sizing and hood make-up air (mechanical engineer)"],
    "seating": ["Occupant load and egress width (code official)", "Restroom fixture count", "Accessibility path of travel"],
    "second_line": ["Hood/exhaust capacity and fire suppression extension", "Gas and electrical service capacity",
                    "Floor loading for equipment (structural engineer)"],
    "expand": ["Shared wall: load-bearing or not; header/beam design (structural engineer)", "Permit for demolition and opening",
               "Fire separation, egress and sprinkler coverage across the joined space",
               "Lease: expansion option / ROFO terms (CoStar leaseDeal fields mostly unfilled)"],
}


def timeline(lines: list[dict], expansion: dict | None = None, phases: list[dict] | None = None) -> dict:
    """Step a business through phases; capex from planning/financials lines. Missing cost = unknown, excluded, never 0."""
    by = {l["itemId"]: l for l in lines}
    one = [l for l in lines if l["basis"] == "one_time"]
    cum = {"low": 0.0, "expected": 0.0, "high": 0.0}
    out, any_unknown = [], False
    for ph in phases or PHASES:
        if ph["items"] == ["__all_equipment__"]:
            chosen = [l for l in one if l["category"] in ("equipment", "buildout")]
        else:
            chosen = [by[i] for i in ph["items"] if i in by]
        known = [l for l in chosen if l["expected"] is not None]
        unk = [l["itemId"] for l in chosen if l["expected"] is None]
        prorated = None
        if ph["id"] == "second_line" and known:  # install allowance pro-rated by equipment share (assumption)
            eq_all = sum(l["expected"] for l in one if l["category"] == "equipment" and l["expected"] is not None)
            ia = by.get("equipment_install_allowance")
            if ia and ia["expected"] is not None and eq_all:
                f = sum(l["expected"] for l in known) / eq_all
                prorated = {k: ia[k] * f for k in ("low", "expected", "high")}
        cap = {k: round(sum(l[k] for l in known) + (prorated[k] if prorated else 0), 2) if known else None for k in cum}
        if known:
            for k in cum:
                cum[k] += cap[k]
        elif ph["id"] in ("seating", "expand"):
            unk.append("no cost line in financials for " + ph["id"])
        any_unknown = any_unknown or bool(unk)
        row = {"phase": ph["id"], "label": ph["label"], "monthOffset": ph["monthOffset"], "monthOffsetStatus": "assumption (adjustable)",
               "capex": cap, "capexNote": "install allowance pro-rated by equipment share (assumption)" if prorated else None,
               "unknownCostItems": unk, "cumulativeCapexKnown": {k: round(v, 2) for k, v in cum.items()},
               "verifyWithEngineer": VERIFY.get(ph["id"], [])}
        if ph["id"] == "expand":
            top = (expansion or {}).get("candidates") or []
            row["expansionCandidate"] = top[0] if top else "no adjacent candidate computed"
        out.append(row)
    return {"phases": out, "cumulativeStatus": "partial: unknown cost items excluded, not zero" if any_unknown else "complete",
            "label": "scenario analysis, not a forecast", "notice": NOTICE}
