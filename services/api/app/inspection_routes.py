import json
import os
import sys
from pathlib import Path

from fastapi import APIRouter

_ROOT = Path(__file__).resolve().parents[3]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from inspection.cost_link import link_costs  # noqa: E402
from inspection.schema import validate_finding  # noqa: E402
from inspection.vision import load_fixture  # noqa: E402

from . import analyses, demo_fixture  # noqa: E402

router = APIRouter()


def _dir() -> Path:
    return analyses.inspection_dir()


@router.get("/api/property/{listing_id}/inspection")
def inspection(listing_id: int):
    fx = demo_fixture.get(listing_id)
    if fx:
        d = demo_fixture.inspection(fx)
        d["findings"] = link_costs([f for f in d["findings"] if not validate_finding(f)])
        return d
    p = _dir() / f"{listing_id}.json"
    if not p.is_file():
        analyses.inspection_for(listing_id)  # runs lazily and caches here; stays absent for a listing the picker cannot show
    if p.is_file():
        try:
            d = json.loads(p.read_text())
            fs = [f for f in d["findings"] if not validate_finding(f)]
            return {"findings": fs, "mode": d["mode"] if d.get("mode") in ("live", "fixture", "demo") else "none",
                    "notice": d.get("notice", "")}
        except (ValueError, KeyError, TypeError):
            return {"findings": [], "mode": "none", "notice": "Inspection output unreadable; no findings available."}
    if os.environ.get("INSPECTION_FIXTURE") == "1":
        return {"findings": link_costs(load_fixture()), "mode": "fixture",
                "notice": "SAMPLE DATA: synthetic illustrative findings, NOT from this property."}
    return {"findings": [], "mode": "none",
            "notice": "No inspection is available: this listing is not one of the candidate sites or scans."}
