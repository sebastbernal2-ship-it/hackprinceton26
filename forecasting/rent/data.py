"""Build the one-row-per-listing asking-rent frame from the local CoStar kit.

Rent is annualised $/sf/yr: rateBasis 1 (monthly) x12, 2 (yearly) x1; basis 0/missing or rate 0 is UNKNOWN (dropped
from training, never zero). Space rates are collapsed to the listing median so one building cannot dominate.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

MARKETS = {"houston": "houston", "los angeles": "los-angeles"}
RETAIL_TYPES = {6, 9}  # GeneralRetail, MixedUse (CoStar propertyType enum)
RENT_MIN, RENT_MAX = 2.0, 250.0  # plausibility bounds, $/sf/yr, applied after annualisation
NUMERIC = ["log_sqft_avail", "log_gba", "year_built", "stories", "parking_ratio", "rating", "dom_year", "lat", "lon"]
CATEGORICAL = ["ptype", "bclass", "service", "submarket"]


def _jsonl(path: Path):
    with Path(path).open(encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                yield json.loads(line)


def annual_rate(space: dict) -> float | None:
    low, high = space.get("rateLow") or 0, space.get("rateHigh") or 0
    mid = (low + high) / 2 if high > 0 and low > 0 else (low or high)
    mult = {1: 12.0, 2: 1.0}.get(space.get("rateBasis"))
    if not mid or mid <= 0 or mult is None:
        return None
    return mid * mult


def _num(v):
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else np.nan


def build_frame(kit_dir: Path) -> pd.DataFrame:
    kit_dir = Path(kit_dir)
    props = {p["id"]: p for p in _jsonl(kit_dir / "commercial-property.jsonl")}
    rows = []
    for r in _jsonl(kit_dir / "commercial-listing-summary.jsonl"):
        fl = r.get("forLeaseSummary") or {}
        spaces = fl.get("spaces") or []
        addr = r.get("address") if isinstance(r.get("address"), dict) else {}
        metro = MARKETS.get((addr.get("city") or "").lower())
        if not spaces or not metro:
            continue
        p = props.get(r.get("propertyId"), {})
        rates = [a for s in spaces if (a := annual_rate(s)) is not None and RENT_MIN <= a <= RENT_MAX]
        sf = [s.get("squareFeetMax") or s.get("squareFeetMin") for s in spaces]
        svc = [s.get("serviceType") for s in spaces if s.get("askingRateHasValue")]
        dates = sorted(pd.Timestamp(s["dateOnMarket"][:10]) for s in spaces if s.get("dateOnMarket"))
        tot = _num(fl.get("totalAvailableSquareFeet"))
        gba = _num(p.get("grossBuildingAreaSquareFeet"))
        gba = gba if gba == gba else _num(r.get("buildingSizeSquareFeet"))
        rows.append({
            "listingId": r["id"], "propertyId": r.get("propertyId"), "metro": metro, "ptype": r.get("propertyType"),
            "bclass": r.get("buildingClass"), "service": max(set(svc), key=svc.count) if svc else None,
            "submarket": r.get("primarySubmarketId"), "lat": _num(addr.get("latitude")), "lon": _num(addr.get("longitude")),
            "log_sqft_avail": np.log(tot) if tot > 0 else np.nan, "log_gba": np.log(gba) if gba > 0 else np.nan,
            "year_built": _num(r.get("constructionCompleteYear")), "stories": _num(p.get("numStoriesAboveGrade")),
            "parking_ratio": _num(p.get("parkingRatio")), "rating": _num(r.get("buildingRating")),
            "date_on_market": dates[0] if dates else pd.NaT,
            "n_spaces": len(spaces), "n_rated": len(rates),
            "rent": float(np.median(rates)) if rates else np.nan,
        })
    df = pd.DataFrame(rows)
    df["dom_year"] = df["date_on_market"].dt.year + df["date_on_market"].dt.dayofyear / 366.0
    df["is_retail"] = df["ptype"].isin(RETAIL_TYPES)
    df["log_rent"] = np.log(df["rent"])
    df["grid"] = (np.floor(df["lat"] / 0.05).astype("Int64").astype(str) + "_" + np.floor(df["lon"] / 0.05).astype("Int64").astype(str))
    return df
