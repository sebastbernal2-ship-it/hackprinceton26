"""Typed, cached, rate-limited CoStar access.

Investigation result (2026-11-14): the only CoStar data reachable from this repo is the local kit
(`data/raw/costar/full-kit`). The kit's openapi.yaml has `paths: {}` (record shapes only), no base URL, MCP
definition or CoStar key name exists in docs, .env.example or CI. So `KitClient` (local, read-only) is the working
path. `RemoteClient` is dormant: it only runs if COSTAR_API_BASE_URL and COSTAR_API_KEY are set in the environment
(names only; nothing here reads or prints values) and is UNVERIFIED against any real service.
"""
from __future__ import annotations

import hashlib
import json
import os
import statistics
import time
import urllib.request
from collections import defaultdict
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterator

REPO = Path(__file__).resolve().parents[2]
MARKETS = {14: "houston", 20: "los-angeles"}
PROPERTY_TYPES = {1: "Hospitality", 2: "Industrial", 3: "Land", 5: "Office", 6: "GeneralRetail", 7: "Flex",
                  8: "SportsAndEntertainment", 9: "MixedUse", 10: "Specialty", 11: "Multifamily", 13: "Healthcare",
                  14: "PropertyTypeUnknown", 15: "Residential", 16: "Homes"}
LISTING_STATUS = {1: "Active", 2: "Pending", 3: "OffMarket", 4: "Terminate"}
NOTICE = ("Observed CoStar kit records for properties on CoStar's Matterport capture list (Houston and Los Angeles "
          "cities only). Not market-wide statistics. Missing values are unknown, never zero. Dates are as of CoStar's "
          "last research touch, not real time.")


def kit_dir() -> Path:
    env = os.environ.get("COSTAR_KIT_DIR")
    if env:
        return Path(env)
    for base in (REPO, Path("/home/vorte/code/hackprinceton")):  # worktrees do not carry gitignored data
        p = base / "data/raw/costar/full-kit/data"
        if p.is_dir():
            return p
    return REPO / "data/raw/costar/full-kit/data"


def _jsonl(path: Path) -> Iterator[dict]:
    if not path.is_file():
        return
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                yield json.loads(line)


def _num(v: Any) -> float | None:
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def _day(s: Any) -> str | None:
    return s[:10] if isinstance(s, str) and len(s) >= 10 else None


def quarter(s: Any) -> str | None:
    d = _day(s)
    return f"{d[:4]}Q{(int(d[5:7]) - 1) // 3 + 1}" if d else None


def contract_rate_per_sf_year(deal: dict) -> float | None:
    """rateActual as $/SF/yr only when the basis is stated; unknown basis or non-per-SF amounts stay unknown."""
    r = _num(deal.get("rateActual"))
    if r is None or r <= 0 or deal.get("rateAmountType") != 0:
        return None
    return {1: r * 12, 2: r}.get(deal.get("rateBasis"))


