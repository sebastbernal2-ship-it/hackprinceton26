"""All-industry tenancy spells from the CoStar kit (local gitignored data; nothing printed or persisted per row).

Outcome coding matches forecasting/survival: type 1 = ClosedLocationOrBankrupt, type 2 = any other end
(MovingOutNewAddressUnknown is NOT failure), type 0 = right-censored. businessStatus is never read.
`cutoff` right-censors spells at a calendar date (spells starting after it are dropped) so a training set
contains no outcome observed after the cutoff.
"""
from __future__ import annotations

from datetime import date
from pathlib import Path

import pandas as pd

from forecasting.survival.data import DEFAULT_ASOF, MARKETS, _jsonl, spell_from_records

FOOD = "Food & accommodation"
GROUPS = {
    17: FOOD,
    6: "Retail & wholesale", 27: "Retail & wholesale",
    1: "Professional & business services", 3: "Professional & business services", 12: "Professional & business services",
    16: "Professional & business services", 8: "Professional & business services", 22: "Professional & business services",
    18: "Professional & business services", 24: "Professional & business services",
    4: "Finance, insurance & real estate", 7: "Finance, insurance & real estate", 14: "Finance, insurance & real estate",
    15: "Health care", 13: "Personal services, education & arts", 20: "Personal services, education & arts",
    21: "Personal services, education & arts",
    2: "Industrial & transport", 5: "Industrial & transport", 10: "Industrial & transport", 19: "Industrial & transport",
    23: "Industrial & transport", 25: "Industrial & transport", 26: "Industrial & transport",
    9: "Information & government", 11: "Information & government",
}
UNKNOWN = "Unknown industry"


def build_spells(kit_data_dir, asof: date = DEFAULT_ASOF) -> pd.DataFrame:
    d = Path(kit_data_dir)
    companies = {r["id"]: r for r in _jsonl(d / "company-detail.jsonl")}
    props = {r["id"]: r for r in _jsonl(d / "commercial-property.jsonl")}
    rows = []
    for occ in _jsonl(d / "location-occupancy.jsonl"):
        co = companies.get(occ.get("tenantLocationId"))
        prop = props.get(occ.get("propertyId"))
        if co is None or prop is None:
            continue
        r = spell_from_records(occ, co, prop, asof)
        if r is None:
            continue
        r["industry_group"] = GROUPS.get((co.get("profile") or {}).get("industryType"), UNKNOWN)
        r["market"] = MARKETS.get(r["market_id"], "Other")
        s = occ["fromDate"][:10]
        r["start"] = pd.Timestamp(s)
        rows.append(r)
    df = pd.DataFrame(rows)
    df["tenant_known"] = 1
    return df


def apply_cutoff(df: pd.DataFrame, cutoff: pd.Timestamp) -> pd.DataFrame:
    """Information available at `cutoff`: drop later starts, censor spells still open at cutoff."""
    d = df[df["start"] < cutoff].copy()
    obs = (cutoff - d["start"]).dt.days / 365.25
    late = d["years"] > obs
    d.loc[late, "etype"] = 0
    d.loc[late, "years"] = obs[late]
    return d[d["years"] > 0].reset_index(drop=True)
