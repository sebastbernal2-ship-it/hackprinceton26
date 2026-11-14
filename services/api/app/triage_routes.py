"""Record triage: GET /api/triage/summary, /api/triage/property/{listingId}, /api/triage/queue.

Reads precomputed output of `python -m triage.reconcile.run` (data/derived/triage/{results,summary,queue}.json;
override dir with TRIAGE_DERIVED_DIR). Read-only. Screening triage, not an engineering assessment.
"""
import json
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

router = APIRouter()
NOTICE = ("Screening triage of CoStar record fields using Matterport and aerial evidence. Not an engineering assessment, "
          "not a statement that CoStar is wrong; scope-mismatched comparisons give no verdict. Confidence labels are rule-based, "
          "not probabilities. Unknown is never zero.")


def derived_dir() -> Path:
    return Path(os.environ.get("TRIAGE_DERIVED_DIR", "data/derived/triage"))


def _load(name: str):
    p = derived_dir() / name
    if not p.exists():
        return None
    with p.open(encoding="utf-8") as fh:
        return json.load(fh)


def _need(name: str):
    d = _load(name)
    if d is None:
        raise HTTPException(status_code=503, detail=f"triage output {name} not built; run python -m triage.reconcile.run")
    return d


@router.get("/api/triage/summary")
def summary():
    return {"notice": NOTICE, **_need("summary.json")}


@router.get("/api/triage/property/{listing_id}")
def property_triage(listing_id: str):
    for r in _need("results.json"):
        if r["listingId"] == str(listing_id):
            return {"notice": NOTICE, **r}
    raise HTTPException(status_code=404, detail="no triage result for this listing")


@router.get("/api/triage/queue")
def queue(limit: int = Query(25, ge=1, le=500), field: str | None = None, status: str | None = None):
    q = _need("queue.json")
    if field:
        q = [x for x in q if x["field"] == field]
    if status:
        q = [x for x in q if x["status"] == status]
    return {"notice": NOTICE, "total": len(q), "items": q[:limit]}
