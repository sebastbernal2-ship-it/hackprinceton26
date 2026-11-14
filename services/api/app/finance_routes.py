"""POST /api/finance/simulate, GET /api/finance/ledger/{runId}: restaurant-lifecycle scenario + SIMULATED ledger."""
import hashlib
import json
import sys
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from finance import model, nessie  # noqa: E402
from planning import financials  # noqa: E402

from .loader import load_matches  # noqa: E402

router = APIRouter()
RUNS: dict[str, dict] = {}  # runId -> {"ledger": LocalSandbox tables, "summary": ...}; in-memory, per process
NOTICE = ("Scenario analysis, not a forecast. Ledger records are SIMULATED and live in a LOCAL SANDBOX shaped like "
          "Nessie's data model; nothing was sent to Capital One's Nessie service.")


class SimRequest(BaseModel):
    listingId: Optional[int] = None
    seats: int = Field(60, ge=1, le=500)
    squareFeet: Optional[float] = None
    rentPerSquareFootYear: Optional[float] = None
    monthlyRentAssumption: Optional[float] = None  # explicit, labelled assumption when the listing has no rent
    city: Optional[str] = None
    state: Optional[str] = None
    presenceIndex: float = Field(0.5, ge=0, le=1)
    presenceSd: float = Field(0.15, ge=0, le=0.5)
    presenceSource: str = "stub (caller supplied)"
    avgCheck: Optional[tuple[float, float, float]] = None
    cogsPct: Optional[tuple[float, float, float]] = None
    hourlyWage: Optional[float] = None
    wageSource: str = "assumption"
    utilitiesMonthly: Optional[tuple[float, float, float]] = None
    buildout: Optional[tuple[float, float, float]] = None
    equity: float = 100_000.0
    loan: str = Field("sba", pattern="^(sba|conventional)$")
    seed: int = 0
    nDraws: int = Field(10_000, ge=100, le=50_000)
    postLedger: bool = True


def _inputs(req: SimRequest):
    city, state, sqft, rpsf = req.city, req.state, req.squareFeet, req.rentPerSquareFootYear
    if req.listingId is not None:
        m = next((x for x in load_matches() or [] if x.listingId == req.listingId), None)
        if m is None:
            raise HTTPException(status_code=404, detail="listing not found or data unavailable")
        city = city or m.city
        sqft = sqft or m.squareFeet
        rpsf = rpsf if rpsf is not None else m.rentPerSquareFootYear
    kw = {}
    if rpsf is not None and sqft:
        kw.update(rent_monthly=rpsf * sqft / 12, rent_status="observed (listing asking rent x size)")
    elif req.monthlyRentAssumption is not None:
        kw.update(rent_monthly=req.monthlyRentAssumption, rent_status="estimated (caller assumption)")
    lines = financials.all_lines(city, state)
    tot = financials.totals(lines)
    excluded = set(tot["excludedLineIds"])
    t = tot["totals"]
    if req.buildout:
        kw.update(buildout=req.buildout, buildout_scope="caller supplied")
    elif t and t["oneTime"]["expected"] is not None:
        o = t["oneTime"]
        kw.update(buildout=(o["low"], o["expected"], o["high"]),
                  buildout_scope="equipment + install allowance only; repairs/tenant improvements unknown and excluded (not zero)")
    if req.utilitiesMonthly:
        kw.update(utilities_monthly=req.utilitiesMonthly)
    elif t and "util:area" not in excluded:
        mo = t["monthly"]
        kw.update(utilities_monthly=(mo["low"], mo["expected"], mo["high"]))
    for k, v in (("avg_check", req.avgCheck), ("cogs_pct", req.cogsPct), ("hourly_wage", req.hourlyWage)):
        if v is not None:
            kw[k] = v
    if req.hourlyWage is not None:
        kw["wage_status"] = req.wageSource
    return model.Inputs(seats=req.seats, sqft=sqft, presence_index=req.presenceIndex, presence_sd=req.presenceSd,
                        presence_source=req.presenceSource, equity=req.equity, loan_name=req.loan, **kw)


@router.post("/api/finance/simulate")
def simulate(req: SimRequest):
    inp = _inputs(req)
    out = model.simulate(inp, seed=req.seed, n=req.nDraws)
    out["notice"] = NOTICE
    if out["status"] != "simulated":
        return out
    run_id = hashlib.sha256(json.dumps(req.model_dump(), sort_keys=True, default=str).encode()).hexdigest()[:12]
    out["runId"] = run_id
    if req.postLedger:
        sb = nessie.LocalSandbox()
        path = model.representative_path(inp, req.seed, req.nDraws)
        res = nessie.post_trail(sb, path, inp.open_days_per_month)
        RUNS[run_id] = {"sandbox": sb, **res}
        out["ledger"] = {"backend": sb.kind, "tag": nessie.TAG, "counts": {k: len(v) for k, v in sb.t.items()}, **res}
    return out


@router.get("/api/finance/ledger/{run_id}")
def ledger(run_id: str, table: str = Query("deposits"), limit: int = Query(50, ge=1, le=500), offset: int = Query(0, ge=0)):
    run = RUNS.get(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="unknown runId (runs are kept in memory only)")
    sb = run["sandbox"]
    if table not in sb.t:
        raise HTTPException(status_code=422, detail=f"table must be one of {sorted(sb.t)}")
    rows = sb.t[table]
    return {"runId": run_id, "backend": sb.kind, "table": table, "total": len(rows), "notice": NOTICE,
            "records": rows[offset:offset + limit]}
