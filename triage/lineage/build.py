"""Build lineage + presence artifacts from the local CoStar kit (gitignored output; prints aggregates only).

  python -m triage.lineage.build --kit /path/to/full-kit --candidates restaurant-site-candidates.csv --out data/derived/lineage
"""
from __future__ import annotations

import argparse
import csv
import json
import statistics
from collections import Counter
from datetime import date
from pathlib import Path

from triage.lineage import core
from triage.presence import core as pcore

ASOF = date(2026, 11, 9)  # kit window end
MARKETS = {14: "Houston", 20: "Los Angeles"}


def jl(p):
    with open(p, encoding="utf-8") as f:
        for line in f:
            if line.strip():
                yield json.loads(line)


def _load(d: Path, asof: date):
    """(props, food_by_prop) from the kit's data folder; shared by the candidate build and the single-site build."""
    companies = {r["id"]: r for r in jl(d / "company-detail.jsonl")}
    props = {}
    for r in jl(d / "commercial-property.jsonl"):
        a = r.get("primaryAddress") or {}
        hosp, apt = r.get("propertyHospitality") or {}, r.get("propertyApartment") or {}
        props[r["id"]] = {"id": r["id"], "lat": a.get("latitude"), "lon": a.get("longitude"), "ptype": r.get("propertyType"),
                          "market": MARKETS.get(a.get("researchMarketId")), "units": apt.get("totalNumUnits"),
                          "rooms": hosp.get("numUnits"), "occ_pct": hosp.get("averageOccupancyPercent"), "tenants": []}
    food_by_prop: dict = {}
    for o in jl(d / "location-occupancy.jsonl"):
        co = companies.get(o.get("tenantLocationId"))
        p = props.get(o.get("propertyId"))
        if co is None or p is None:
            continue
        ind = (co.get("profile") or {}).get("industryType")
        to = core._d(o.get("toDate"))
        if to is None or to > asof:  # current tenant: open occupancy
            fr = core._d(o.get("fromDate"))
            if fr is None or fr <= asof:
                p["tenants"].append({"loc": o["tenantLocationId"], "employees": co.get("numEmployees"), "industry": ind})
        if ind == core.FOOD:
            food_by_prop.setdefault(o["propertyId"], []).append(
                {"tenantLocationId": o["tenantLocationId"], "fromDate": o.get("fromDate"), "toDate": o.get("toDate"),
                 "expirationReason": o.get("expirationReason", 0),
                 "name": (co.get("profile") or {}).get("companyName") or co.get("name")})
    return props, food_by_prop


def build_sites(d: Path, pids: list[int], asof: date = ASOF) -> dict:
    """Lineage and presence for specific CoStar properties (e.g. a cafe scan linked to a property that is not a candidate row),
    with the same code and thresholds as build(). Returns {"lineage": {pid: L}, "presence": {pid: P}}; a property with no food
    tenancy has no lineage entry, one without coordinates has no presence entry."""
    props, food_by_prop = _load(d, asof)
    out = {"lineage": {}, "presence": {}}
    blds = list(props.values())
    for pid in pids:
        if pid in food_by_prop:
            L = core.building_lineage(food_by_prop[pid], asof, names=True)
            L["market"], L["isCandidate"] = props[pid]["market"], False
            out["lineage"][str(pid)] = L
        p = props.get(pid)
        if p and p["lat"] is not None and p["lon"] is not None:
            out["presence"][str(pid)] = pcore.presence(float(p["lat"]), float(p["lon"]), blds)
    return out


