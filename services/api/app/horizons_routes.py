"""GET /api/horizons/{listingId}: per-property horizon table (observed / fitted / published / cannot_say / pending)."""
import sys
from pathlib import Path

from fastapi import APIRouter, HTTPException

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from forecasting.horizons import build  # noqa: E402
from . import demo_fixture
from .loader import load_matches  # noqa: E402
from .models import SCENARIO_LABEL  # noqa: E402
from .projections import demo_cards  # noqa: E402

router = APIRouter()


@router.get("/api/horizons/{listing_id}")
def horizons(listing_id: int):
    m = next((m for m in load_matches() or [] if m.listingId == listing_id), None)
    t = build.table_for(listing_id, build.load_context(), build.ptypes_from_candidates())
    if t is None and m is None:
        raise HTTPException(status_code=404, detail="listing not found in structure snapshot (run structure/fetch_sources.py)")
    t = t or {"listingId": listing_id, "rows": [], "columns": build.COLUMNS, "counts": {}, "notice": build.NOTICE, "artifacts": {}}
    cards = demo_cards(listing_id, (m.spaceSquareFeet or m.squareFeet) if m else None)
    if (fx := demo_fixture.get(listing_id)):
        t = {**t, "rows": demo_fixture.horizon_rows(fx, t["rows"])}
        return {**t, "demoForecasts": demo_fixture.projection_cards(fx), "demoForecastNote": f"{SCENARIO_LABEL}. {fx['projections']['note']}"}
    return {**t, "demoForecasts": [c.model_dump() for c in cards], "demoForecastNote": f"{SCENARIO_LABEL}. Demo estimates, not observed."}
