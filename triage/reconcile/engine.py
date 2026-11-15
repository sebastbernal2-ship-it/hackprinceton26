"""Pure reconciliation engine: CoStar record + Matterport scan summary + optional aerial -> per-field triage rows.

No I/O here. Every rule is an assumption documented in docs/models/triage.md. Nothing is a forecast;
confidence is a rule-based label (high/medium/low/none), not a probability. Unknown stays unknown, never 0.
Statuses: filled | confirmed | conflicting | blank-unfillable | unverified (CoStar value present, no modality could test it).
"""
from __future__ import annotations
import re
from statistics import median
from typing import Any, Optional

FIELDS = ["clear_height_ft", "floors", "area_sqft", "restroom_count", "kitchen_present",
          "parking_spaces", "rooftop_units", "loading_docks"]
AERIAL_FIELDS = {"parking_spaces": "parkingSpaces", "rooftop_units": "rooftopUnits", "loading_docks": "loadingDocks"}
STATUS_WEIGHT = {"conflicting": 100.0, "filled": 30.0, "unverified": 8.0, "confirmed": 0.0, "blank-unfillable": 12.0}
CONF_PENALTY = {"high": 0.0, "medium": 5.0, "low": 12.0, "none": 0.0}

RESTROOM = re.compile(r"\b(bath(room)?s?|restrooms?|toilets?|wc|lavator(y|ies)|powder)\b", re.I)
KITCHEN = re.compile(r"\b(kitchen(ette)?s?|galley|pantry)\b", re.I)


def _num(x: Any) -> Optional[float]:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if v > 0 else None  # 0 / negative in a CoStar numeric slot means "not recorded", never a measurement


def _label(room: dict) -> Optional[str]:
    c = room.get("classifications") or []
    return c[0].get("label") if c else None


def costar_facts(prop: dict, listings: list[dict] | None = None) -> dict:
    """Extract the CoStar values triage needs from one commercial-property record (+ its lease listings)."""
    blocks = [prop.get(k) or {} for k in ("propertyIndustrial", "propertyFlex", "propertyRetail", "propertyOffice")]
    ceil = None
    for b in blocks:
        s = b.get("structural") or {}
        f = _num(s.get("ceilingHeightFeet"))
        if f:
            inch = _num(s.get("ceilingHeightInches")) or 0
            ceil = f + inch / 12.0
    slab = next((_num((b.get("structural") or {}).get("slabToSlabHeightFeet")) for b in blocks
                 if _num((b.get("structural") or {}).get("slabToSlabHeightFeet"))), None)
    docks = next((b.get("numExternalLoadingDocks") for b in blocks if b.get("numExternalLoadingDocks") is not None), None)
    park = [_num(p.get("totalSpaces")) for p in prop.get("parking") or []]
    park = [p for p in park if p]
    gla = _num((prop.get("propertyRetail") or {}).get("grossLeasableAreaSquareFeet"))
    suites = []
    for l in listings or []:
        s = l.get("forLeaseSummary") or {}
        for k in ("minDivisibleSquareFeet", "maxContiguousSquareFeet", "totalAvailableSquareFeet"):
            v = _num(s.get(k))
            if v:
                suites.append(v)
    return {
        "propertyType": prop.get("propertyType"),
        "ceilingMaxFt": ceil, "slabToSlabFt": slab,
        "stories": _num(prop.get("numStoriesAboveGrade")),
        "floorsListed": len(prop.get("floors") or []) or None,
        "gba": _num(prop.get("grossBuildingAreaSquareFeet")), "rba": _num(prop.get("rentableBuildingAreaSquareFeet")),
        "gla": gla, "suiteAreas": sorted(set(suites)),
        "parkingSpaces": sum(park) if park else None,
        "loadingDocks": docks if isinstance(docks, int) and docks > 0 else None,  # 0/None docks: not recorded as a count of dock doors
    }


