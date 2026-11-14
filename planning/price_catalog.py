"""Price catalog. Only entries with a public source URL carry prices; the rest stay unknown (None)."""
from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class CatalogItem:
    item_id: str
    name: str
    unit: str
    price_low: float | None = None
    price_high: float | None = None
    source_url: str = ""
    as_of: str = ""  # ISO date the price was observed
    geography: str = ""
    limitations: str = ""
    status: str = "observed"  # "observed" | "estimated"; estimated items use source_url "estimate://..."

    def __post_init__(self):
        if (self.price_low is None) != (self.price_high is None):
            raise ValueError(f"{self.item_id}: low and high must both be set or both None")
        if self.price_low is not None:
            if self.price_low < 0 or self.price_low > self.price_high:
                raise ValueError(f"{self.item_id}: need 0 <= low <= high")
            if not self.source_url or not self.as_of:
                raise ValueError(f"{self.item_id}: priced items need source_url and as_of")

    @property
    def known(self) -> bool:
        return self.price_low is not None


@dataclass(frozen=True)
class TieredFeeSchedule:
    """Fee = base + rate per $1,000 (or fraction) above tier floor; valuation <= first floor pays flat minimum."""
    name: str
    minimum_fee: float
    tiers: tuple[tuple[float, float, float], ...]  # (floor, base_fee, rate_per_1000), ascending floor
    plan_review_fraction: float
    source_url: str
    as_of: str
    effective_date: str | None
    geography: str
    limitations: str

    def permit_fee(self, valuation: float) -> float:
        if valuation < 0:
            raise ValueError("valuation must be >= 0")
        if valuation <= self.tiers[0][0]:
            return self.minimum_fee
        floor, base, rate = [t for t in self.tiers if t[0] < valuation][-1]
        return base + rate * math.ceil((valuation - floor) / 1000.0)

    def total_fee(self, valuation: float) -> float:
        fee = self.permit_fee(valuation)
        return fee * (1 + self.plan_review_fraction)


# Source: City of Webster, TX commercial building permit fee schedule page, retrieved 2026-11-14.
# The page states no effective date. One city only; not representative of any other jurisdiction.
WEBSTER_TX_COMMERCIAL = TieredFeeSchedule(
    name="Webster TX commercial building permit + plan review",
    minimum_fee=15.0,
    tiers=((1000.0, 15.0, 5.0), (50000.0, 260.0, 4.0), (100000.0, 460.0, 3.0), (500000.0, 1660.0, 2.0)),
    plan_review_fraction=0.5,
    source_url="https://www.webstertx.gov/1159/Building-Permit-Fee-Schedule",
    as_of="2026-11-14",
    effective_date=None,
    geography="Webster, TX (one city; not transferable)",
    limitations="Permit + plan review only; excludes trade permits, impact/utility fees, health/fire review. Effective date not stated on page.",
)

_VENDOR = "WebstaurantStore search listing, one retail list price; range across models/vendors not established"
ITEMS: dict[str, CatalogItem] = {i.item_id: i for i in [
    CatalogItem("reach_in_refrigerator_2door", "Two-section solid-door reach-in refrigerator (Beverage-Air HBR44HC-1, 47in)", "each",
                5717.21, 5717.21, "https://www.webstaurantstore.com/search/commercial-reach-in-refrigerator.html", "2026-11-14",
                "US online list price", _VENDOR + "; low == high is a single listing, not a market range; excludes freight/install"),
    CatalogItem("commercial_hood_and_suppression", "Type I hood with fire suppression, installed", "each"),
    CatalogItem("grease_interceptor", "Grease interceptor, installed", "each"),
    CatalogItem("three_compartment_sink", "Three-compartment sink, installed", "each"),
    CatalogItem("handwash_sink", "Handwash sink, installed", "each"),
    CatalogItem("floor_finish", "Food-grade flooring", "sqft"),
    CatalogItem("electrical_service_upgrade", "Electrical service upgrade", "each"),
    CatalogItem("architect_design_fee", "Architect / MEP design", "lump_sum"),
    CatalogItem("gelato_display_case", "Gelato display case", "each"),
]}


def get(item_id: str) -> CatalogItem:
    return ITEMS[item_id]


FINANCIAL_CATALOG_PATH = Path(__file__).resolve().parent.parent / "data" / "financial" / "catalog.json"
ESTIMATE_URL = "estimate://neutral-band-v1"


def load_financial_json(path: Path | None = None) -> dict:
    return json.loads((path or FINANCIAL_CATALOG_PATH).read_text(encoding="utf-8"))


def band(reference: float, kind: str, data: dict) -> tuple[float, float, float]:
    """Neutral estimate band (low, expected, high); same multipliers for every site."""
    b = data["estimateMethod"][kind]
    return reference * b["low"], reference * b["expected"], reference * b["high"]


def equipment_subtotal(data: dict) -> float:
    return sum(e["listPrice"] * e.get("defaultQuantity", 1) for e in data["equipment"])


def load_financial_catalog(path: Path | None = None) -> dict[str, CatalogItem]:
    """Equipment, install allowance and repair unit costs from data/financial/catalog.json as CatalogItems.

    Separate from ITEMS so the core catalog keeps its 'only sourced prices' invariant. Observed items have
    low == high == the page price; estimated items carry the neutral band. Unknown repair categories stay unpriced."""
    d = load_financial_json(path)
    out: dict[str, CatalogItem] = {}
    for e in d["equipment"]:
        if e["priceStatus"] == "observed":
            lo = ex = hi = e["listPrice"]
        else:
            lo, ex, hi = band(e["listPrice"], "costBand", d)
        out[e["id"]] = CatalogItem(e["id"], f'{e["label"]} ({e["manufacturer"]} {e["model"]})', "each", lo, hi,
                                   e["vendorUrl"] if e["priceStatus"] == "observed" else ESTIMATE_URL, d["asOf"],
                                   "US online list price", e["priceNote"], e["priceStatus"])
    ia = d["installAllowance"]
    lo, _, hi = band(ia["referenceFractionOfEquipment"] * equipment_subtotal(d), "costBand", d)
    out[ia["id"]] = CatalogItem(ia["id"], ia["label"], "lump_sum", lo, hi, ESTIMATE_URL, d["asOf"], "", ia["rationale"], "estimated")
    for r in d["repairUnitCosts"]:
        iid = f'repair:{r["category"]}'
        if r["status"] == "unknown":
            out[iid] = CatalogItem(iid, r["label"], r["unit"], limitations=r["rationale"], status="estimated")
        elif r["status"] == "observed":
            out[iid] = CatalogItem(iid, r["label"], r["unit"], r["low"], r["high"], r["sourceUrl"], d["asOf"], "residential published range", r["rationale"], "observed")
        else:
            lo, _, hi = band(r["reference"], "costBand", d)
            out[iid] = CatalogItem(iid, r["label"], r["unit"], lo, hi, ESTIMATE_URL, d["asOf"], "", r["rationale"], "estimated")
    return out
