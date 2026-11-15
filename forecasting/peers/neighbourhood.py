"""'Successful businesses nearby, direct competitors apart': a transparent neighbourhood context index.

NOT a fit score and NOT a forecast. It is a hand-specified, documented scoring rule over observed CoStar tenancy records near a site.
Every threshold below is an ASSUMPTION of the team (see CONFIG and docs/models/neighbourhood-index.md); none was estimated from the data,
because the kit is far too sparse to fit distance effects. Sensitivity to the thresholds is computed with every result.

Logic
  * Classify each nearby food business against the target concept: direct competitor (same kind), partial substitute, complement.
    Non-food tenants (retail, health, offices ...) are 'general draw' businesses.
  * Agglomeration (A, 0-1): successful NON-competing businesses nearby (open >= 2 years, or ended >= 3 years without a closure label), counted
    with band weights 0.25/0.5/1 mi and a draw factor (industry x employees), plus their median tenure and 2-year survival.
  * Competition pressure (C, 0-1): open direct competitors with an explicit distance-decay penalty: full penalty when adjacent (<= 150 m),
    decaying to ~0 by 1 mile. A competitor in the 0.5-3 mi region is not penalised.
  * Market validation (V, 0-1): direct competitors that are open >= 2 years in the 0.5-3 mi region. Evidence that the concept sells here
    and a benchmark for performance, never a penalty.
  * index = 50 + 100*(w_A*(A-0.5) + w_C*((1-C)-0.5) + w_V*V), clipped to 0-100; 50 is neutral. Validation is a one-sided bonus and a component with
    no data contributes 0 points (unknown is not negative). The index is None when the kit holds nothing within 1 mile.
"""
from __future__ import annotations

import copy
import math
from datetime import date

from forecasting.peers import kinds
from forecasting.peers.data import haversine_miles

M_PER_MI = 1609.344

CONFIG = {
    "adjacent_m": 150.0,  # 'right next to us'. Kit coordinates are building points, so same-building competitors have distance 0.
    "bands_mi": (0.25, 0.5, 1.0),
    "region_mi": 3.0,  # direct competitors up to here are informative
    # Competition penalty vs distance (metres -> weight 0..1), piecewise linear. Full strength when adjacent, ~0 by 1 mile.
    "penalty_knots_m": ((0.0, 1.0), (150.0, 1.0), (400.0, 0.4), (805.0, 0.1), (1609.0, 0.0)),
    # Information value of a competitor's survival as market validation (metres -> weight): none when adjacent, full from 0.5 mi to the region edge.
    "validation_knots_m": ((0.0, 0.0), (150.0, 0.0), (805.0, 1.0), (4828.0, 1.0), (6437.0, 0.0)),
    "partial_penalty_factor": 0.5,  # a partial substitute (similarity 0.4-0.75) counts at half
    "band_weight": {0.25: 1.0, 0.5: 0.6, 1.0: 0.3},  # agglomeration weights per band (inner bands count more)
    "success_open_years": 2.0,  # open at least this long = a business that has survived the usual first-years failure window
    "success_ended_years": 3.0,  # or ended without a closure label after at least this long
    "count_saturation": 8.0,  # weighted draw units at which S_count reaches 1-e^-1 = 0.63
    "tenure_cap_years": 5.0,
    "min_seasoned_for_survival": 5,
    "validation_saturation": 2.0,  # weighted validating competitors at which V reaches 0.63
    "competition_saturation": 1.0,  # weighted competitor penalty at which C reaches 0.63
    "weights": {"agglomeration": 0.45, "validation": 0.25, "competition": 0.30},  # A / V / (1-C)
    "agglomeration_parts": {"count": 0.5, "tenure": 0.25, "survival": 0.25},
    "crowded_within_mi": 0.5, "crowded_min_count": 3,  # extra warning: 3+ direct competitors inside half a mile
    # Draw of a non-food tenant (daytime visitors) by CoStar industry type; unknown industries 0.3. ASSUMPTION values.
    "industry_draw": {6: 1.0, 13: 0.8, 15: 0.7, 20: 0.8, 21: 0.6, 7: 0.5, 9: 0.5, 12: 0.4, 4: 0.3, 16: 0.3, 1: 0.3, 18: 0.3, 17: 0.9},
    "default_draw": 0.3,
    "draw_employees_cap": 50,  # employees at which the size factor saturates; unknown employees use 0.5
}