def scan_facts(rec: dict | None) -> dict | None:
    """Summarise one cached Matterport fetch. None when no usable model."""
    m = (rec or {}).get("model")
    if not m:
        return None
    rooms = m.get("rooms") or []
    real = [r for r in rooms if _label(r) != "Void"]  # Matterport 'Void' = non-space; excluded from sums
    areas = [_num((r.get("dimensions") or {}).get("areaFloor")) for r in real]
    heights = [_num((r.get("dimensions") or {}).get("height")) for r in real]
    heights = [h for h in heights if h]
    labels = [_label(r) for r in real]
    return {
        "modelId": rec.get("modelId"), "roomCount": len(real),
        "labelledRooms": sum(1 for l in labels if l and l != "Other"),
        "labels": labels,
        "roomAreaSum": sum(a for a in areas if a) or None,
        "modelArea": _num((m.get("dimensions") or {}).get("areaFloor")),
        "floors": len(m.get("floors") or []) or None,
        "heights": heights,
        "bathrooms": sum(1 for l in labels if l and RESTROOM.search(l)),
        "kitchens": sum(1 for l in labels if l and KITCHEN.search(l)),
    }


def _ref(source: str, ref: str, detail: str = "") -> dict:
    return {"source": source, "ref": ref, "detail": detail}


def _row(field, status, *, costar=None, scan=None, aerial=None, value=None, value_status="unknown", scope="unknown",
         confidence="none", refs=None, rule="", note="", unit="") -> dict:
    return {"field": field, "status": status, "costarValue": costar, "scanValue": scan, "aerialValue": aerial,
            "value": value, "valueStatus": value_status, "unit": unit, "scope": scope, "confidence": confidence,
            "evidenceRefs": refs or [], "rule": rule, "note": note}


def reconcile_height(c: dict, s: Optional[dict]) -> dict:
    cm = c["ceilingMaxFt"]
    hs = s["heights"] if s else []
    smax = max(hs) if hs else None
    refs = []
    if cm:
        refs.append(_ref("costar", "structural.ceilingHeightFeet", "stored as the MAXIMUM ceiling height"))
    if smax:
        refs.append(_ref("matterport", f"rooms[{len(hs)}].dimensions.height", f"room heights, max={smax:.1f}ft median={median(hs):.1f}ft"))
    rule = "CoStar stores a max; compare to scan MAX room height with tol=max(1.5ft,10%). Scan lower than max is consistent (unscanned high bay) but only weakly confirms."
    if cm and smax:
        tol = max(1.5, 0.10 * cm)
        if abs(smax - cm) <= tol:
            return _row("clear_height_ft", "confirmed", costar=cm, scan=smax, value=cm, value_status="observed", scope="room",
                        confidence="medium", refs=refs, rule=rule, unit="ft")
        if smax > cm + tol:
            return _row("clear_height_ft", "conflicting", costar=cm, scan=smax, scope="room", confidence="medium", refs=refs, rule=rule,
                        note="A scanned room is taller than CoStar's stated maximum; max-vs-room normalisation already applied.", unit="ft")
        return _row("clear_height_ft", "confirmed", costar=cm, scan=smax, value=cm, value_status="observed", scope="room",
                    confidence="low", refs=refs, rule=rule, unit="ft",
                    note="Scanned rooms are lower than the CoStar maximum: consistent with a max, not a measurement of it.")
    if cm:
        return _row("clear_height_ft", "unverified", costar=cm, value=cm, value_status="observed", scope="building", refs=refs, rule=rule, unit="ft",
                    note="No scan room heights available to test it.")
    if smax:
        return _row("clear_height_ft", "filled", scan=smax, value=smax, value_status="derived", scope="room",
                    confidence="medium" if len(hs) >= 3 else "low", refs=refs, rule=rule, unit="ft",
                    note="Scan max room height offered as a ceiling-height lower bound for the building max; CoStar was blank.")
    note = "CoStar slab-to-slab only (not a clear height)." if c["slabToSlabFt"] else ""
    return _row("clear_height_ft", "blank-unfillable", rule=rule, note=note, unit="ft")


