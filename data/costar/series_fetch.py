"""Derive candidate quarterly series from the local CoStar kit into data/derived/costar/ (gitignored).

These are KIT-SAMPLE series (properties on CoStar's Matterport list), derived from tenancy and sale records.
They are not CoStar market rent/vacancy/absorption series (the kit has none). Quarters with no observation are
absent, never zero. Usage: python -m data.costar.series_fetch [--out DIR]
"""
from __future__ import annotations

import argparse
import csv
import statistics
from collections import defaultdict
from pathlib import Path

from data.costar import client

COLS = ["metro", "quarter", "series", "n", "value", "unit", "status"]


def build(k: client.KitClient) -> list[dict]:
    lease_n, lease_sf, rates, sale_n, sale_px = (defaultdict(list) for _ in range(5))
    for pid, occs in k.occ.items():
        m = client.MARKETS.get(k.market_of(pid))
        if not m:
            continue
        for o in occs:
            deal = o.get("leaseDeal") or {}
            q = client.quarter(deal.get("commencementDate") or o.get("fromDate"))
            if not q:
                continue
            lease_n[(m, q)].append(1)
            sf = sum(client._num(s.get("squareFeetOccupied")) or 0 for s in o.get("spaces") or [])
            if sf > 0:
                lease_sf[(m, q)].append(sf)
            if (r := client.contract_rate_per_sf_year(deal)):
                rates[(m, q)].append(r)
    seen = set()  # a portfolio sale is indexed under each property; count it once per metro
    for pid, comps in k.comps.items():
        m = client.MARKETS.get(k.market_of(pid))
        for c in comps:
            q = client.quarter(c.get("soldDate"))
            if m and q and (c["id"], m) not in seen:
                seen.add((c["id"], m))
                sale_n[(m, q)].append(1)
                if (c.get("soldForPrice") or 0) > 0 and (c.get("numberOfEntities") or 1) == 1:
                    sale_px[(m, q)].append(c["soldForPrice"])
    rows = []
    for name, d, unit, f in (("lease_commencements", lease_n, "count", len), ("leased_sqft", lease_sf, "sqft", sum),
                             ("contract_rate_median", rates, "usd_per_sf_year", statistics.median),
                             ("sale_comps", sale_n, "count", len),
                             ("sale_price_median", sale_px, "usd", statistics.median)):
        for (m, q), xs in sorted(d.items()):
            rows.append({"metro": m, "quarter": q, "series": name, "n": len(xs), "value": round(f(xs), 2),
                         "unit": unit, "status": "derived"})
    return rows


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(client.REPO / "data/derived/costar"))
    a = ap.parse_args(argv)
    k = client.KitClient()
    if not k.available():
        print("kit not available")
        return 1
    rows = build(k)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    with (out / "kit_quarterly_series.csv").open("w", newline="") as fh:
        w = csv.DictWriter(fh, COLS)
        w.writeheader()
        w.writerows(rows)
    agg = defaultdict(lambda: [0, 0, 99999, 0])
    for r in rows:
        a_ = agg[(r["metro"], r["series"])]
        a_[0] += 1
        a_[2] = min(a_[2], int(r["quarter"][:4]))
        a_[3] = max(a_[3], int(r["quarter"][:4]))
    for (m, s), (n, _, y0, y1) in sorted(agg.items()):
        print(f"{m} {s}: {n} quarters, {y0}-{y1}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
