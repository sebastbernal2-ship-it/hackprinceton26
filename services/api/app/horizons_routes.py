"""GET /api/horizons/{listingId}: per-property horizon table (observed / fitted / published / cannot_say / pending)."""
import sys
from pathlib import Path

from fastapi import APIRouter, HTTPException

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from forecasting.horizons import build  # noqa: E402

router = APIRouter()


@router.get("/api/horizons/{listing_id}")
def horizons(listing_id: int):
    t = build.table_for(listing_id, build.load_context(), build.ptypes_from_candidates())
    if t is None:
        raise HTTPException(status_code=404, detail="listing not found in structure snapshot (run structure/fetch_sources.py)")
    return t
