"""GET /api/rent/summary, GET /api/rent/{listingId}: hedonic asking-rent ESTIMATE from forecasting/rent artifacts.

Reads forecasting/artifacts/rent/{predictions,report}.json (gitignored; produced by `python -m forecasting.rent.run`).
Segments that failed their validation gate have no predictions: the endpoint returns an `unknown` card, never a number.
"""
import json
import math
import os
from pathlib import Path

from fastapi import APIRouter

from .models import ProjectionCard

router = APIRouter()
ROOT = Path(__file__).resolve().parents[3]
LABEL = "scenario/estimate: hedonic regression on CoStar-kit asking rents, not a market appraisal or guarantee"


def _dir() -> Path:
    return Path(os.environ.get("RENT_ARTIFACT_DIR") or ROOT / "forecasting" / "artifacts" / "rent")


def _finite(obj):
    """NaN/inf (undefined metrics of a thin segment) become None: Starlette rejects non-finite floats."""
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if isinstance(obj, dict):
        return {k: _finite(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_finite(v) for v in obj]
    return obj


def _load(name: str):
    try:
        return _finite(json.loads((_dir() / name).read_text()))
    except (OSError, ValueError):
        return None


def _unknown(reason: str, listing_id=None) -> dict:
    card = ProjectionCard(kind="scenario", status="unknown", metric="expected asking rent", horizon="current listing",
                          scenario="hedonic estimate unavailable", unit="USD/sf/yr",
                          method="No estimate: " + reason).model_dump(mode="json")
    return {"listingId": listing_id, "card": card, "flag": "unknown", "label": LABEL, "reason": reason}


@router.get("/api/rent/summary")
def rent_summary():
    rep, preds = _load("report.json"), _load("predictions.json")
    if rep is None:
        return {"status": "unknown", "label": LABEL, "reason": "rent model has not been run (no report artifact)", "segments": {}}
    flags: dict = {}
    for p in (preds or {}).values():
        if p.get("status") == "estimated":
            flags[p["flag"]] = flags.get(p["flag"], 0) + 1
    segs = {k: {"n": v["n_segment"], "gatePassed": v["gate"]["passed"], "gate": v["gate"],
                "spatialCv": v["spatial"]["model"], "temporalHoldout": v["temporal"]["model"],
                "baselines": {"spatial": {b: v["spatial"][b] for b in ("submarket_median", "metro_median")},
                              "temporal": {b: v["temporal"][b] for b in ("submarket_median", "metro_median")}}}
            for k, v in rep["segments"].items()}
    return {"status": "estimated" if preds else "unknown", "label": LABEL, "nRated": rep.get("n_rated"),
            "nEmitted": sum(1 for p in (preds or {}).values() if p.get("status") == "estimated"), "flagCounts": flags,
            "gate": rep.get("gate_definition"), "segments": segs}


@router.get("/api/rent/{listing_id}")
def rent_for_listing(listing_id: int):
    from . import demo_fixture
    if (fx := demo_fixture.get(listing_id)):
        return demo_fixture.rent_response(fx)
    preds = _load("predictions.json")
    if preds is None:
        return _unknown("rent model artifacts are missing", listing_id)
    p = preds.get(str(listing_id))
    if p is None:
        return _unknown("no estimate for this listing: its metro segment failed or is outside the validated gate", listing_id)
    if p["status"] != "estimated":
        return _unknown(p.get("reason", "segment failed validation"), listing_id)
    card = ProjectionCard(
        kind="fitted", status="estimated", metric="expected asking rent (building-based)", horizon="current listing",
        scenario="hedonic estimate; asking rents, not contract rents", point=p["expectedRentPerSfYear"], lower=p["lower80"],
        upper=p["upper80"], unit="USD/sf/yr", method=p["method"], trainingWindow=p["trainingWindow"],
        validation=p["validation"]).model_dump(mode="json")
    return {"listingId": listing_id, "card": card, "asking": p["askingRentPerSfYear"], "flag": p["flag"],
            "flagMeaning": "asking priced above/below the 80% interval of the building-based expectation; an estimate, not a verdict",
            "expectationSource": p["expectationSource"], "contributions": p["contributions"], "label": LABEL}
