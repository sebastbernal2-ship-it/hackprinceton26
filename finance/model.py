"""Restaurant-lifecycle monthly P&L / cash simulation. SCENARIO ANALYSIS, NOT A FORECAST.

Every uncertain driver is drawn per simulated restaurant (seeded numpy Generator), then 36 monthly cash flows are
computed. Inputs carry a status (observed/derived/estimated/unknown); unknown required inputs block the run (a
`blocked` result), they are never treated as zero. Taxes, depreciation and owner draws are not modelled.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field, asdict

import numpy as np

from . import loan as L

LABEL = "scenario analysis, not a forecast"
MONTHS = 36
DAYPARTS = {"lunch": 1.0, "dinner": 1.2}  # default turns/day by day-part (ASSUMPTION)


@dataclass
class Inputs:
    seats: int = 60
    sqft: float | None = None
    rent_monthly: float | None = None          # from CoStar listing rent*sqft/12 where present
    rent_status: str = "unknown"               # observed | estimated | unknown
    turns: dict = field(default_factory=lambda: dict(DAYPARTS))
    open_days_per_month: float = 26.0
    avg_check: tuple = (14.0, 18.0, 24.0)      # low/expected/high USD per cover (ASSUMPTION)
    cogs_pct: tuple = (0.28, 0.32, 0.38)
    hourly_wage: float = 16.5                  # ASSUMPTION unless set from BLS series
    wage_status: str = "estimated"
    labor_burden: float = 0.12
    fixed_labor_hours: float = 900.0           # hours/month regardless of volume (ASSUMPTION)
    labor_hours_per_cover: float = 0.10
    other_opex_fixed: float = 1500.0           # insurance, software, repairs (ASSUMPTION)
    other_opex_pct: float = 0.04               # marketing/card fees/supplies as share of sales
    utilities_monthly: tuple | None = None     # low/exp/high from data/financial/catalog.json; None = unknown
    buildout: tuple | None = None              # low/exp/high one-time cost; None = unknown
    buildout_scope: str = "unknown"
    presence_index: float = 0.5                # 0..1 from triage/presence if merged, else stub
    presence_sd: float = 0.15
    presence_source: str = "stub (no presence index merged)"
    ramp_months: tuple = (3, 6, 12)            # months to reach mature volume
    ramp_start: float = 0.5
    seasonality_sd: float = 0.08               # monthly lognormal noise
    equity: float = 100_000.0
    loan_name: str = "sba"
    loan_principal: float | None = None        # default: buildout expected * (1 - equity share)
    pre_open_months: float = 3.0               # rent paid before opening (dead rent)


def blocked(inp: Inputs) -> list[str]:
    miss = []
    if inp.rent_monthly is None:
        miss.append("rent_monthly (listing has no asking rent; supply an assumption explicitly)")
    if inp.buildout is None:
        miss.append("buildout cost")
    if inp.utilities_monthly is None:
        miss.append("utilities_monthly (no fetched rate for this area)")
    return miss


def _tri(rng, t, n):
    lo, ex, hi = t
    return rng.triangular(lo, ex, hi, n) if hi > lo else np.full(n, ex)


def _core(inp: Inputs, d: dict, noise: np.ndarray, loan_terms: dict, principal: float):
    """Vectorised monthly cash flow. d: per-draw arrays (n,). noise: (n,36). Returns dict of arrays."""
    m = np.arange(1, MONTHS + 1)[None, :]
    ramp = np.clip(inp.ramp_start + (1 - inp.ramp_start) * (m - 1) / np.maximum(d["ramp"][:, None] - 1, 1), 0, 1)
    demand = 0.6 + 0.8 * d["presence"]  # presence 0..1 -> 0.6x..1.4x of nominal turns (ASSUMPTION)
    covers_day = inp.seats * sum(inp.turns.values()) * demand[:, None] * ramp * noise
    covers = covers_day * inp.open_days_per_month
    sales = covers * d["check"][:, None]
    cogs = sales * d["cogs"][:, None]
    labor = (inp.fixed_labor_hours + covers * inp.labor_hours_per_cover) * d["wage"][:, None] * (1 + inp.labor_burden)
    other = inp.other_opex_fixed + sales * inp.other_opex_pct
    rent = np.full_like(sales, inp.rent_monthly)
    util = np.broadcast_to(d["util"][:, None], sales.shape)
    ebitda = sales - cogs - labor - other - rent - util
    pmt = L.payment(principal, loan_terms["annualRate"], loan_terms["termMonths"])
    cf = ebitda - pmt
    fee = principal * loan_terms["upfrontFeePct"]
    cash0 = inp.equity + principal - d["build"] - fee - inp.rent_monthly * inp.pre_open_months
    cash = cash0[:, None] + np.cumsum(cf, axis=1)
    return {"sales": sales, "cogs": cogs, "labor": labor, "other": other, "rent": rent, "util": np.asarray(util),
            "ebitda": ebitda, "cf": cf, "cash": cash, "cash0": cash0, "pmt": pmt, "covers": covers}


def _draws(inp: Inputs, rng, n):
    return {
        "presence": np.clip(rng.normal(inp.presence_index, inp.presence_sd, n), 0.0, 1.0),
        "check": _tri(rng, inp.avg_check, n), "cogs": _tri(rng, inp.cogs_pct, n),
        "wage": rng.triangular(inp.hourly_wage * 0.9, inp.hourly_wage, inp.hourly_wage * 1.25, n),
        "util": _tri(rng, inp.utilities_monthly, n), "build": _tri(rng, inp.buildout, n),
        "ramp": _tri(rng, inp.ramp_months, n),
    }


def _loan_terms(inp):
    return dict(L.SBA_LIKE if inp.loan_name == "sba" else L.CONVENTIONAL)


def _principal(inp, terms):
    if inp.loan_principal is not None:
        return float(inp.loan_principal)
    return round(inp.buildout[1] * (1 - terms["equityInjectionPct"]), 2)


def _pct(a, ps=(5, 50, 95)):
    return {f"p{p}": float(np.percentile(a, p)) for p in ps}


def _summ(core, n):
    cash = core["cash"]
    neg = cash < 0
    open_short = core["cash0"] < 0   # cannot fund the opening: shortfall at month 0, whatever month 1 earns
    short = neg.any(axis=1) | open_short
    first_neg = np.where(open_short, 0, np.where(neg.any(axis=1), neg.argmax(axis=1) + 1, 0))
    pos = core["cf"] >= 0
    be_ok = pos.any(axis=1)
    be = np.where(be_ok, pos.argmax(axis=1) + 1, 0)
    annual_ds = core["pmt"] * 12
    dscr = core["ebitda"][:, 12:24].sum(axis=1) / annual_ds if annual_ds > 0 else np.full(n, np.nan)
    return short, first_neg, be_ok, be, dscr


def simulate(inp: Inputs, seed: int = 0, n: int = 10_000, sensitivity: bool = True) -> dict:
    miss = blocked(inp)
    if miss:
        return {"status": "blocked", "label": LABEL, "unknownInputs": miss,
                "note": "Required inputs are unknown; nothing was assumed as zero."}
    terms = _loan_terms(inp)
    principal = _principal(inp, terms)
    rng = np.random.default_rng(seed)
    d = _draws(inp, rng, n)
    noise = np.exp(rng.normal(-inp.seasonality_sd**2 / 2, inp.seasonality_sd, (n, MONTHS)))
    core = _core(inp, d, noise, terms, principal)
    short, first_neg, be_ok, be, dscr = _summ(core, n)
    min_cash = np.minimum(core["cash"].min(axis=1), core["cash0"])
    be_hist = {str(k): int((be == k).sum()) for k in range(1, MONTHS + 1)}
    out = {
        "status": "simulated", "label": LABEL, "seed": seed, "nDraws": n, "months": MONTHS,
        "loan": {**terms, "principal": principal, "monthlyPayment": round(core["pmt"], 2),
                 "upfrontFee": round(principal * terms["upfrontFeePct"], 2)},
        "pCashShortfall": float(short.mean()),
        "runwayMonths": {"note": "first month cash < 0 (month 0 = the opening cannot be funded); draws never short within 36 months counted in pNoShortfall",
                         "pNoShortfall": float(1 - short.mean()),
                         **(_pct(first_neg[short]) if short.any() else {})},
        "breakEven": {"definition": "first month operating cash flow after debt service >= 0",
                      "pReached": float(be_ok.mean()), "monthDist": _pct(be[be_ok]) if be_ok.any() else None,
                      "histogram": be_hist},
        "dscr": {"definition": "year-2 EBITDA / annual debt service",
                 **_pct(dscr), "pBelow1.25": float((dscr < 1.25).mean()), "pBelow1.0": float((dscr < 1.0).mean())},
        "minCash": _pct(min_cash), "endCash": _pct(core["cash"][:, -1]),
        "monthly": {k: [round(float(np.median(core[k][:, i])), 2) for i in range(MONTHS)]
                    for k in ("sales", "cogs", "labor", "other", "ebitda", "cf", "cash")},
        "assumptions": assumptions(inp, terms),
        "limits": ["taxes, depreciation and owner draws not modelled", "buildout scope: " + inp.buildout_scope,
                   "screening scenario; not a lender's or accountant's assessment"],
    }
    if sensitivity:
        out["sensitivity"] = sens(inp, terms, principal, seed)
        out["flip"] = flip(inp, terms, principal)
    return out


def assumptions(inp: Inputs, terms: dict) -> dict:
    return {
        "rent_monthly": {"value": inp.rent_monthly, "status": inp.rent_status},
        "seats": inp.seats, "turns": inp.turns, "openDaysPerMonth": inp.open_days_per_month,
        "avgCheck": {"lowExpHigh": inp.avg_check, "status": "estimated", "rationale": "placeholder; replace with concept menu pricing"},
        "cogsPct": {"lowExpHigh": inp.cogs_pct, "status": "estimated"},
        "wage": {"hourly": inp.hourly_wage, "status": inp.wage_status, "burden": inp.labor_burden},
        "utilities": {"lowExpHigh": inp.utilities_monthly, "status": "estimated (catalog)"},
        "buildout": {"lowExpHigh": inp.buildout, "scope": inp.buildout_scope},
        "presence": {"index": inp.presence_index, "sd": inp.presence_sd, "source": inp.presence_source,
                     "mapping": "demand multiplier = 0.6 + 0.8 * presence (assumption)"},
        "loan": terms, "equity": inp.equity,
    }


def _det(inp, terms, principal, **over):
    """Deterministic path (all drivers at expected values, no noise). over: presence, check, rent factor."""
    one = np.ones((1, MONTHS))
    d = {"presence": np.array([over.get("presence", inp.presence_index)]),
         "check": np.array([over.get("check", inp.avg_check[1])]), "cogs": np.array([over.get("cogs", inp.cogs_pct[1])]),
         "wage": np.array([over.get("wage", inp.hourly_wage)]), "util": np.array([inp.utilities_monthly[1]]),
         "build": np.array([inp.buildout[1]]), "ramp": np.array([inp.ramp_months[1]])}
    i2 = Inputs(**{**asdict(inp), "rent_monthly": over.get("rent", inp.rent_monthly)})
    return _core(i2, d, one, terms, principal)


def sens(inp, terms, principal, seed):
    """One-at-a-time swing of deterministic minimum cash across each driver's low/high."""
    base = float(_det(inp, terms, principal)["cash"].min())
    rows = []
    specs = [("presence", max(inp.presence_index - inp.presence_sd, 0), min(inp.presence_index + inp.presence_sd, 1)),
             ("check", inp.avg_check[0], inp.avg_check[2]), ("cogs", inp.cogs_pct[2], inp.cogs_pct[0]),
             ("wage", inp.hourly_wage * 1.25, inp.hourly_wage * 0.9),
             ("rent", inp.rent_monthly * 1.25, inp.rent_monthly * 0.75)]
    for k, bad, good in specs:
        lo = float(_det(inp, terms, principal, **{k: bad})["cash"].min())
        hi = float(_det(inp, terms, principal, **{k: good})["cash"].min())
        rows.append({"driver": k, "badValue": bad, "goodValue": good, "minCashBad": lo, "minCashGood": hi, "swing": hi - lo})
    rows.sort(key=lambda r: -r["swing"])
    return {"baseMinCash": base, "metric": "deterministic 36-month minimum cash", "drivers": rows}


