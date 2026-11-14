import re

from fastapi import FastAPI, HTTPException

from . import stubs
from .loader import load_matches
from .models import (
    Match, MatchesRequest, MatchesResponse, NextQuestionRequest, NextQuestionResponse,
    TourAgentRequest, TourAgentResponse,
)

app = FastAPI(title="Site evidence API")
LIMIT = 3


@app.get("/api/health")
def health():
    return {"status": "ok", "dataAvailable": load_matches() is not None}


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


@app.post("/api/next-question", response_model=NextQuestionResponse)
def next_question(req: NextQuestionRequest):
    return NextQuestionResponse(question=stubs.next_question(req.history))


@app.post("/api/tour-agent", response_model=TourAgentResponse)
def tour_agent(req: TourAgentRequest):
    reply, action = stubs.tour_agent(req.message, req.placedCount)
    return TourAgentResponse(reply=reply, action=action)
