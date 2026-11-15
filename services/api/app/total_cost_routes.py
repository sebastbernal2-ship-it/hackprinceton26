"""GET /api/property/{id}/total-cost: one first-period total for the Quantify step, built only from sources the repo
already has, each labelled with its status:

  build-out   planning.cost_model over the equipment + install catalogue, with the stated 10-20% contingency
  operating   utilities + maintenance lines from planning.financials (monthly, annual folded in as 1/12)
  rent        rate x the owner's square feet. Rate options, best first: the listing's asking rent (observed), observed
              lease rates in the same building (CoStar kit tenancies; not this suite's ask), the hedonic rent model
              (only when its pre-declared gate passed), the metro kit median (derived; not market rent). The caller may
              pick any option or state its own rate (assumption).

Arithmetic is deterministic. Unknown parts are listed and excluded from the total, never counted as zero.
Scenario analysis, not a quote or a forecast.
"""
import statistics
import sys
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from planning import cost_model, financials  # noqa: E402
from .loader import load_matches  # noqa: E402

router = APIRouter()

NOTICE = ("Scenario analysis, not a quote or a forecast. Each part says where it comes from. Unknown parts are excluded "
          "from the total and listed, never counted as zero. Furniture from the 3D layout has no price source yet.")


def _r(x):
    return None if x is None else round(float(x), 2)


def rent_options(match) -> list[dict]:
    """Rate options ($/sf/yr) for this listing, best evidence first. Each one names its source and status."""
    opts: list[dict] = []
    if match.rentPerSquareFootYear:
        opts.append({"id": "listing", "label": "Listing asking rent", "rate": _r(match.rentPerSquareFootYear),
                     "status": "observed", "source": f"CoStar listing {match.listingId}"})
    try:
        from .costar_routes import costar_extended
        ex = costar_extended(match.listingId)
        rates = [t["contractRatePerSfYear"] for t in (ex.get("tenancies") or []) if t.get("contractRatePerSfYear")]
        if rates:
            opts.append({"id": "building", "label": f"Lease rate in this building ({len(rates)} lease{'s' if len(rates) > 1 else ''})",
                         "rate": _r(statistics.median(rates)), "status": "observed",
                         "source": f"CoStar kit tenancies, property {match.listingId}; not this suite's asking rent"})
    except Exception:  # noqa: BLE001 - kit unavailable: the option is simply absent
        pass
    try:
        from .rent_routes import rent_for_listing as rent_for
        card = rent_for(match.listingId).get("card") or {}
        if card.get("status") not in (None, "unknown") and card.get("point"):
            opts.append({"id": "model", "label": "Rent model estimate", "rate": _r(card["point"]), "low": _r(card.get("lower")),
                         "high": _r(card.get("upper")), "status": "estimated", "source": card.get("method") or "hedonic rent model"})
    except Exception:  # noqa: BLE001
        pass
    try:
        from .costar_routes import costar_market
        city = match.city.split(",")[0].strip()
        mk = costar_market(city)
        med = (mk.get("contractRatePerSfYear") or {}).get("median")
        if med:
            opts.append({"id": "metro", "label": f"{city} kit median lease rate", "rate": _r(med), "status": "derived",
                         "source": "CoStar kit sample median (Matterport-capture properties), not market rent"})
    except Exception:  # noqa: BLE001
        pass
    return opts


