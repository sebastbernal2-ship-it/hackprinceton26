"""Build tenancy spells (food-and-beverage tenants) from the CoStar kit.

Local gitignored data only. Nothing here prints or persists rows.
Outcome coding (documented in docs/models/survival.md):
  type 1 = failure: occupancy ended with expirationReason 4 (ClosedLocationOrBankrupt)
  type 2 = other exit: occupancy ended for any other reason, including
           MovingOutNewAddressUnknown (10), which is NOT counted as failure
  type 0 = censored: still open (no toDate) or toDate after the as-of date
businessStatus is never read (it is outcome leakage).
"""
from __future__ import annotations

import json
import math
from datetime import date, datetime
from pathlib import Path

import pandas as pd

ACCOMMODATION_FOOD = 17  # IndustryType.AccommodationAndFoodServices
FAILURE_REASON = 4
DEFAULT_ASOF = date(2026, 11, 9)  # kit index.md: data window ends 2026-11-09
MIN_START_YEAR = 2012
MARKETS = {14: "Houston", 20: "Los Angeles"}  # researchMarketId


def _jsonl(path: Path):
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.strip():
                yield json.loads(line)


def _d(s: str | None) -> date | None:
    return datetime.fromisoformat(s).date() if s else None


def spell_from_records(occ: dict, company: dict, prop: dict, asof: date) -> dict | None:
    start, end = _d(occ.get("fromDate")), _d(occ.get("toDate"))
    if start is None or start > asof or start.year < MIN_START_YEAR:
        return None
    if end is not None and end > asof:
        end = None  # scheduled/future end is not an observed event
    if end is None:
        etype, stop = 0, asof
    else:
        etype = 1 if occ.get("expirationReason") == FAILURE_REASON else 2
        stop = end
    days = (stop - start).days
    if days <= 0:
        return None
    sq = [s.get("squareFeetOccupied") for s in occ.get("spaces") or [] if s.get("squareFeetOccupied")]
    addr = prop.get("primaryAddress") or {}
    return {
        "propertyId": occ["propertyId"],
        "start_year": start.year,
        "years": days / 365.25,
        "etype": etype,
        "market_id": addr.get("researchMarketId"),
        "property_type": prop.get("propertyType", 0),
        "building_class": prop.get("buildingClass", 0),
        "sqft": float(sum(sq)) if sq else math.nan,
        "lease_type": occ.get("leaseType", 0),
        "employees": company.get("numEmployees") if company.get("numEmployees") is not None else math.nan,
    }


def build_spells(kit_data_dir: str | Path, asof: date = DEFAULT_ASOF) -> pd.DataFrame:
    d = Path(kit_data_dir)
    companies = {r["id"]: r for r in _jsonl(d / "company-detail.jsonl")}
    props = {r["id"]: r for r in _jsonl(d / "commercial-property.jsonl")}
    rows = []
    for occ in _jsonl(d / "location-occupancy.jsonl"):
        co = companies.get(occ.get("tenantLocationId"))
        if co is None or (co.get("profile") or {}).get("industryType") != ACCOMMODATION_FOOD:
            continue
        prop = props.get(occ.get("propertyId"))
        if prop is None:
            continue
        r = spell_from_records(occ, co, prop, asof)
        if r and r["market_id"] in MARKETS:
            r["market"] = MARKETS[r["market_id"]]
            rows.append(r)
    return pd.DataFrame(rows)


def split_by_start_year(df: pd.DataFrame) -> dict[str, pd.DataFrame]:
    y = df["start_year"]
    return {
        "train": df[(y >= 2012) & (y <= 2020)].reset_index(drop=True),
        "val": df[(y >= 2021) & (y <= 2023)].reset_index(drop=True),
        "test": df[y >= 2024].reset_index(drop=True),
    }
