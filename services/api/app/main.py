import re

from fastapi import FastAPI, HTTPException

from . import inspection_routes, projections, stubs
from .loader import load_matches
from .models import (
    AssessRequest, ProjectionsResponse, ScenarioAssessment,
    Match, MatchesRequest, MatchesResponse, NextQuestionRequest, NextQuestionResponse,
    TourAgentRequest, TourAgentResponse,
)

app = FastAPI(title="Site evidence API")
app.include_router(inspection_routes.router)
LIMIT = 3


@app.get("/api/health")
def health():
    return {"status": "ok", "dataAvailable": load_matches() is not None,
            "modelsAvailable": projections.models_available()}


@app.post("/api/matches", response_model=MatchesResponse)
def matches(req: MatchesRequest):
    pool = load_matches()
    if pool is None:
        return MatchesResponse(dataAvailable=False, matches=[])
    # No fit ranking: the brief only narrows by an explicitly named city. Stable id order.
    said = " ".join(e.answer for e in req.brief).lower()
    named = [c for c in {m.city.split(",")[0].lower() for m in pool} if c and re.search(rf"\b{re.escape(c)}\b", said)]
    chosen = [m for m in pool if m.city.split(",")[0].lower() in named] if named else pool
    return MatchesResponse(dataAvailable=True, matches=chosen[:LIMIT])


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
    return projections.assess(req)


@app.post("/api/next-question", response_model=NextQuestionResponse)
def next_question(req: NextQuestionRequest):
    return NextQuestionResponse(question=stubs.next_question(req.history))


@app.post("/api/tour-agent", response_model=TourAgentResponse)
def tour_agent(req: TourAgentRequest):
    reply, action = stubs.tour_agent(req.message, req.placedCount)
    return TourAgentResponse(reply=reply, action=action)
