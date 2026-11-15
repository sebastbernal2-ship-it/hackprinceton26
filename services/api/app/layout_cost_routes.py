"""POST /api/layout-cost: cost of the pieces placed in the owner's layout, not the default restaurant catalogue.

Each placed asset is priced by its catalogue id from data/financial/catalog.json (`equipment` and `reskinEquipment`):
observed = vendor list price, estimated = the neutral band. Pieces with no catalogue price are returned in `unpriced`
and left out of the totals, never counted as zero. Interior fit-out needs an owner-stated area. With a budget the
seeded Monte Carlo reports P(over budget) for build-out only (10-20% contingency, stated assumption).
Scenario analysis, not a quote."""
import sys
from pathlib import Path
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from planning import monte_carlo  # noqa: E402
from planning import price_catalog as pc  # noqa: E402
from planning.assessment import CONTINGENCY, ZERO_TIME  # noqa: E402
from planning.scenario import Line, Scenario  # noqa: E402

router = APIRouter()
NOTICE = ("Scenario analysis, not a quote. Only pieces with a catalogue price are counted; unpriced pieces, install, freight, "
          "permits and repairs are excluded, not zero. Fit-out per sq ft is a stated analyst assumption.")


class LayoutItem(BaseModel):
    assetId: str
    quantity: float = Field(1, gt=0, le=1000)


class LayoutCostRequest(BaseModel):
    items: list[LayoutItem] = []
    sqft: Optional[float] = Field(None, gt=0, le=1_000_000)
    budget: Optional[float] = Field(None, gt=0)
    draws: int = Field(5000, ge=200, le=50000)


def _r(x):
    return None if x is None else round(float(x), 2)


@router.post("/api/layout-cost")
def layout_cost(req: LayoutCostRequest):
    d = pc.load_financial_json()
    by_id = {e["id"]: e for k in ("equipment", "reskinEquipment") for e in d.get(k, [])}
    qty: dict[str, float] = {}
    for it in req.items:
        qty[it.assetId] = qty.get(it.assetId, 0) + it.quantity
    catalog, lines, out_lines, unpriced = [], [], [], []
    for aid, q in qty.items():
        e = by_id.get(aid)
        if e is None:
            unpriced.append({"assetId": aid, "quantity": q, "reason": "no catalogue price for this piece"})
            continue
        if e["priceStatus"] == "observed":
            lo = hi = e["listPrice"]
            src = e.get("vendorUrl", "")
        else:
            lo, _, hi = pc.band(e["listPrice"], "costBand", d)
            src = pc.ESTIMATE_URL
        catalog.append(pc.CatalogItem(aid, e["label"], "each", lo, hi, src or pc.ESTIMATE_URL, d["asOf"], "US online list price",
                                      e.get("priceNote", ""), e["priceStatus"]))
        lines.append(Line(aid, q))
        out_lines.append({"assetId": aid, "label": e["label"], "quantity": q, "low": _r(lo * q), "high": _r(hi * q),
                          "status": e["priceStatus"], "source": src or pc.ESTIMATE_URL})
    fitout = None
    fo = d.get("interiorFitout")
    if req.sqft and fo:
        lo, _, hi = pc.band(fo["referencePerSqft"], "costBand", d)
        catalog.append(pc.CatalogItem(fo["id"], fo["label"], fo["unit"], lo, hi, pc.ESTIMATE_URL, d["asOf"], "", fo["rationale"], "estimated"))
        lines.append(Line(fo["id"], req.sqft))
        fitout = {"squareFeet": req.sqft, "low": _r(lo * req.sqft), "high": _r(hi * req.sqft), "status": "estimated",
                  "source": "estimate://neutral-band-v1; stated analyst assumption, not a sourced figure"}
    base = {"lines": out_lines, "unpriced": unpriced, "fitout": fitout, "notice": NOTICE, "budget": req.budget}
    if not lines:
        return {**base, "equipment": None, "buildout": None, "pOverBudget": None, "totalStatus": "unknown"}
    eq = [l for l in out_lines]
    equipment = {"low": _r(sum(l["low"] for l in eq)), "high": _r(sum(l["high"] for l in eq))} if eq else None
    sc = Scenario(tuple(lines), CONTINGENCY[0], CONTINGENCY[1], ZERO_TIME, 0.0, 0.0, 0.0, 0.0, req.budget, catalog=tuple(catalog))
    r = monte_carlo.run(sc, req.draws, 0)
    bo = r.buildout
    return {**base, "equipment": equipment,
            "buildout": None if bo is None else {"p5": _r(bo.p5), "p50": _r(bo.p50), "p95": _r(bo.p95)},
            "pOverBudget": r.p_over_budget,
            "totalStatus": ("complete" if not unpriced and fitout else "partial: excludes "
                            + ", ".join(([f"{len(unpriced)} unpriced piece(s)"] if unpriced else []) + ([] if fitout else ["fit-out (no area)"])))}
