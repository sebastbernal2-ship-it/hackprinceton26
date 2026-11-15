"""GET /api/property/{id}/costs: repair, maintenance, utility and equipment cost lines for one space."""
import sys
from pathlib import Path

from fastapi import APIRouter, HTTPException

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from planning import financials  # noqa: E402

from . import demo_fixture  # noqa: E402
from .loader import load_matches  # noqa: E402

router = APIRouter()
NOTICE = ("Scenario analysis, not a forecast or a quote. 'observed' = a public page was read; 'estimated' = neutral "
          "low/expected/high band (same method for every site); 'unknown' = no figure, excluded from totals and not zero. "
          "Repair lines need confirmed quantities (query repairs=category:qty,...); an on-site inspector must verify scope. "
          "Annual lines are folded into monthly totals as 1/12.")


def parse_repairs(s: str | None) -> dict[str, float]:
    out = {}
    for part in (s or "").split(","):
        if not part.strip():
            continue
        k, _, v = part.partition(":")
        try:
            out[k.strip()] = float(v)
        except ValueError:
            raise HTTPException(status_code=422, detail=f"bad repairs entry: {part!r}")
    return out


@router.get("/api/property/{listing_id}/costs")
def property_costs(listing_id: int, repairs: str | None = None):
    m = next((m for m in load_matches() or [] if m.listingId == listing_id), None)
    if m is None:
        raise HTTPException(status_code=404, detail="listing not found or data unavailable")
    state = m.city.split(",")[1].strip() if "," in m.city else None
    fx = demo_fixture.get(listing_id)
    qty = parse_repairs(repairs) if repairs else (fx["repairQuantities"]["quantities"] if fx else {})
    lines = financials.all_lines(m.city.split(",")[0], state, qty)
    t = financials.totals(lines)
    return {"lines": lines, "totals": t["totals"], "totalsStatus": t["totalsStatus"],
            "excludedLineIds": t["excludedLineIds"], "statusCounts": financials.counts(lines), "notice": NOTICE,
            **({"repairQuantitiesNote": fx["repairQuantities"]["note"]} if fx and not repairs else {})}
