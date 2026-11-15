"""GET /api/property/{id}/business-peers: kNN peer outcomes + neighbourhood context index for a site (forecasting/peers).

Reads the gitignored artifacts written by tools/run_business_models.py ($DERIVED_DIR/business, or BUSINESS_DIR). Results for the
candidates and cafe scans are precomputed; any other concept, or a site whose result is missing, is computed on request from the index.
Demo fixture sites (services/api/app/demo_sites) get their invented neighbours tagged demo; the Bayou Café still answers without artifacts.
Peers are anonymised (no names). Describes how nearby food businesses fared; it is not a forecast, a fit score or a ranking.
"""
import json
import os
import sys
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from forecasting.peers import fit, kinds  # noqa: E402
from forecasting.peers import peers_knn as K  # noqa: E402
from forecasting.peers.build import demo_spells  # noqa: E402
from forecasting.peers.site import site_result  # noqa: E402

from . import demo_fixture  # noqa: E402

router = APIRouter()
NOTICE = ("Observed CoStar tenancy records for kit-listed buildings only (a sparse lower bound; absence is unknown, not zero). Peers are anonymised. "
          "Neighbour aggregates are estimates with bootstrap intervals; on held-out recent tenancies the kNN is not better than the same-market prior for closures and at most "
          "modestly better for tenancy ends (see docs/models/business-knn.md). The neighbourhood index is a documented rule with team-chosen thresholds (docs/models/neighbourhood-index.md). "
          "Context only: not a forecast, a fit score or a ranking. Food 'kind' is inferred from company names.")


class BusinessPeersResponse(BaseModel):
    listingId: int
    concept: str
    dataAvailable: bool
    # {lat, lon, market, locationSource}; lat/lon null when the site has no coordinates on file
    site: dict
    # kNN peer outcomes: k, metric, survival at 1/2/3/5 y, 2-year closure, tenure, neighbours[], marketPrior, evaluation; status estimated | demo
    knn: dict
    # Neighbourhood index with drivers, bands, adjacentCompetitor flag, warnings, sensitivity; null when the site has no coordinates
    neighbourhood: Optional[dict] = None
    coverage: Optional[dict] = None
    labels: dict
    demo: bool
    demoNote: Optional[str] = None
    notice: str


def business_dir() -> Path:
    return Path(os.environ.get("BUSINESS_DIR") or Path(os.environ.get("DERIVED_DIR", "data/derived")) / "business")


_CACHE: dict = {}


def _load(name: str):
    """Parse a large artifact once until it changes (callers must not mutate it)."""
    p = business_dir() / name
    try:
        key = (str(p), p.stat().st_mtime_ns)
    except OSError:
        return None
    if key not in _CACHE:
        for k in [k for k in _CACHE if k[0] == key[0]]:
            del _CACHE[k]
        if name == fit.INDEX_NAME:
            _CACHE[key] = fit.load_index(p.parent)
        else:
            _CACHE[key] = json.loads(p.read_text(encoding="utf-8"))
    return _CACHE[key]


def _envelope(res: dict, concept: str) -> dict:
    return {**res, "concept": concept, "dataAvailable": True, "notice": NOTICE}


def _live(site: dict, concept: str, fx: dict | None, idx: dict | None):
    pool = idx["pool"] if idx else []
    ctx = _load("context.json") or []
    params = K.Params(**idx["params"]) if idx else K.Params(k=10, h_miles=2.0, w_kind=0.0, shrink_m=0.0)
    return site_result({**site, "concept": concept}, pool, ctx, params, idx["evaluation"] if idx else None, demo_spells(fx) if fx else None)


@router.get("/api/property/{listing_id}/business-peers", response_model=BusinessPeersResponse)
def business_peers(listing_id: int, concept: str = Query("cafe")):
    if concept not in kinds.CONCEPTS:
        raise HTTPException(status_code=422, detail=f"concept must be one of {', '.join(kinds.CONCEPTS)}")
    fx = demo_fixture.get(listing_id)
    sites = _load("sites.json") or []
    site = next((s for s in sites if s["listingId"] == listing_id), None)
    idx = _load(fit.INDEX_NAME)
    if site is None and fx is not None:  # fixture site on a machine without artifacts: its own kit-sourced coordinates
        c = fx["meta"].get("coordinates") or {}
        site = {"listingId": listing_id, "lat": c.get("lat"), "lon": c.get("lon"), "market": "Houston" if "TX" in fx["meta"]["city"] else "Los Angeles", "concept": concept,
                "locationSource": c.get("source", "demo fixture")}
    if site is None:
        from . import loader
        if not any(m.listingId == listing_id for m in loader.load_matches() or []):
            raise HTTPException(status_code=404, detail="listing not found")
        raise HTTPException(status_code=503, detail="business artifacts not built (run tools/run_business_models.py); dataAvailable=false")
    if idx is None and fx is None:
        raise HTTPException(status_code=503, detail="business artifacts not built (run tools/run_business_models.py); dataAvailable=false")
    if concept == "cafe" and idx is not None:
        pre = _load(f"results/{listing_id}.json")
        if pre is not None:
            return _envelope(pre, concept)
    return _envelope(_live(site, concept, fx, idx), concept)
