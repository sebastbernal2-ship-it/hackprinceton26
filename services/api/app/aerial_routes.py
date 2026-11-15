"""GET /api/aerial/{listingId}: Vexcel-derived aerial facts with validated error. Read-only."""
import json
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException

router = APIRouter()


def aerial_dir() -> Path:
    return Path(os.environ.get("AERIAL_DIR", "data/derived/triage/aerial/properties"))


@router.get("/api/aerial/{listing_id}")
def aerial(listing_id: int):
    p = aerial_dir() / f"{listing_id}.json"
    if not p.is_file():
        raise HTTPException(status_code=404, detail="no aerial analysis for this listing (unknown, not zero)")
    return json.loads(p.read_text(encoding="utf-8"))
