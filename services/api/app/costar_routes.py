"""GET /api/costar/{listingId}/extended and GET /api/costar/market?metro=. listingId is the CoStar PropertyId."""
import sys
from pathlib import Path

from fastapi import APIRouter, HTTPException

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from data.costar import client  # noqa: E402

router = APIRouter()


def _kit():
    k = client.kit()
    if not k.available():
        raise HTTPException(status_code=503, detail="CoStar kit not available locally")
    return k


# Declared before the {listing_id} route is irrelevant (different path shapes), kept first for clarity.
@router.get("/api/costar/market")
def costar_market(metro: str):
    ids = {v: k for k, v in client.MARKETS.items()}
    key = metro.strip().lower().replace(" ", "-")
    if key in ("la", "los-angeles-ca"):
        key = "los-angeles"
    if key not in ids:
        raise HTTPException(status_code=404, detail=f"metro must be one of {sorted(ids)}")
    return _kit().market(ids[key])


@router.get("/api/costar/{listing_id}/extended")
def costar_extended(listing_id: int):
    ex = _kit().extended(listing_id)
    if ex is None:
        raise HTTPException(status_code=404, detail="property not in CoStar kit")
    return ex