def total_cost(match, sqft: Optional[float], rent_rate: Optional[float], rent_choice: Optional[str], months: int) -> dict:
    lines = financials.all_lines(match.city.split(",")[0], match.city.split(",")[1].strip() if "," in match.city else None, {})
    ops = financials.totals(lines)["totals"]
    est = cost_model.estimate(financials.build_scenario())
    parts, excluded = [], []

    if est.buildout:
        parts.append({"id": "buildout", "label": "Build-out: kitchen equipment, install, 10-20% contingency", "basis": "one_time",
                      "low": _r(est.buildout[0]), "high": _r(est.buildout[1]), "status": "estimated",
                      "source": "planning/cost_model.py over data/financial/catalog.json (contingency is a stated assumption)"})
    else:
        excluded.append({"id": "buildout", "reason": "equipment prices incomplete"})

    if ops and ops["monthly"]["expected"] is not None:
        m = ops["monthly"]
        parts.append({"id": "operating", "label": "Utilities and maintenance", "basis": "monthly", "low": m["low"], "high": m["high"],
                      "status": "estimated", "source": "planning/financials.py (utility rates for this city, maintenance lines)"})
    else:
        excluded.append({"id": "operating", "reason": "no computable utility or maintenance lines"})

    options = rent_options(match)
    chosen = None
    if rent_rate is not None:
        chosen = {"id": "owner", "label": "Your rate", "rate": _r(rent_rate), "status": "assumption", "source": "entered by you"}
    elif rent_choice:
        chosen = next((o for o in options if o["id"] == rent_choice), None)
    elif options:
        chosen = options[0]
    if chosen and sqft:
        lo_rate, hi_rate = chosen.get("low") or chosen["rate"], chosen.get("high") or chosen["rate"]
        parts.append({"id": "rent", "label": f"Rent: {chosen['label']} x {sqft:,.0f} sq ft", "basis": "monthly",
                      "low": _r(lo_rate * sqft / 12), "high": _r(hi_rate * sqft / 12), "status": chosen["status"],
                      "source": chosen["source"]})
    else:
        excluded.append({"id": "rent", "reason": "enter the square feet you would lease" if chosen else "no rent rate on file; enter one"})

    one = [p for p in parts if p["basis"] == "one_time"]
    mon = [p for p in parts if p["basis"] == "monthly"]
    sum_ = lambda ps, k: sum(p[k] for p in ps)  # noqa: E731
    monthly = {"low": _r(sum_(mon, "low")), "high": _r(sum_(mon, "high"))} if mon else None
    one_time = {"low": _r(sum_(one, "low")), "high": _r(sum_(one, "high"))} if one else None
    period = None
    if one_time or monthly:
        period = {k: _r((one_time or {}).get(k, 0) + months * (monthly or {}).get(k, 0)) for k in ("low", "high")}
    return {"listingId": match.listingId, "months": months, "squareFeet": sqft, "buildingSquareFeet": match.squareFeet or None,
            "rentOptions": options, "rentChosen": chosen, "parts": parts, "excluded": excluded,
            "oneTime": one_time, "monthly": monthly, "total": period,
            "totalStatus": "complete" if not excluded else "partial: excludes " + ", ".join(e["id"] for e in excluded),
            "notice": NOTICE}


@router.get("/api/property/{listing_id}/total-cost")
def property_total_cost(listing_id: int, sqft: Optional[float] = Query(None, gt=0, le=1_000_000),
                        rent: Optional[float] = Query(None, gt=0, le=1_000), rentSource: Optional[str] = None,
                        months: int = Query(12, ge=1, le=120)):
    m = next((m for m in load_matches() or [] if m.listingId == listing_id), None) or kit_property(listing_id)
    if m is None:
        raise HTTPException(status_code=404, detail="listing not found or data unavailable")
    return total_cost(m, sqft, rent, rentSource, months)


CITY = {"houston": "Houston, TX", "los-angeles": "Los Angeles, CA"}


def kit_property(pid: int):
    """A CoStar kit property that is not a restaurant candidate (e.g. a demo scan's building): enough for the total.
    No asking rent: the kit property record carries none, so rent comes from the other options or the owner."""
    from types import SimpleNamespace
    try:
        from data.costar import client
        k = client.kit()
        ex = k.extended(pid) if k.available() else None
    except Exception:  # noqa: BLE001
        return None
    if not ex:
        return None
    city = CITY.get(client.MARKETS.get(ex.get("researchMarketId"), ""), "")
    return SimpleNamespace(listingId=pid, city=city, rentPerSquareFootYear=None, squareFeet=ex.get("areaSqft") or 0)
