"""Restaurant lineage and day/night presence for a site, from precomputed local artifacts (triage/lineage/build.py)."""
import json
import os
import sys
from pathlib import Path

from fastapi import APIRouter, HTTPException

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from . import analyses, demo_fixture  # noqa: E402

router = APIRouter()
LINEAGE_NOTICE = ("Observed CoStar tenancy spells (kit-listed buildings only). Closure = CoStar's ClosedLocationOrBankrupt label; "
                  "MovingOutNewAddressUnknown and all other exits are NOT counted as failure. Tenants are anonymized unless names=true. "
                  "Survival context is an exploratory market prior, not a per-site prediction. Screening prior, not an assessment.")


def lineage_dir() -> Path:
    return Path(os.environ.get("LINEAGE_DIR", "data/derived/lineage"))


def _load(name: str):
    p = lineage_dir() / f"{name}.json"
    if not p.is_file():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def _need(name: str):
    d = _load(name)
    if d is None:
        raise HTTPException(status_code=503, detail=f"{name} artifact not built (run python -m triage.lineage.build); dataAvailable=false")
    return d


@router.get("/api/lineage/summary")
def lineage_summary():
    return {**_need("summary"), "notice": LINEAGE_NOTICE}


@router.get("/api/lineage/{listing_id}")
def lineage(listing_id: int, names: bool = False):
    data = _need("lineage")
    L = data.get(str(listing_id))
    summary = _need("summary")
    fx = demo_fixture.get(listing_id)
    if fx:
        return {**demo_fixture.lineage(fx, names), "marketPrior": summary["marketPrior"], "notice": LINEAGE_NOTICE}
    if L is None:
        # Known candidate without kit food history: say so (absence in the kit is not proof of no restaurant history).
        if str(listing_id) not in (_load("presence") or {}):
            d = analyses.lineage_for(listing_id)  # a scan outside the candidate set: computed from its linked CoStar record, or demo-labelled
            if d is None:
                raise HTTPException(status_code=404, detail="listing not found")
            if d.get("foodHistoryInKit"):
                d = {**d, "tenants": [{k: v for k, v in t.items() if names or k != "name"} for t in d["tenants"]], "anonymized": not names}
            return {**d, "marketPrior": summary["marketPrior"], "notice": LINEAGE_NOTICE}
        return {"listingId": listing_id, "foodHistoryInKit": False, "tenants": [],
                "note": "No food-service tenancy recorded in the CoStar kit for this building. Unknown, not proof of no restaurant history.",
                "marketPrior": summary["marketPrior"], "notice": LINEAGE_NOTICE}
    L = dict(L)
    tenants = []
    for t in L["tenants"]:
        t = dict(t)
        if not names:
            t.pop("name", None)
        tenants.append(t)
    L["tenants"], L["anonymized"] = tenants, not names
    return {"listingId": listing_id, "foodHistoryInKit": True, **L, "marketPrior": summary["marketPrior"], "notice": LINEAGE_NOTICE}


@router.get("/api/presence/{listing_id}")
def presence(listing_id: int):
    pres = _load("presence")
    fx = demo_fixture.get(listing_id)
    if fx:
        return demo_fixture.presence(fx)
    P = (pres or {}).get(str(listing_id)) or analyses.presence_for(listing_id)
    if P is None and pres is None:
        _need("presence")  # artifact not built: 503 as before
    if P is None:
        raise HTTPException(status_code=404, detail="listing not found or no coordinates")
    return {"listingId": listing_id, **P}