SOURCES = ("Assumptions, not estimates. The cumulative-attraction idea (compatible stores close together raise trade; Nelson, 'The Selection of Retail "
           "Locations', 1958) and the intuition that a same-kind competitor at the door splits the same demand are the only grounding; the 150 m "
           "adjacency, the decay knots, the 0.25/0.5/1 mi bands and the 3 mi region are team-chosen thresholds. Nothing here was fitted to the kit.")


def interp(knots, x: float) -> float:
    if x <= knots[0][0]:
        return knots[0][1]
    for (x0, y0), (x1, y1) in zip(knots, knots[1:]):
        if x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0) if x1 > x0 else y1
    return knots[-1][1]


def bearing_deg(la1, lo1, la2, lo2) -> float:
    p1, p2, dl = math.radians(la1), math.radians(la2), math.radians(lo2 - lo1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0


def _outcome(etype: int) -> str:
    return {0: "open", 1: "closed", 2: "moved"}[etype]


def _success(etype: int, years: float, cfg: dict) -> bool:
    return (etype == 0 and years >= cfg["success_open_years"]) or (etype == 2 and years >= cfg["success_ended_years"])


def _draw(industry, employees, cfg: dict) -> float:
    base = cfg["industry_draw"].get(industry, cfg["default_draw"])
    size = 0.5 if employees is None else min(1.0, math.log1p(max(employees, 0)) / math.log1p(cfg["draw_employees_cap"]))
    return base * (0.25 + 0.75 * size)  # a tenant with no staff still counts a little


def score(site: dict, food: list[dict], others: list[dict], config: dict | None = None, max_listed: int = 60) -> dict:
    """site: {lat, lon, market, concept}. food: peer-pool spells (kit, anonymised, with lat/lon/kind/etype/years). others: non-food tenancies
    {lat, lon, industry, etype, years, employees, id}. Returns the labelled index, components, drivers, bands, warnings and the nearby list."""
    cfg = config or CONFIG
    concept = site.get("concept") or "cafe"
    lat, lon = site["lat"], site["lon"]
    region = cfg["region_mi"]
    nearby, kit_places = [], set()

    def near(rows, kind_of):
        for s in rows:
            if s.get("lat") is None or s.get("lon") is None:
                continue
            if site.get("market") and s.get("market") and s["market"] != site["market"]:
                continue
            d = haversine_miles(lat, lon, s["lat"], s["lon"])
            if d <= region:
                yield s, d, kind_of(s)

    for s, d, kind in near(food, lambda s: s["kind"]):
        rel = kinds.relation(concept, kind)
        nearby.append({"id": s["id"], "type": "food", "distanceMi": d, "kind": kind, "relation": rel, "etype": s["etype"], "years": s["years"],
                       "bearingDeg": bearing_deg(lat, lon, s["lat"], s["lon"]), "demo": bool(s.get("demo")), "propertyId": s.get("propertyId")})
        kit_places.add(s.get("propertyId"))
    for s, d, _ in near(others, lambda s: None):
        nearby.append({"id": s["id"], "type": "other", "distanceMi": d, "industry": s.get("industry"), "etype": s["etype"], "years": s["years"],
                       "employees": s.get("employees"), "relation": "general", "propertyId": s.get("propertyId")})
        kit_places.add(s.get("propertyId"))
    within1 = [n for n in nearby if n["distanceMi"] <= 1.0]
    coverage = {"kitBuildingsWithin1mi": len({n["propertyId"] for n in within1 if n.get("propertyId") is not None}),
                "tenanciesWithin1mi": len(within1), "foodSpellsWithin1mi": sum(1 for n in within1 if n["type"] == "food"),
                "foodSpellsWithinRegion": sum(1 for n in nearby if n["type"] == "food"),
                "note": "Kit buildings are the Matterport property list only: every count is a lower bound; absence is unknown, not zero."}

    # ---- competition (open direct/partial competitors with distance-decay penalty)
    comp_rows, pen_sum = [], 0.0
    valid_sum, valid_n = 0.0, 0
    for n in nearby:
        if n["type"] != "food" or n["relation"] == "complement" or n["etype"] != 0:
            continue
        dm = n["distanceMi"] * M_PER_MI
        f = 1.0 if n["relation"] == "direct" else cfg["partial_penalty_factor"]
        pen = f * interp(cfg["penalty_knots_m"], dm)
        pen_sum += pen
        comp_rows.append((n, pen))
        if n["relation"] == "direct" and n["years"] >= cfg["success_open_years"]:
            valid_sum += interp(cfg["validation_knots_m"], dm)
            valid_n += 1
    C = 1.0 - math.exp(-pen_sum / cfg["competition_saturation"])
    V = 1.0 - math.exp(-valid_sum / cfg["validation_saturation"])
    direct_open = [n for n, _ in comp_rows if n["relation"] == "direct"]
    adjacent = [n for n in direct_open if n["distanceMi"] * M_PER_MI <= cfg["adjacent_m"]]
    crowded = [n for n in direct_open if n["distanceMi"] <= cfg["crowded_within_mi"]]

    # ---- agglomeration: successful non-competing businesses
    bands = cfg["bands_mi"]
    wsum, succ_tenures, succ_n = 0.0, [], 0
    seasoned = survived = 0
    for n in nearby:
        competing = n["type"] == "food" and n["relation"] in ("direct", "partial")
        if competing or n["distanceMi"] > bands[-1]:
            continue
        # survival to 2 years among tenancies that have had 2 years to show it (fully observed, no censoring)
        if n["years"] >= cfg["success_open_years"] or n["etype"] != 0:
            seasoned += 1
            survived += n["years"] >= cfg["success_open_years"]
        if not _success(n["etype"], n["years"], cfg):
            continue
        band = next(b for b in bands if n["distanceMi"] <= b)
        d = _draw(n.get("industry", 17), n.get("employees"), cfg)
        wsum += cfg["band_weight"][band] * d
        succ_n += 1
        if n["distanceMi"] <= 0.5:
            succ_tenures.append(n["years"])
    parts, pw = {}, cfg["agglomeration_parts"]
    if coverage["tenanciesWithin1mi"]:
        parts["count"] = 1.0 - math.exp(-wsum / cfg["count_saturation"])
        if succ_tenures:
            succ_tenures.sort()
            parts["tenure"] = min(1.0, succ_tenures[len(succ_tenures) // 2] / cfg["tenure_cap_years"])
        if seasoned >= cfg["min_seasoned_for_survival"]:
            parts["survival"] = survived / seasoned
    A = sum(pw[k] * v for k, v in parts.items()) / sum(pw[k] for k in parts) if parts else None

    w = cfg["weights"]
    covered = bool(coverage["tenanciesWithin1mi"])
    # points above/below a neutral 50: agglomeration and competition are centred on 0.5, validation is a one-sided bonus (absent = 0, never negative)
    pts = {}
    if A is not None:
        pts["agglomeration"] = 100.0 * w["agglomeration"] * (A - 0.5)
    if covered:
        pts["competition"] = 100.0 * w["competition"] * ((1.0 - C) - 0.5)
    if coverage["foodSpellsWithinRegion"]:
        pts["validation"] = 100.0 * w["validation"] * V
    index = None if not covered else max(0.0, min(100.0, 50.0 + sum(pts.values())))

    drivers = []
    if "agglomeration" in pts:
        drivers.append({"name": "Successful non-competing businesses nearby", "points": round(pts["agglomeration"], 1),
                        "detail": f"{succ_n} open >= {cfg['success_open_years']:g} y (or ended >= {cfg['success_ended_years']:g} y) within {bands[-1]:g} mi; "
                                  f"draw-weighted {wsum:.1f}" + (f"; median tenure within 0.5 mi {succ_tenures[len(succ_tenures)//2]:.1f} y" if succ_tenures else "")
                                  + (f"; 2-year survival {survived}/{seasoned}" if "survival" in parts else ""),
                        "status": "derived from observed CoStar tenancies (lower bound)", "parts": {k: round(v, 3) for k, v in parts.items()}})
    if "competition" in pts:
        nearest = min((n["distanceMi"] for n in direct_open), default=None)
        drivers.append({"name": "Direct-competitor pressure", "points": round(pts["competition"], 1),
                        "detail": (f"{len(direct_open)} open direct competitors within {region:g} mi; nearest {nearest * M_PER_MI:,.0f} m; "
                                   f"{len(adjacent)} adjacent (<= {cfg['adjacent_m']:g} m)" if direct_open else
                                   "no open direct competitor within the region in the kit (kit lower bound)"),
                        "status": "derived from observed CoStar tenancies; thresholds are assumptions"})
    if "validation" in pts:
        drivers.append({"name": "Market validation by competitors in the region", "points": round(pts["validation"], 1),
                        "detail": (f"{valid_n} direct competitors open >= {cfg['success_open_years']:g} y in the region (counted from {cfg['validation_knots_m'][1][0]:g} m "
                                   f"to {cfg['region_mi']:g} mi): evidence the concept sells here, a benchmark, not a penalty" if valid_n else
                                   "no long-surviving direct competitor found in the region (unknown in a sparse kit, not negative)"),
                        "status": "derived from observed CoStar tenancies"})
    drivers.sort(key=lambda d: -abs(d["points"]))
    comps = {"agglomeration": A, "validation": V if "validation" in pts else None, "competition": (1.0 - C) if covered else None}

    warnings = []
    if adjacent:
        warnings.append({"code": "adjacent_competitor", "level": "warning",
                         "text": f"{len(adjacent)} open direct competitor(s) within {cfg['adjacent_m']:g} m (same building or next door): this rule penalises them heavily. "
                                 "Competitors further away in the region are informative, not penalised."})
    if len(crowded) >= cfg["crowded_min_count"]:
        warnings.append({"code": "crowded_half_mile", "level": "notice",
                         "text": f"{len(crowded)} open direct competitors within {cfg['crowded_within_mi']:g} mi."})
    if coverage["kitBuildingsWithin1mi"] < 3:
        warnings.append({"code": "thin_coverage", "level": "notice",
                         "text": "Fewer than 3 kit buildings within 1 mi: the kit lists Matterport-covered buildings only, so this context is a thin lower bound."})

    band_rows = {}
    for b in bands:
        rows = [n for n in nearby if n["distanceMi"] <= b]
        band_rows[f"{b:g}mi"] = {"directCompetitorsOpen": sum(1 for n in rows if n["type"] == "food" and n["relation"] == "direct" and n["etype"] == 0),
                                 "partialOpen": sum(1 for n in rows if n["type"] == "food" and n["relation"] == "partial" and n["etype"] == 0),
                                 "foodComplementsOpen": sum(1 for n in rows if n["type"] == "food" and n["relation"] == "complement" and n["etype"] == 0),
                                 "otherTenanciesOpen": sum(1 for n in rows if n["type"] == "other" and n["etype"] == 0),
                                 "successfulNonCompeting": sum(1 for n in rows if not (n["type"] == "food" and n["relation"] != "complement") and _success(n["etype"], n["years"], cfg))}
    listed = sorted((n for n in nearby if n["type"] == "food"), key=lambda n: n["distanceMi"])[:max_listed]
    return {"label": "Neighbourhood context index: 0-100, 50 = neutral. Derived from observed CoStar tenancies with team-chosen thresholds. NOT a fit score, NOT a forecast.",
            "index": None if index is None else round(index, 1), "concept": concept,
            "components": {"agglomeration": None if A is None else round(A, 3), "validation": None if comps["validation"] is None else round(V, 3),
                           "competitionPressure": round(C, 3) if comps["competition"] is not None else None, "agglomerationParts": {k: round(v, 3) for k, v in parts.items()}},
            "drivers": drivers, "adjacentCompetitor": bool(adjacent), "warnings": warnings, "bands": band_rows, "coverage": coverage,
            "nearestDirectCompetitorM": round(min((n["distanceMi"] for n in direct_open), default=float("nan")) * M_PER_MI) if direct_open else None,
            "nearbyFood": [{"id": n["id"], "distanceMi": round(n["distanceMi"], 3), "bearingDeg": round(n["bearingDeg"], 1), "kind": n["kind"], "relation": n["relation"],
                            "outcome": _outcome(n["etype"]), "years": round(n["years"], 2), "demo": n["demo"]} for n in listed],
            "optimumBand": "Policy: no open direct competitor within ~400 m (adjacent <= 150 m is penalised fully, 150-400 m heavily), at least one long-surviving direct "
                           "competitor at 0.5-3 mi as validation, and successful non-competing businesses within 0.5 mi.",
            "config": _config_view(cfg), "sources": SOURCES}


def _config_view(cfg: dict) -> dict:
    return {k: (list(v) if isinstance(v, tuple) else {str(a): b for a, b in v.items()} if isinstance(v, dict) else v) for k, v in cfg.items()}


def sensitivity(site: dict, food: list[dict], others: list[dict]) -> dict:
    """Re-score under alternative thresholds. Shows how much of the index and the adjacent warning is threshold choice."""
    base = score(site, food, others)
    variants = []

    def run(name, mutate):
        cfg = copy.deepcopy(CONFIG)
        mutate(cfg)
        r = score(site, food, others, cfg)
        variants.append({"name": name, "index": r["index"], "adjacentCompetitor": r["adjacentCompetitor"]})

    run("adjacent = 75 m", lambda c: c.update(adjacent_m=75.0))
    run("adjacent = 300 m", lambda c: c.update(adjacent_m=300.0))
    run("penalty reaches 0 at 0.5 mi", lambda c: c.update(penalty_knots_m=((0.0, 1.0), (150.0, 1.0), (400.0, 0.2), (805.0, 0.0), (1609.0, 0.0))))
    run("penalty reaches 0 at 1.5 mi", lambda c: c.update(penalty_knots_m=((0.0, 1.0), (150.0, 1.0), (400.0, 0.6), (805.0, 0.3), (2414.0, 0.0))))
    run("competition weight x2", lambda c: c["weights"].update(competition=0.6))
    run("agglomeration weight x2", lambda c: c["weights"].update(agglomeration=0.9))
    run("validation weight 0", lambda c: c["weights"].update(validation=0.0))
    run("success needs 3 y open", lambda c: c.update(success_open_years=3.0))
    vals = [v["index"] for v in variants if v["index"] is not None]
    return {"base": base["index"], "variants": variants, "range": [min(vals), max(vals)] if vals and base["index"] is not None else None,
            "warningStable": all(v["adjacentCompetitor"] == base["adjacentCompetitor"] for v in variants),
            "note": "Thresholds are assumptions: the spread below is the share of the index that is a modelling choice."}


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return float("nan"), float("nan")
    p = k / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return (c - h) / d, (c + h) / d


def adjacency_check(food: list[dict], adjacent_m: float = CONFIG["adjacent_m"], min_year: int = 2013, max_start: date = date(2024, 11, 9)) -> dict:
    """Descriptive check of the adjacency rule on the kit itself: for each food spell that started min_year..max_start, was an open spell of the SAME
    kind within adjacent_m (same building included) present at its start? Compare 2-year closure and 2-year end rates (Wilson 95%).
    Sparse and confounded (building type, concept, era): it shows what the data can and cannot say, and no threshold was chosen from it."""
    rows = []
    for t in food:
        if t["kind"] in ("non_restaurant", "unclassified_food") or t["start"].year < min_year or t["start"] > max_start:
            continue
        ended2 = t["etype"] != 0 and t["years"] <= 2.0
        if not (ended2 or t["years"] >= 2.0):
            continue
        close = []
        for o in food:
            if o is t or o["kind"] != t["kind"] or o["start"] >= t["start"]:
                continue
            if o["end"] is not None and o["end"] <= t["start"] and o["etype"] != 0:
                continue
            if haversine_miles(t["lat"], t["lon"], o["lat"], o["lon"]) * M_PER_MI <= adjacent_m:
                close.append(o)
        rows.append((bool(close), t["etype"] == 1 and t["years"] <= 2.0, ended2))
    out = {"adjacent_m": adjacent_m, "note": "Descriptive only. Same-kind open peer within the distance at the target's start (kit buildings only)."}
    for label, flag in (("withAdjacentSameKind", True), ("withoutAdjacentSameKind", False)):
        sub = [r for r in rows if r[0] == flag]
        n = len(sub)
        kc, ke = sum(r[1] for r in sub), sum(r[2] for r in sub)
        out[label] = {"n": n, "closed2y": kc, "ended2y": ke, "closed2yRate": round(kc / n, 3) if n else None, "ended2yRate": round(ke / n, 3) if n else None,
                      "closed2yCI95": [round(x, 3) for x in wilson(kc, n)] if n else None, "ended2yCI95": [round(x, 3) for x in wilson(ke, n)] if n else None}
    return out
