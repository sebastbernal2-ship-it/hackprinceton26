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

router = APIRouter()


def _dir() -> Path:
    return Path(os.environ.get("INSPECTION_DIR", "data/derived/inspection"))


@router.get("/api/property/{listing_id}/inspection")
def inspection(listing_id: int):
    p = _dir() / f"{listing_id}.json"
    if p.is_file():
        try:
            d = json.loads(p.read_text())
            fs = [f for f in d["findings"] if not validate_finding(f)]
            return {"findings": fs, "mode": d["mode"] if d.get("mode") in ("live", "fixture") else "none",
                    "notice": d.get("notice", "")}
        except (ValueError, KeyError, TypeError):
            return {"findings": [], "mode": "none", "notice": "Inspection output unreadable; no findings available."}
    if os.environ.get("INSPECTION_FIXTURE") == "1":
        return {"findings": link_costs(load_fixture()), "mode": "fixture",
                "notice": "SAMPLE DATA: synthetic illustrative findings, NOT from this property."}
    return {"findings": [], "mode": "none",
            "notice": "No inspection has been run for this listing. Run python -m inspection.run."}
