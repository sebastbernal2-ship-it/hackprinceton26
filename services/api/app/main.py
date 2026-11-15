import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

from . import inspection_routes, pipeline, projections, stubs
from .agent_routes import router as agent_router
from .assets_routes import router as assets_router
from .aerial_routes import router as aerial_router
from .assets_ingest_routes import router as assets_ingest_router
from .costar_routes import router as costar_router
from .costs_routes import router as costs_router
from .triage_routes import router as triage_router
from .lineage_routes import router as lineage_router
from .concepts_routes import router as concepts_router
from .finance_routes import router as finance_router
from .horizons_routes import router as horizons_router
from .loader import load_matches
from .structure_routes import router as structure_router
from .rent_routes import router as rent_router
from .total_cost_routes import router as total_cost_router, brief_size, site_buildout, site_rent
from .demo_routes import router as demo_router
from .reference_media_routes import router as reference_media_router
from .models import (
    AssessRequest, ProjectionsResponse, ReplanRequest, ReplanResponse, ScenarioAssessment,
    Match, MatchesRequest, MatchesResponse, NextQuestionRequest, NextQuestionResponse,
    TourAgentRequest, TourAgentResponse,
)

app = FastAPI(title="Site evidence API")
site_photo_dir = Path(os.environ.get("SITE_PHOTO_DIR", "data/derived/site-photos"))
site_photo_dir.mkdir(parents=True, exist_ok=True)
app.mount("/api/site-photos", StaticFiles(directory=site_photo_dir, check_dir=False), name="site-photos")
app.include_router(inspection_routes.router)
app.include_router(costs_router)
app.include_router(finance_router)
app.include_router(costar_router)
app.include_router(assets_router)
app.include_router(assets_ingest_router)
app.include_router(triage_router)
app.include_router(aerial_router)
app.include_router(lineage_router)
app.include_router(agent_router)
app.include_router(concepts_router)
app.include_router(structure_router)
app.include_router(rent_router)
app.include_router(total_cost_router)
app.include_router(demo_router)
app.include_router(reference_media_router)
app.include_router(horizons_router)


@app.get("/api/health")
def health():
    return {"status": "ok", "dataAvailable": load_matches() is not None,
            "modelsAvailable": projections.models_available()}


@app.post("/api/sites/costs")
def sites_costs(req: MatchesRequest):
    """Build-out and rent estimates for EVERY candidate site (the shortlist shows only the first few). Sized like the
    shortlist: listed space, else the scan's measured floor area, else the size in the brief; unknown when none."""
    pool = load_matches()
    if pool is None:
        return {"dataAvailable": False, "sites": []}
    profile, _ = pipeline.profile_from_brief(req.brief, pool)
    brief_sqft, brief_basis = brief_size(profile)
    sites = []
    for m in pool:
        bo = site_buildout(m.spaceSquareFeet, m.spaceSource or "listing") if m.spaceSquareFeet else site_buildout(brief_sqft, basis=brief_basis or "brief")
        rent = site_rent(m, bo.get("squareFeet"), bo.get("basis"))
        sites.append({"listingId": m.listingId, "address": m.address, "city": m.city, "tourId": m.tourId,
                      "spaceSquareFeet": bo.get("squareFeet"), "spaceBasis": bo.get("basis"), "buildout": bo, "rent": rent})
    sites.sort(key=lambda x: (x["buildout"]["low"] is None, x["buildout"]["low"] or 0, x["listingId"]))
    return {"dataAvailable": True, "sites": sites,
            "notice": "Estimates from stated assumptions (equipment, fit-out per sq ft, 10-20% contingency, rent rate x area), "
                      "not quotes. Scan areas measure the scanned interior, which may not be the suite for lease."}


@app.post("/api/matches", response_model=MatchesResponse)
def matches(req: MatchesRequest):
    pool = load_matches()
    if pool is None:
        return MatchesResponse(dataAvailable=False, matches=[])
    # The brief becomes a profile by keyword/number extraction; sites are tested, never scored.
    profile, why = pipeline.profile_from_brief(req.brief, pool)
    shown, counts, excluded, not_shown = pipeline.shortlist(pool, profile)
    # Build-out is sized by the listed space; when a site lists none, by the size stated in the brief (labelled as such).
    brief_sqft, brief_basis = brief_size(profile)
    for m in shown:
        if m.spaceSquareFeet:
            m.buildout = site_buildout(m.spaceSquareFeet, m.spaceSource or "listing")
        else:
            m.buildout = site_buildout(brief_sqft, basis=brief_basis or "brief")
        m.rent = site_rent(m, m.buildout.get("squareFeet"), m.buildout.get("basis"))
    note = ("Ordered by constraint status (PASS, then UNKNOWN by evidence readiness), not by fit. FAIL sites are excluded "
            "and counted. UNKNOWN means a needed fact is missing, not that the site fails.")
    return MatchesResponse(dataAvailable=True, matches=shown, profile=pipeline.to_parsed(profile, why), counts=counts,
                           excludedCount=excluded, notShownCount=not_shown, note=note)


@app.get("/api/property/{listing_id}", response_model=Match)
def property_(listing_id: int):
    for m in load_matches() or []:
        if m.listingId == listing_id:
            return m
    raise HTTPException(status_code=404, detail="listing not found or data unavailable")


@app.get("/api/property/{listing_id}/projections", response_model=ProjectionsResponse)
def property_projections(listing_id: int):
    if not any(m.listingId == listing_id for m in load_matches() or []):
        raise HTTPException(status_code=404, detail="listing not found or data unavailable")
    return projections.projections_for(listing_id)


@app.post("/api/assess", response_model=ScenarioAssessment)
def assess(req: AssessRequest):
    pool = load_matches()
    if req.listingId is not None and not any(m.listingId == req.listingId for m in pool or []):
        raise HTTPException(status_code=404, detail="listing not found or data unavailable")
    try:
        return pipeline.assess_response(req, projections.models_available(), pool)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.post("/api/replan", response_model=ReplanResponse)
def replan(req: ReplanRequest):
    pool = load_matches()
    if pool is None:
        raise HTTPException(status_code=404, detail="data unavailable")
    try:
        r = pipeline.replan(req, pool)
    except (ValueError, TypeError) as e:
        raise HTTPException(status_code=422, detail=str(e))
    return ReplanResponse(dataAvailable=True, **r)


@app.post("/api/next-question", response_model=NextQuestionResponse)
def next_question(req: NextQuestionRequest):
    return NextQuestionResponse(question=stubs.next_question(req.history))


@app.post("/api/tour-agent", response_model=TourAgentResponse)
def tour_agent(req: TourAgentRequest):
    reply, action = stubs.tour_agent(req.message, req.placedCount)
    return TourAgentResponse(reply=reply, action=action)
