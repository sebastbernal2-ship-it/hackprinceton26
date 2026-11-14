"""ProjectionCard-compatible dicts. Descriptive market priors only; never per-site predictions."""
from __future__ import annotations

LABEL = "exploratory descriptive market prior - not a per-site success prediction"
PTYPE = {"office": 5, "multifamily": 11, "retail": 6}
MIN_SEGMENT = 30


def card(segment: str, market: str, horizon: int, point, lower, upper, n, n_fail, validation, window, asof, limits):
    lo, hi = min(lower, point), max(upper, point)
    return {
        "kind": "fitted",
        "status": "estimated",
        "metric": f"Share of food-and-beverage tenancies in {segment} space ending in recorded closure or bankruptcy within {horizon} year(s) of start (cumulative incidence)",
        "horizon": f"{horizon} year(s) from tenancy start",
        "scenario": LABEL,
        "point": round(float(point), 4),
        "lower": round(float(lo), 4),
        "upper": round(float(hi), 4),
        "unit": "proportion",
        "method": (
            f"{LABEL}. Cause-specific Cox models (failure; other exits as a competing risk) on CoStar tenancy spells, "
            f"standardized over the {n} spells in this segment ({n_fail} recorded failures). Interval is a 95% percentile bootstrap "
            "resampling properties. Descriptive of past market tenancies, not a forecast and not a prediction for any site. "
            "Failure is CoStar's expirationReason ClosedLocationOrBankrupt; MovingOutNewAddressUnknown is not failure."
        ),
        "citation": {
            "source": "CoStar hackathon kit (location-occupancy, company-detail, commercial-property)",
            "recordId": f"survival-segment:{market}:{segment}",
            "asOf": asof,
            "geography": market,
            "limitations": limits,
        },
        "trainingWindow": window,
        "validation": validation,
    }
