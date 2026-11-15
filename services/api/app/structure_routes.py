"""Structure lens: screening prior, climate scenario exposure, expansion optionality + growth timeline.

Screening priors and scenario analysis only; not engineering assessments or forecasts. Reads local snapshots written by
structure/fetch_sources.py (STRUCTURE_DIR, default data/derived/structure); absent data -> unknown, never defaults.
"""
import json
import os
import sys
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from planning import financials  # noqa: E402
from structure import expansion, scenarios, screening  # noqa: E402

router = APIRouter()


def _dir() -> Path:
    return Path(os.environ.get("STRUCTURE_DIR", "data/derived/structure"))


def _load(name):
    f = _dir() / name
    try:
        return json.loads(f.read_text(encoding="utf-8")) if f.is_file() else None
    except (OSError, ValueError):
        return None


def _prop(listing_id: int):
    props = _load("properties.json")
    if props is None:
        raise HTTPException(status_code=404, detail="structure snapshot unavailable (run structure/fetch_sources.py)")
    p = props.get(str(listing_id))
    if p is None:
        raise HTTPException(status_code=404, detail="listing not found in structure snapshot")
    return p, props


@router.get("/api/structure/{listing_id}")
def structure(listing_id: int):
    p, props = _prop(listing_id)
    s = screening.screen(p)
    return {"listingId": listing_id, "kit": {k: p.get(k) for k in ("yearBuilt", "renovatedYear", "material", "buildingClass", "stories", "grossSqFt", "heightFt", "hasSprinklers")},
            "hazards": {"fema": p.get("fema"), "usgs": p.get("usgs"), "elevationFt": p.get("elevationFt"), "retrieved": p.get("retrieved"),
                        "subsidence": "unknown: no reachable public Harris County subsidence layer found"},
            "screening": s, "fillRates": screening.fill_rates(props), "label": "screening prior, not an engineering assessment"}


@router.get("/api/structure/{listing_id}/scenarios")
def structure_scenarios(listing_id: int):
    p, _ = _prop(listing_id)
    reg = screening.region(p.get("city"), p.get("state"))
    fetch = _load("climate_fetch.json")
    return {"listingId": listing_id, "region": reg, "table": scenarios.table(fetch, reg),
            "exposure": scenarios.exposure(p, fetch, reg), "label": "scenario analysis, not a forecast"}


class ExpansionRequest(BaseModel):
    listingId: int | None = None
    plan: dict
    baseRoomIds: list[str | int]
    city: str | None = None
    state: str | None = None


@router.post("/api/structure/expansion")
def structure_expansion(req: ExpansionRequest):
    p = None
    if req.listingId is not None:
        p, _ = _prop(req.listingId)
    city = req.city or (p or {}).get("city")
    state = req.state or (p or {}).get("state")
    if not req.plan.get("rooms"):
        raise HTTPException(status_code=422, detail="plan has no rooms")
    exp = expansion.candidates(req.plan, req.baseRoomIds, expansion.co_star_signals(p))
    lines = financials.all_lines(city, state, {})
    return {"expansion": exp, "timeline": expansion.timeline(lines, exp), "label": "scenario analysis, not a forecast"}