def reconcile_floors(c: dict, s: Optional[dict]) -> dict:
    cv = c["stories"] or c["floorsListed"]
    sf = s["floors"] if s else None
    refs = []
    if cv:
        refs.append(_ref("costar", "numStoriesAboveGrade" if c["stories"] else "floors[]"))
    if sf:
        refs.append(_ref("matterport", "floors[]", f"{sf} scanned floor(s)"))
    rule = "Scan floors count only the scanned space. Scan > CoStar stories is a conflict (could be below-grade: flagged); scan < CoStar is a scope difference, not an error."
    if cv and sf:
        if sf == cv:
            return _row("floors", "confirmed", costar=cv, scan=sf, value=cv, value_status="observed", scope="building", confidence="medium", refs=refs, rule=rule)
        if sf > cv:
            return _row("floors", "conflicting", costar=cv, scan=sf, scope="building", confidence="low", refs=refs, rule=rule,
                        note="More scanned floors than CoStar stories above grade; may include basement/mezzanine.")
        return _row("floors", "unverified", costar=cv, scan=sf, value=cv, value_status="observed", scope="suite", refs=refs, rule=rule,
                    note="Scan covers fewer floors than the building has: suite scope, no verdict.")
    if cv:
        return _row("floors", "unverified", costar=cv, value=cv, value_status="observed", scope="building", refs=refs, rule=rule)
    if sf:
        return _row("floors", "filled", scan=sf, value=sf, value_status="derived", scope="suite", confidence="low", refs=refs, rule=rule,
                    note="At least this many floors (lower bound); scan may cover only part of the building.")
    return _row("floors", "blank-unfillable", rule=rule)


def reconcile_area(c: dict, s: Optional[dict]) -> dict:
    scan = (s or {}).get("roomAreaSum") or (s or {}).get("modelArea")
    refs = []
    bld = [("gba", c["gba"]), ("rba", c["rba"]), ("gla", c["gla"])]
    have_bld = [(k, v) for k, v in bld if v]
    if have_bld:
        refs.append(_ref("costar", "/".join(k for k, _ in have_bld), "building-scope areas"))
    if c["suiteAreas"]:
        refs.append(_ref("costar", "forLeaseSummary", "suite-scope listed areas"))
    if scan:
        refs.append(_ref("matterport", "rooms.dimensions.areaFloor", f"summed non-void room floor area {scan:.0f} sqft"))
    rule = ("Scan area is summed room floor area. Scope = suite if within 20% of a listed suite size, building if within 20% of GBA/RBA/GLA, else indeterminate. "
            "Conflict ONLY when scan exceeds 125% of the largest CoStar area (impossible at any scope); scope-mismatched differences are never 'CoStar is wrong'.")
    if scan and (have_bld or c["suiteAreas"]):
        for a in c["suiteAreas"]:
            if abs(scan - a) <= 0.2 * a:
                return _row("area_sqft", "confirmed", costar=a, scan=scan, value=a, value_status="observed", scope="suite", confidence="medium", refs=refs, rule=rule, unit="sqft")
        for k, v in have_bld:
            if abs(scan - v) <= 0.2 * v:
                return _row("area_sqft", "confirmed", costar=v, scan=scan, value=v, value_status="observed", scope="building", confidence="medium", refs=refs, rule=rule, unit="sqft",
                            note=f"matched {k.upper()}")
        biggest = max([v for _, v in have_bld] + c["suiteAreas"])
        if scan > 1.25 * biggest:
            return _row("area_sqft", "conflicting", costar=biggest, scan=scan, scope="indeterminate", confidence="medium", refs=refs, rule=rule, unit="sqft",
                        note="Scan area exceeds every CoStar area by >25%.")
        return _row("area_sqft", "unverified", costar=biggest, scan=scan, value=biggest, value_status="observed", scope="indeterminate", refs=refs, rule=rule, unit="sqft",
                    note="Scan area matches no CoStar suite or building figure within 20%: scope mismatch, no verdict.")
    if scan:
        return _row("area_sqft", "filled", scan=scan, value=scan, value_status="derived", scope="suite", confidence="low", refs=refs, rule=rule, unit="sqft",
                    note="Area of the scanned space only; CoStar has no area to compare.")
    if have_bld or c["suiteAreas"]:
        v = (have_bld[0][1] if have_bld else c["suiteAreas"][0])
        return _row("area_sqft", "unverified", costar=v, value=v, value_status="observed", scope="building" if have_bld else "suite", refs=refs, rule=rule, unit="sqft")
    return _row("area_sqft", "blank-unfillable", rule=rule, unit="sqft")


