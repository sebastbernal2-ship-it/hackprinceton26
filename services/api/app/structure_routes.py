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

from . import analyses, demo_fixture  # noqa: E402

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
    fx = demo_fixture.get(listing_id)
    p = demo_fixture.structure_props(fx) if fx else (props or {}).get(str(listing_id))
    if p is None:  # a scan the snapshot lacks: demo-labelled props from the linked CoStar record (or the metro alone)
        p = analyses.structure_props(listing_id)
    if p is None and props is None:
        raise HTTPException(status_code=503, detail="structure snapshot unavailable (run structure/fetch_sources.py)")
    if p is None:
        raise HTTPException(status_code=404, detail="listing not found in structure snapshot")
    return p, props or {}


@router.get("/api/structure/{listing_id}")
def structure(listing_id: int):
    p, props = _prop(listing_id)
    s = screening.screen(p)
    fx = demo_fixture.get(listing_id)
    sub = ((f"DEMO DATA: about {p['geotech']['subsidenceInPerYear']} in/yr regional subsidence prior; {p['geotech']['soils']}; no parcel borings")
           if fx and p.get("geotech") else "unknown: no reachable public Harris County subsidence layer found")
    return {"listingId": listing_id, "kit": {k: p.get(k) for k in ("yearBuilt", "renovatedYear", "material", "buildingClass", "stories", "grossSqFt", "heightFt", "hasSprinklers")},
            "hazards": {"fema": p.get("fema"), "usgs": p.get("usgs"), "elevationFt": p.get("elevationFt"), "retrieved": p.get("retrieved"),
                        "subsidence": sub},
            "screening": s, "fillRates": screening.fill_rates(props), "label": "screening prior, not an engineering assessment",
            **({"demo": True, "demoNote": p.get("demoNote")} if p.get("demo") else {})}


@router.get("/api/structure/{listing_id}/scenarios")
def structure_scenarios(listing_id: int):
    p, _ = _prop(listing_id)
    reg = screening.region(p.get("city"), p.get("state"))
    fetch = _load("climate_fetch.json")
    out = {"listingId": listing_id, "region": reg, "table": scenarios.table(fetch, reg),
           "exposure": scenarios.exposure(p, fetch, reg), "climate": scenarios.metrics(listing_id, p, fetch, reg), "label": "scenario analysis, not a forecast"}
    fx = demo_fixture.get(listing_id)
    if fx:
        out["climate"] = demo_fixture.climate_metrics(fx, out["climate"])
        out["demoClimate"] = fx["climate"]
    return out


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
        try:
            p, _ = _prop(req.listingId)
        except HTTPException:
            p = None  # snapshot missing or listing absent: the sample-plan run proceeds with unknown (never defaulted) signals
    city = req.city or (p or {}).get("city")
    state = req.state or (p or {}).get("state")
    if not req.plan.get("rooms"):
        raise HTTPException(status_code=422, detail="plan has no rooms")
    exp = expansion.candidates(req.plan, req.baseRoomIds, expansion.co_star_signals(p))
    lines = financials.all_lines(city, state, {})
    return {"expansion": exp, "timeline": expansion.timeline(lines, exp), "label": "scenario analysis, not a forecast"}
