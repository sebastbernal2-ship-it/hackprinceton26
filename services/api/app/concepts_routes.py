"""GET /api/concepts, GET /api/concepts/{id}, POST /api/reskin: swap a space from one cuisine concept to another."""
import sys
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ValidationError

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from assets.restyle import engine  # noqa: E402

from .loader import load_matches  # noqa: E402

router = APIRouter()
SQFT_PER_SEAT = 15.0   # ASSUMPTION: common planning ratio for dining area, not a code figure
KITCHEN_SHARE = 0.3    # ASSUMPTION: kitchen takes ~30% of floor area
SQFT_TO_M2 = 0.092903


class Layout(BaseModel):
    seats: int | None = None
    room: dict | None = None
    placements: list[dict]


class ReskinRequest(BaseModel):
    listingId: int | None = None
    layout: Layout | None = None
    fromConcept: str
    toConcept: str
    seats: int | None = None


@router.get("/api/concepts")
def list_concepts():
    out = []
    for cid in engine.list_concepts():
        c = engine.load_concept(cid)
        out.append({"id": cid, "name": c["name"], "equipmentCount": len(c["equipment"]), "status": c["status"]})
    return out


@router.get("/api/concepts/{cid}")
def get_concept(cid: str):
    try:
        return engine.load_concept(cid)
    except KeyError:
        raise HTTPException(status_code=404, detail="concept not found")


@router.post("/api/reskin")
def reskin(req: ReskinRequest):
    for c in (req.fromConcept, req.toConcept):
        if c not in engine.list_concepts():
            raise HTTPException(status_code=404, detail=f"concept {c!r} not found")
    if (req.listingId is None) == (req.layout is None):
        raise HTTPException(status_code=422, detail="give exactly one of listingId or layout")
    note = None
    if req.layout is not None:
        layout = req.layout.model_dump()
        if req.seats is not None:
            layout["seats"] = req.seats
    else:
        m = next((m for m in load_matches() or [] if m.listingId == req.listingId), None)
        if m is None:
            raise HTTPException(status_code=404, detail="listing not found or data unavailable")
        seats = req.seats
        room = None
        if m.squareFeet:
            if seats is None:
                seats = int(m.squareFeet * (1 - KITCHEN_SHARE) / SQFT_PER_SEAT)
            ka = m.squareFeet * KITCHEN_SHARE * SQFT_TO_M2
            w = (ka * 1.5) ** 0.5
            room = {"w": round(w, 2), "d": round(ka / w, 2)}
        layout = engine.synthesize_layout(engine.load_concept(req.fromConcept), seats, room)
        note = ("The listing's real layout is not known. A reference layout was generated from the fromConcept profile "
                "(kitchen area = 30% of square feet, 15 sq ft per seat: both assumptions) and then reskinned.")
    try:
        res = engine.reskin(layout, req.fromConcept, req.toConcept)
    except (ValidationError, ValueError, KeyError) as e:
        raise HTTPException(status_code=422, detail=str(e))
    if note:
        res["layoutNote"] = note
    return res