def _label_count(name: str, s: Optional[dict], key: str, regex_note: str) -> dict:
    rule = f"Count scanned room labels matching {regex_note}. No matching label is NOT zero: stays unknown (Matterport labels are partial)."
    if not s or not s["roomCount"]:
        return _row(name, "blank-unfillable", rule=rule)
    refs = [_ref("matterport", "rooms.classifications", f"{s['roomCount']} rooms, {s['labelledRooms']} with a specific label")]
    n = s[key]
    if n:
        return _row(name, "filled", scan=n, value=n if name == "restroom_count" else True, value_status="derived", scope="suite",
                    confidence="medium", refs=refs, rule=rule, note="Count within the scanned space only (lower bound for the building).")
    return _row(name, "blank-unfillable", refs=refs, rule=rule, note="No matching room label; absence of a label is not evidence of absence.")


def reconcile_aerial(field: str, costar_val: Optional[float], aerial: dict | None) -> dict:
    key = AERIAL_FIELDS[field]
    a = (aerial or {}).get(key)
    av = _num(a.get("value")) if isinstance(a, dict) else None
    rule = "Aerial slice output (data/derived/triage/aerial/<id>.json). Parking: within 20% or 5 spaces; docks: exact; rooftop units: no CoStar field."
    refs = []
    if costar_val:
        refs.append(_ref("costar", "parking.totalSpaces" if field == "parking_spaces" else "numExternalLoadingDocks"))
    if av is not None:
        refs.append(_ref("vexcel", a.get("evidenceRef") or key, "aerial count by the aerial slice (model estimate)"))
        conf = a.get("confidence") if a.get("confidence") in ("high", "medium", "low") else "low"
        if costar_val is None:
            return _row(field, "filled", aerial=av, value=av, value_status="estimated", scope="building", confidence=conf, refs=refs, rule=rule)
        tol = max(5.0, 0.2 * costar_val) if field == "parking_spaces" else 0.0
        if abs(av - costar_val) <= tol:
            return _row(field, "confirmed", costar=costar_val, aerial=av, value=costar_val, value_status="observed", scope="building", confidence=conf, refs=refs, rule=rule)
        return _row(field, "conflicting", costar=costar_val, aerial=av, scope="building", confidence=conf, refs=refs, rule=rule,
                    note="Aerial estimate differs from CoStar; aerial counts are model estimates (occlusion, partial lots).")
    if costar_val:
        return _row(field, "unverified", costar=costar_val, value=costar_val, value_status="observed", scope="building", refs=refs, rule=rule, note="Awaiting aerial slice output.")
    return _row(field, "blank-unfillable", rule=rule, note="Awaiting aerial slice output (pending).")


def priority(row: dict, gba: Optional[float]) -> float:
    w = STATUS_WEIGHT[row["status"]] + CONF_PENALTY.get(row["confidence"], 0.0)
    if row["status"] == "blank-unfillable" and row["field"] in ("parking_spaces", "rooftop_units", "loading_docks"):
        w = 4.0  # pending aerial, lower urgency
    size = min(10.0, (gba or 0) / 20000.0)  # bigger buildings: slightly higher payoff
    return round(w + size, 1)


def triage_property(pid: str, prop: dict, listings: list[dict] | None, scan_rec: dict | None, aerial: dict | None) -> dict:
    c = costar_facts(prop, listings)
    s = scan_facts(scan_rec)
    rows = [
        reconcile_height(c, s), reconcile_floors(c, s), reconcile_area(c, s),
        _label_count("restroom_count", s, "bathrooms", "bath*/restroom/toilet/WC/lavatory"),
        _label_count("kitchen_present", s, "kitchens", "kitchen/kitchenette/galley/pantry"),
        reconcile_aerial("parking_spaces", c["parkingSpaces"], aerial),
        reconcile_aerial("rooftop_units", None, aerial),
        reconcile_aerial("loading_docks", c["loadingDocks"], aerial),
    ]
    for r in rows:
        r["reviewScore"] = priority(r, c["gba"])
    return {"listingId": pid, "hasScan": s is not None, "hasAerial": bool(aerial), "fields": rows,
            "scope": ("suite" if s and any(r["scope"] == "suite" for r in rows if r["field"] == "area_sqft") else "unknown")}
