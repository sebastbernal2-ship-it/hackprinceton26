"""Read-only adapter: local gitignored CoStar CSVs -> SiteFacts. Missing source columns stay unknown."""
from __future__ import annotations

import csv
from pathlib import Path

from .filter import Fact, SiteFacts

SRC = "costar-normalized"


def _num(v: str):
    try:
        return float(v) if v.strip() else None
    except ValueError:
        return None


def load_sites(norm_dir: str | Path) -> list[SiteFacts]:
    d = Path(norm_dir)
    rows = lambda n: list(csv.DictReader((d / n).open(newline="")))
    cand = rows("restaurant-site-candidates.csv")
    comp = {r["property_id"]: r for r in rows("candidate-comparison.csv")}
    cards = rows("factor-cards.csv")
    market = {r["property_id"]: r for r in cards if r["factor_id"] == "property_market"}
    sites = []
    for c in cand:
        pid, facts = c["property_id"], {}
        facts["city"] = Fact(c["city"], "observed", SRC, pid, "", c["city"], "")
        area = _num(comp.get(pid, {}).get("listed_space_area_sqft", ""))
        if area is not None:
            facts["listed_space_area_sqft"] = Fact(area, "observed", SRC, pid, "", c["city"],
                                                   "listed available area; suite identity and freshness unverified")
        n = _num(c["accessible_model_count"])
        if n is not None:
            facts["accessible_model_count"] = Fact(n, "observed", SRC, pid, "", c["city"], "model association only")
        m = market.get(pid)
        if m and m["status"] == "observed" and m["value"]:
            facts["listing_status"] = Fact(m["value"], "observed", m["source"], m["record_id"],
                                           m["retrieved_or_observed_date"], m["geography"], "snapshot status; not freshness-checked")
        # seat_capacity, build_out_cost_*, restaurant_use_permitted: no source -> absent -> unknown
        sites.append(SiteFacts(pid, facts))
    return sites
