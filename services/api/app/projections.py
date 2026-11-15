"""Projections. No validated models exist yet, so every listing gets deterministic DEMO scenario cards.

The numbers are placeholders derived from listingId + square footage so candidates differ. They are labelled
"demo estimate" everywhere, are never observed, and carry kind=scenario (no citation or backtest is claimed)."""
import hashlib
import os
from typing import Optional

from .models import SCENARIO_LABEL, ProjectionCard, ProjectionsResponse

HORIZONS = [("12m", "12 months"), ("3_5y", "3-5 years"), ("2030", "2030")]
SCENARIO = "base case (demo estimate)"
METHOD = ("DEMO ESTIMATE, not a forecast and not observed: a deterministic placeholder derived from the listing id and size "
          "so candidates differ. Replace with validated models before relying on it.")
# metric, unit, base point per horizon, base half-range per horizon, spread driven by size, decimals
METRICS = [
    ("rent per sq ft growth", "%/yr", (2.8, 3.2, 3.6), (1.4, 2.2, 3.0), 1),
    ("vacancy rate", "%", (6.5, 7.2, 7.8), (1.5, 2.6, 3.6), 1),
    ("foot traffic change", "% vs today", (2.0, 5.5, 9.0), (3.0, 6.0, 9.0), 1),
    ("build-out cost trend", "%/yr", (4.0, 3.5, 3.0), (1.6, 2.4, 3.2), 1),
]


def models_available() -> bool:
    """Flag only. Set MODELS_AVAILABLE=1 once validated models are wired in."""
    return os.environ.get("MODELS_AVAILABLE", "").lower() in {"1", "true", "yes"}


def visible(cards: list[ProjectionCard]) -> list[ProjectionCard]:
    return [c for c in cards if not c.hidden]


def _u(*parts) -> float:
    """Deterministic value in [-1, 1] from the parts."""
    h = hashlib.sha256("|".join(map(str, parts)).encode()).digest()
    return int.from_bytes(h[:4], "big") / 2**31 - 1


def demo_cards(listing_id: int, sqft: Optional[int] = None) -> list[ProjectionCard]:
    size = max(0, sqft or 0)
    size_tilt = min(1.0, size / 5000.0) - 0.5  # bigger space: slightly softer rent, higher vacancy
    cards = []
    for metric, unit, pts, halves, dec in METRICS:
        shift = _u(listing_id, size, metric)
        for i, (hid, hlabel) in enumerate(HORIZONS):
            sign = {"rent per sq ft growth": -1, "vacancy rate": 1, "foot traffic change": -1, "build-out cost trend": 0.3}[metric]
            point = pts[i] + 1.2 * shift * (1 + i * 0.5) + sign * size_tilt * 0.8
            half = halves[i] * (1 + 0.25 * _u(listing_id, size, metric, hid))
            lo, hi = point - half, point + half
            if metric == "vacancy rate":
                lo, point, hi = max(0.5, lo), max(0.8, point), max(1.1, hi)
            r = lambda v: round(v, dec)
            lo, point, hi = r(lo), r(point), r(hi)
            cards.append(ProjectionCard(kind="scenario", status="estimated", metric=metric, horizon=hlabel, scenario=SCENARIO,
                                        point=point, lower=min(lo, point), upper=max(hi, point), unit=unit, method=METHOD))
    return cards


def projections_for(listing_id: int, sqft: Optional[int] = None) -> ProjectionsResponse:
    cards = demo_cards(listing_id, sqft)
    return ProjectionsResponse(listingId=listing_id, modelsAvailable=models_available(), projections=cards,
                               note=f"{SCENARIO_LABEL}. Demo estimates only: no validated model is wired in yet.")
