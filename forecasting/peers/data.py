"""Read the local CoStar kit into food-tenancy spells and a pool of non-food tenancies (for the peers/neighbourhood models).

Local, gitignored data only. Reuses triage.lineage.core.merge_tenants so spell definitions (open / failure / other exit,
company-location merging, as-of censoring) are identical to the lineage and survival work:
  etype 0 = open or censored at the as-of date, 1 = clear failure (expirationReason 4), 2 = any other exit (NOT failure).
Spells are anonymised on the way out: a short salted hash id, never the company name. The name is used once, to derive 'kind'.
"""
from __future__ import annotations

import hashlib
import json
import math
from datetime import date
from pathlib import Path

from triage.lineage import core
from forecasting.peers import kinds

ASOF = date(2026, 11, 9)  # end of the kit data window (kit index.md)
MIN_START_YEAR = 2012  # older spells are left-truncated (only survivors are recorded), as in forecasting/survival
MARKETS = {14: "Houston", 20: "Los Angeles"}
ID_SALT = "peers-v1"
CLASS = {1: "A", 2: "B", 3: "C", 4: "F"}
CLASS_ORDINAL = {"A": 3.0, "B": 2.0, "C": 1.0, "F": 0.0}  # ordinal used in the distance; unknown -> None


def anon_id(prefix: str, *parts) -> str:
    h = hashlib.sha1((ID_SALT + "|" + "|".join(str(p) for p in parts)).encode()).hexdigest()
    return f"{prefix}-{h[:6]}"


def _jsonl(path: Path):
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.strip():
                yield json.loads(line)


def _property(r: dict) -> dict:
    a = r.get("primaryAddress") or {}
    years = [e.get("year") for e in r.get("constructionEvents") or [] if e.get("eventType") == 2 and e.get("year")]
    return {"id": r["id"], "lat": a.get("latitude"), "lon": a.get("longitude"), "market": MARKETS.get(a.get("researchMarketId")),
            "ptype": r.get("propertyType", 0), "bclass": CLASS.get(r.get("buildingClass")), "yearBuilt": min(years) if years else None,
            "grossSqFt": r.get("grossBuildingAreaSquareFeet")}


def _sqft(occ: dict) -> float | None:
    v = [s.get("squareFeetOccupied") for s in occ.get("spaces") or [] if s.get("squareFeetOccupied")]
    return float(sum(v)) if v else None


def load_kit(kit_data_dir: str | Path, asof: date = ASOF) -> dict:
    """{'props': {pid: prop}, 'food': [spell], 'others': [tenancy]} from the kit's jsonl files.
    Food spell keys: id, propertyId, lat, lon, market, kind, start, end, etype, years, sqft, employees, ptype, bclass, yearBuilt.
    'others' = non-food tenancies (merged per company location): propertyId, lat, lon, industry, start, end, etype, years, employees."""
    d = Path(kit_data_dir)
    companies = {r["id"]: r for r in _jsonl(d / "company-detail.jsonl")}
    props = {r["id"]: _property(r) for r in _jsonl(d / "commercial-property.jsonl")}
    by_prop_food: dict = {}
    by_prop_other: dict = {}
    sqft: dict = {}
    for o in _jsonl(d / "location-occupancy.jsonl"):
        tid, pid = o.get("tenantLocationId"), o.get("propertyId")
        co = companies.get(tid)
        if co is None or pid not in props:
            continue
        ind = (co.get("profile") or {}).get("industryType")
        rec = {"tenantLocationId": tid, "fromDate": o.get("fromDate"), "toDate": o.get("toDate"),
               "expirationReason": o.get("expirationReason", 0),
               "name": (co.get("profile") or {}).get("companyName") or co.get("name"), "employees": co.get("numEmployees"), "industry": ind}
        (by_prop_food if ind == core.FOOD else by_prop_other).setdefault(pid, []).append(rec)
        s = _sqft(o)
        if s:
            sqft[(pid, tid)] = max(s, sqft.get((pid, tid), 0.0))  # renewals repeat the same space: max, not sum
    food, others = [], []
    for pid, occs in by_prop_food.items():
        p = props[pid]
        emp = {o["tenantLocationId"]: o["employees"] for o in occs}
        for t in core.merge_tenants(occs, asof):
            if t["start"] is None or t["years"] is None or t["years"] <= 0:
                continue
            food.append({"id": anon_id("P", pid, t["tenantLocationId"]), "propertyId": pid, "lat": p["lat"], "lon": p["lon"], "market": p["market"],
                         "kind": kinds.classify_name(t["name"]), "start": t["start"], "end": t["end"],
                         "etype": {"open": 0, "failure": 1, "other_exit": 2}[t["etype"]], "years": t["years"],
                         "sqft": sqft.get((pid, t["tenantLocationId"])), "employees": emp.get(t["tenantLocationId"]),
                         "ptype": p["ptype"], "bclass": p["bclass"], "yearBuilt": p["yearBuilt"]})
    for pid, occs in by_prop_other.items():
        p = props[pid]
        meta = {o["tenantLocationId"]: o for o in occs}
        for t in core.merge_tenants(occs, asof):
            if t["start"] is None or t["years"] is None or t["years"] <= 0:
                continue
            m = meta[t["tenantLocationId"]]
            others.append({"id": anon_id("B", pid, t["tenantLocationId"]), "propertyId": pid, "lat": p["lat"], "lon": p["lon"], "market": p["market"],
                           "industry": m["industry"], "start": t["start"], "end": t["end"],
                           "etype": {"open": 0, "failure": 1, "other_exit": 2}[t["etype"]], "years": t["years"], "employees": m["employees"]})
    return {"props": props, "food": food, "others": others, "asof": asof}


def peer_pool(food: list[dict], min_start_year: int = MIN_START_YEAR) -> list[dict]:
    """Spells usable as peers: located, in a known market, a real food business (not lodging/corporate), started min_start_year or later."""
    return [s for s in food if s["lat"] is not None and s["lon"] is not None and s["market"] and s["kind"] != "non_restaurant"
            and s["start"].year >= min_start_year]


def haversine_miles(la1, lo1, la2, lo2) -> float:
    p1, p2 = math.radians(la1), math.radians(la2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lo2 - lo1) / 2) ** 2
    return 3958.8 * 2 * math.asin(math.sqrt(min(1.0, a)))
