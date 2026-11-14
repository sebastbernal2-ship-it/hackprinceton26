"""Price catalog. Only entries with a public source URL carry prices; the rest stay unknown (None)."""
from __future__ import annotations

import math
from dataclasses import dataclass


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