def flip(inp, terms, principal):
    """Smallest value of each driver at which deterministic minimum cash stops being negative (bisection)."""
    out = {}
    def f(k, v): return float(_det(inp, terms, principal, **{k: v})["cash"].min())
    for k, lo, hi in (("presence", 0.0, 1.0), ("check", 1.0, inp.avg_check[2] * 3)):
        if f(k, hi) < 0:
            out[k] = {"flipValue": None, "note": f"cash stays negative even at {k}={hi:.2f}"}; continue
        if f(k, lo) >= 0:
            out[k] = {"flipValue": lo, "note": "never short at the lower bound"}; continue
        a, b = lo, hi
        for _ in range(50):
            mid = (a + b) / 2
            a, b = (mid, b) if f(k, mid) < 0 else (a, mid)
        out[k] = {"flipValue": b, "expectedValue": inp.presence_index if k == "presence" else inp.avg_check[1]}
    return out


def representative_path(inp: Inputs, seed: int = 0, n: int = 10_000) -> dict:
    """One seeded draw closest to the median ending cash; used for the ledger trail (SIMULATED)."""
    terms = _loan_terms(inp); principal = _principal(inp, terms)
    rng = np.random.default_rng(seed)
    d = _draws(inp, rng, n)
    noise = np.exp(rng.normal(-inp.seasonality_sd**2 / 2, inp.seasonality_sd, (n, MONTHS)))
    core = _core(inp, d, noise, terms, principal)
    end = core["cash"][:, -1]
    i = int(np.argmin(np.abs(end - np.median(end))))
    return {"index": i, "terms": terms, "principal": principal,
            **{k: (core[k][i] if getattr(core[k], "ndim", 0) >= 2 else core[k]) for k in ("sales", "cogs", "labor", "other", "rent", "util", "cf", "cash")},
            "cash0": float(core["cash0"][i]), "pmt": float(core["pmt"]),
            "equity": float(inp.equity), "build": float(d["build"][i]), "fee": float(principal * terms["upfrontFeePct"]),
            "preOpenRent": float(inp.rent_monthly * inp.pre_open_months)}