class KitClient:
    """Read-only view over the local kit, indexed by PropertyId. Loaded once per process."""

    def __init__(self, directory: Path | None = None):
        d = directory or kit_dir()
        self.dir = d
        self.props: dict[int, dict] = {}
        for p in _jsonl(d / "commercial-property.jsonl"):
            self.props[p["id"]] = p
        self.listings: dict[int, list] = defaultdict(list)
        for l in _jsonl(d / "commercial-listing-summary.jsonl"):
            self.listings[l.get("propertyId")].append(l)
        self.occ: dict[int, list] = defaultdict(list)
        for o in _jsonl(d / "location-occupancy.jsonl"):
            self.occ[o.get("propertyId")].append(o)
        self.comps: dict[int, list] = defaultdict(list)
        for c in _jsonl(d / "commercial-sale-comp.jsonl"):
            for e in c.get("entities") or []:
                if e.get("propertyId") is not None:
                    self.comps[e["propertyId"]].append(c)
        self.apts = {a["propertyId"]: a for a in _jsonl(d / "apartment-listing.jsonl")}
        need = {o.get("tenantLocationId") for v in self.occ.values() for o in v} - {None}
        self.companies = {c["id"]: c for c in _jsonl(d / "company-detail.jsonl") if c["id"] in need}

    def available(self) -> bool:
        return bool(self.props)

    def market_of(self, pid: int) -> int | None:
        return ((self.props.get(pid) or {}).get("primaryAddress") or {}).get("researchMarketId")

    def extended(self, pid: int) -> dict | None:
        p = self.props.get(pid)
        if p is None:
            return None
        sf = _num(p.get("rentableBuildingAreaSquareFeet")) or _num(p.get("grossBuildingAreaSquareFeet"))
        tenants = []
        for o in sorted(self.occ.get(pid, []), key=lambda o: o.get("fromDate") or "", reverse=True):
            deal = o.get("leaseDeal") or {}
            co = self.companies.get(o.get("tenantLocationId"))
            tenants.append({
                "tenant": co.get("name") if co else None,  # None = unknown tenant, not "vacant"
                "employees": co.get("numEmployees") if co else None,
                "from": _day(o.get("fromDate")), "moveIn": _day(o.get("moveInDate")),
                "signDate": _day(deal.get("signDate")), "expires": _day(deal.get("expirationDate")),
                "sfOccupied": sum(_num(s.get("squareFeetOccupied")) or 0 for s in o.get("spaces") or []) or None,
                "contractRatePerSfYear": contract_rate_per_sf_year(deal), "hasLeaseDeal": bool(deal),
            })
        sales = [{"soldDate": _day(c.get("soldDate")), "price": c.get("soldForPrice") or None,
                  "priceStatus": c.get("salePriceStatus"), "portfolioSale": (c.get("numberOfEntities") or 1) > 1}
                 for c in sorted(self.comps.get(pid, []), key=lambda c: c.get("soldDate") or "", reverse=True)]
        for s in sales:  # a portfolio price covers several properties; never present it as this property's price
            if s["portfolioSale"]:
                s["priceNote"] = "portfolio sale: price covers multiple properties"
        listings = [{"id": l.get("id"), "type": l.get("listingType"), "status": LISTING_STATUS.get(l.get("listingStatus")),
                     "created": _day(l.get("createdDate")), "brokerage": l.get("brokerageCompanyName"),
                     "transactionValue": l.get("transactionValue")} for l in self.listings.get(pid, [])]
        apt = self.apts.get(pid)
        ex = {
            "propertyId": pid,
            "propertyType": PROPERTY_TYPES.get(p.get("propertyType"), "Unknown"),
            "researchMarketId": self.market_of(pid), "primarySubmarketId": p.get("primarySubmarketId"),
            "buildingClass": p.get("buildingClass"), "buildingRating": p.get("buildingRating"),
            "areaSqft": sf, "tenancies": tenants, "saleComps": sales, "listings": listings,
            "apartment": ({"minRent": apt.get("minRent"), "maxRent": apt.get("maxRent"),
                           "unitsAvailable": apt.get("numUnitsAvailable"), "totalUnits": apt.get("totalNumUnits")}
                          if apt else None),
            "status": "observed", "source": "CoStar kit (local)", "notice": NOTICE,
        }
        ex["fill"] = {k: bool(ex[k]) for k in ("tenancies", "saleComps", "listings", "apartment")}
        return ex

    def market(self, market_id: int) -> dict:
        ids = [i for i in self.props if self.market_of(i) == market_id]
        by_type: dict[str, int] = defaultdict(int)
        subs = set()
        for i in ids:
            by_type[PROPERTY_TYPES.get(self.props[i].get("propertyType"), "Unknown")] += 1
            if self.props[i].get("primarySubmarketId") is not None:
                subs.add(self.props[i]["primarySubmarketId"])
        rates = [r for i in ids for o in self.occ.get(i, []) if (r := contract_rate_per_sf_year(o.get("leaseDeal") or {}))]
        prices = [c["soldForPrice"] for i in ids for c in self.comps.get(i, []) if (c.get("soldForPrice") or 0) > 0
                  and (c.get("numberOfEntities") or 1) == 1]
        asks = [a["minRent"] for i in ids if (a := self.apts.get(i)) and (a.get("minRent") or 0) > 0]

        def stat(xs):
            return {"n": len(xs), "median": statistics.median(xs) if xs else None}
        return {"marketId": market_id, "metro": MARKETS.get(market_id), "properties": len(ids),
                "propertiesByType": dict(by_type), "submarkets": len(subs),
                "tenancies": sum(len(self.occ.get(i, [])) for i in ids),
                "saleComps": len({c["id"] for i in ids for c in self.comps.get(i, [])}),
                "contractRatePerSfYear": stat(rates), "singlePropertySalePriceUsd": stat(prices),
                "apartmentMinAskingRentUsd": stat(asks),
                "status": "derived", "notice": NOTICE + " Medians are over the kit sample, not CoStar market rent, "
                "vacancy or absorption (the kit has none)."}


@lru_cache(maxsize=1)
def kit() -> KitClient:
    return KitClient()


class RemoteClient:
    """Dormant HTTP client: disk-cached, min-interval rate limited, key from env by NAME. Unverified."""
    KEY_ENV, BASE_ENV = "COSTAR_API_KEY", "COSTAR_API_BASE_URL"

    def __init__(self, cache_dir: Path | None = None, min_interval: float = 1.0, opener=urllib.request.urlopen):
        self.cache = cache_dir or REPO / "data/derived/costar/cache"
        self.min_interval, self.opener, self._last = min_interval, opener, 0.0

    def configured(self) -> bool:
        return bool(os.environ.get(self.KEY_ENV) and os.environ.get(self.BASE_ENV))

    def get(self, path: str) -> dict | None:
        if not self.configured():
            return None
        f = self.cache / (hashlib.sha256(path.encode()).hexdigest()[:24] + ".json")
        if f.is_file():
            return json.loads(f.read_text())
        wait = self.min_interval - (time.monotonic() - self._last)
        if wait > 0:
            time.sleep(wait)
        req = urllib.request.Request(os.environ[self.BASE_ENV].rstrip("/") + "/" + path.lstrip("/"),
                                     headers={"Authorization": "Bearer " + os.environ[self.KEY_ENV]})
        self._last = time.monotonic()
        with self.opener(req, timeout=20) as r:
            data = json.loads(r.read())
        self.cache.mkdir(parents=True, exist_ok=True)
        f.write_text(json.dumps(data))
        return data
