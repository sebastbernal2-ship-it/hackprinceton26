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


# Stated assumption, not sourced: total restaurant floor area per seat (dining + kitchen + back of house). Used only
# when a site has no listed space, no measured scan area and the brief gives no size; the label says so.
SQFT_PER_SEAT = 30.0


def brief_size(profile) -> tuple[float | None, str | None]:
    """Size to fall back on from the brief: the stated area, else seats x SQFT_PER_SEAT (assumption), else none."""
    lo_a, hi_a = profile.min_area_sqft, profile.max_area_sqft
    area = (lo_a + hi_a) / 2 if lo_a and hi_a else (lo_a or hi_a)
    if area:
        return area, "brief"
    lo_s, hi_s = profile.min_seats, profile.max_seats
    seats = (lo_s + hi_s) / 2 if lo_s and hi_s else (lo_s or hi_s)
    return (seats * SQFT_PER_SEAT, "seats") if seats else (None, None)


def site_buildout(sqft: Optional[float], basis: str = "listing") -> dict:
    """Build-out for one site: equipment + install + interior fit-out x an area, with contingency.
    basis says where the area came from: "listing" (listed available space), "brief" (the size the owner stated) or
    "owner" (entered in the panel). Without an area the estimate is unknown (never the equipment-only figure)."""
    if not sqft or sqft <= 0:
        return {"status": "unknown", "low": None, "high": None, "squareFeet": None, "basis": None,
                "reason": "no listed available space and no size in the brief, so the fit-out cannot be sized (building area is not used)"}
    est = cost_model.estimate(financials.build_scenario(fitout_sqft=sqft))
    if not est.buildout:
        return {"status": "unknown", "low": None, "high": None, "squareFeet": sqft, "basis": basis, "reason": "equipment prices incomplete"}
    where = {"listing": "listed available space", "scan": "the floor area measured from this site's Matterport scan", "brief": "the size in your brief (this site lists no space)",
             "owner": "the area you entered", "scan-estimate": "an assumed demo floor area for this cafe scan (ESTIMATED, not measured)",
             "seats": f"your seat count x {SQFT_PER_SEAT:g} sq ft per seat (an ASSUMPTION, not a measured size)"}[basis]
    return {"status": "estimated", "low": _r(est.buildout[0]), "high": _r(est.buildout[1]), "squareFeet": sqft, "basis": basis,
            "reason": f"equipment + install + interior fit-out per sq ft x {sqft:,.0f} sq ft from {where}, 10-20% contingency (neutral-band-v1)"}


def site_rent(match, sqft: Optional[float], basis: Optional[str]) -> dict:
    """Monthly rent estimate for one site: best available rate option x the same area the build-out uses.
    Unknown (no numbers) when there is no rate option or no area. Never the building's area."""
    opts = rent_options(match)
    if not opts or not sqft:
        why = "no rent rate on file" if not opts else "no space size (listing, scan or brief)"
        return {"status": "unknown", "low": None, "high": None, "rateLabel": None, "rateStatus": None, "basis": basis, "reason": why}
    o = opts[0]
    lo, hi = o.get("low") or o["rate"], o.get("high") or o["rate"]
    return {"status": "observed" if o["status"] == "observed" and o["id"] == "listing" else "estimated",
            "low": _r(lo * sqft / 12), "high": _r(hi * sqft / 12), "rateLabel": o["label"], "rateStatus": o["status"],
            "basis": basis, "reason": f"{o['label']} (${o['rate']:,.2f}/sf/yr, {o['status']}; {o['source']}) x {sqft:,.0f} sq ft"}


def rent_options(match) -> list[dict]:
    """Rate options ($/sf/yr) for this listing, best evidence first. Each one names its source and status."""
    opts: list[dict] = []
    from . import demo_fixture
    if match.rentPerSquareFootYear and demo_fixture.has(match.listingId):
        rl = demo_fixture.get(match.listingId)["rentLease"]
        opts.append({"id": "listing", "label": "Demo asking rent (NNN)", "rate": _r(rl["askingRentPerSfYear"]), "low": _r(rl["askingRentRange"]["low"]),
                     "high": _r(rl["askingRentRange"]["high"]), "status": "estimated", "source": rl["source"]})
    elif match.rentPerSquareFootYear:
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


def total_cost(match, sqft: Optional[float], rent_rate: Optional[float], rent_choice: Optional[str], months: int,
               buildout_from_layout: bool = False) -> dict:
    lines = financials.all_lines(match.city.split(",")[0], match.city.split(",")[1].strip() if "," in match.city else None, {})
    ops = financials.totals(lines)["totals"]
    space, space_src = getattr(match, "spaceSquareFeet", None), getattr(match, "spaceSource", None)  # kit properties have none
    bo = site_buildout(sqft, "owner") if sqft else site_buildout(space, space_src or "listing")
    parts, excluded = [], []

    if buildout_from_layout:
        # The default catalogue is the earlier Italian/gelato equipment set; a layout is priced by POST /api/layout-cost instead.
        excluded.append({"id": "buildout", "reason": "priced from the pieces in your layout (see Layout cost), not the default restaurant equipment set"})
    elif bo["status"] == "estimated":
        parts.append({"id": "buildout", "label": f"Build-out: kitchen equipment, install, interior fit-out x {bo['squareFeet']:,.0f} sq ft, 10-20% contingency",
                      "basis": "one_time", "low": bo["low"], "high": bo["high"], "status": "estimated",
                      "source": "planning/cost_model.py over data/financial/catalog.json (fit-out rate and contingency are stated assumptions)"})
    else:
        excluded.append({"id": "buildout", "reason": bo["reason"]})

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
    rent_sqft = sqft or space  # owner's area, else the listed / scanned space (never the building)
    if chosen and rent_sqft:
        lo_rate, hi_rate = chosen.get("low") or chosen["rate"], chosen.get("high") or chosen["rate"]
        parts.append({"id": "rent", "label": f"Rent: {chosen['label']} x {rent_sqft:,.0f} sq ft", "basis": "monthly",
                      "low": _r(lo_rate * rent_sqft / 12), "high": _r(hi_rate * rent_sqft / 12), "status": chosen["status"],
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
                        months: int = Query(12, ge=1, le=120),
                        buildout: Optional[str] = Query(None, pattern="^layout$")):
    m = next((m for m in load_matches() or [] if m.listingId == listing_id), None) or kit_property(listing_id)
    if m is None:
        raise HTTPException(status_code=404, detail="listing not found or data unavailable")
    return total_cost(m, sqft, rent, rentSource, months, buildout == "layout")


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
