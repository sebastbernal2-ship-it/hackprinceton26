from fastapi import FastAPI, HTTPException

from . import inspection_routes, pipeline, projections, stubs
from .assets_routes import router as assets_router
from .assets_ingest_routes import router as assets_ingest_router
from .costs_routes import router as costs_router
from .loader import load_matches
from .structure_routes import router as structure_router
from .models import (
    AssessRequest, ProjectionsResponse, ReplanRequest, ReplanResponse, ScenarioAssessment,
    Match, MatchesRequest, MatchesResponse, NextQuestionRequest, NextQuestionResponse,
    TourAgentRequest, TourAgentResponse,
)

app = FastAPI(title="Site evidence API")
app.include_router(inspection_routes.router)
app.include_router(costs_router)
app.include_router(assets_router)
app.include_router(assets_ingest_router)
app.include_router(structure_router)


@app.get("/api/health")
def health():
    return {"status": "ok", "dataAvailable": load_matches() is not None,
            "modelsAvailable": projections.models_available()}


@app.post("/api/matches", response_model=MatchesResponse)
def matches(req: MatchesRequest):
    pool = load_matches()
    if pool is None:
        return MatchesResponse(dataAvailable=False, matches=[])
    # The brief becomes a profile by keyword/number extraction; sites are tested, never scored.
    profile, why = pipeline.profile_from_brief(req.brief, pool)
    shown, counts, excluded, not_shown = pipeline.shortlist(pool, profile)
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