def build(kit: Path, cand_csv: Path, out: Path, asof: date = ASOF, reps: int = 300) -> dict:
    props, food_by_prop = _load(kit / "data", asof)
    with open(cand_csv, newline="", encoding="utf-8") as f:
        cands = list(csv.DictReader(f))
    cand_ids = {int(c["property_id"]) for c in cands}

    lineage, spells = {}, []
    for pid, occs in food_by_prop.items():
        L = core.building_lineage(occs, asof, names=True)  # names kept locally; API strips unless opted in
        L["market"] = props[pid]["market"]
        L["isCandidate"] = pid in cand_ids
        lineage[str(pid)] = L
        for t in core.merge_tenants(occs, asof):
            if t["years"] and t["start"] and t["start"].year >= 2012:
                spells.append({"propertyId": pid, "years": t["years"],
                               "etype": {"open": 0, "failure": 1, "other_exit": 2}[t["etype"]]})
    surv = core.survival_context(spells, reps=reps)

    blds = list(props.values())
    presence = {}
    for c in cands:
        try:
            lat, lon = float(c["latitude"]), float(c["longitude"])
        except ValueError:
            continue
        presence[c["property_id"]] = pcore.presence(lat, lon, blds)

    summary = summarize(lineage, cand_ids, surv, presence)
    out.mkdir(parents=True, exist_ok=True)
    for name, obj in (("lineage", lineage), ("presence", presence), ("summary", summary)):
        (out / f"{name}.json").write_text(json.dumps(obj), encoding="utf-8")
    return summary


def summarize(lineage: dict, cand_ids: set, surv: dict, presence: dict) -> dict:
    def agg(items):
        tot = Counter()
        meds, second, churn = [], 0, 0
        for L in items:
            for k, v in L["counts"].items():
                tot[k] += v
            if L["medianCompletedTenureYears"] is not None:
                meds.append(L["medianCompletedTenureYears"])
            second += L["isSecondGenerationSpace"]
            churn += L["churnFlag"]
            tot["failuresWithFoodSuccessor"] += L["secondGeneration"]["failuresWithFoodSuccessor"]
            tot["endedWithFoodSuccessor"] += L["secondGeneration"]["endedWithFoodSuccessor"]
        return {"buildings": len(items), "secondGenerationBuildings": second, "churnFlagged": churn,
                "totals": dict(tot),
                "shareOfClearFailuresFollowedByFood": round(tot["failuresWithFoodSuccessor"] / tot["clearFailure"], 3) if tot["clearFailure"] else None,
                "shareOfEndedFollowedByFood": round(tot["endedWithFoodSuccessor"] / tot["ended"], 3) if tot["ended"] else None,
                "medianOfBuildingMedianTenureYears": round(statistics.median(meds), 2) if meds else None,
                "buildingsWithMedian": len(meds)}
    allL = list(lineage.values())
    pooled = [t["tenureYears"] for L in allL for t in L["tenants"] if t["ending"] != "open" and t["tenureYears"] is not None]
    candL = [L for k, L in lineage.items() if int(k) in cand_ids]
    shapes = Counter(p["radii"]["0.25mi"]["shape"] for p in presence.values())
    shapes5 = Counter(p["radii"]["0.5mi"]["shape"] for p in presence.values())
    fills = [p["radii"]["0.5mi"]["day"]["employeeFillRate"] for p in presence.values() if p["radii"]["0.5mi"]["day"]["employeeFillRate"] is not None]
    return {"allFoodHistory": {**agg(allL), "pooledMedianCompletedTenureYears": round(statistics.median(pooled), 2) if pooled else None,
                               "pooledCompletedTenancies": len(pooled)},  "candidates": agg(candL), "candidatesWithFoodHistory": len(candL),
            "candidateCount": len(cand_ids), "marketPrior": surv, "presenceCandidates": len(presence),
            "presenceShape0.25mi": dict(shapes), "presenceShape0.5mi": dict(shapes5),
            "medianEmployeeFillRate0.5mi": round(statistics.median(fills), 3) if fills else None,
            "successorRule": f"another food tenant starting within {core.SUCCESSOR_WINDOW_DAYS} days after (or {core.OVERLAP_DAYS} before) the end, same building",
            "asOf": ASOF.isoformat(), "label": core.MARKET_PRIOR_LABEL}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--kit", default="data/raw/costar/full-kit")
    ap.add_argument("--candidates", default="data/normalized/costar/restaurant-site-candidates.csv")
    ap.add_argument("--out", default="data/derived/lineage")
    a = ap.parse_args()
    print(json.dumps(build(Path(a.kit), Path(a.candidates), Path(a.out)), indent=1))
