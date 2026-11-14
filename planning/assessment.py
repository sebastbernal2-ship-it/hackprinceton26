"""Scenario assessment for one space: cost lines + seeded Monte Carlo + sensitivity/flip analysis.

Pure functions (no I/O beyond the catalog file). Every number is scenario analysis, not a forecast.
Build-out basis (always computed when a budget is given): equipment + install allowance + confirmed repairs
vs budget. Full basis (only when rent, delay cost and planned-open months are supplied): adds dead rent and delay
cost from simulated time-to-open. Task durations are a labelled default ASSUMPTION unless the caller supplies them."""
from __future__ import annotations

from dataclasses import asdict, replace

from . import financials, monte_carlo, sensitivity
from . import price_catalog as pc
from .scenario import Line, Scenario
from .timeline_model import Task

LABEL = "scenario analysis, not a forecast"
CONTINGENCY = (0.10, 0.20)
# Default schedule: stated assumption only (no cited source); callers may override via `tasks`.
DEFAULT_TASKS = (Task("design_and_permit", 1.0, 2.0, 4.0), Task("build_out", 1.0, 2.0, 4.0))
ZERO_TIME = (Task("buildout_only_no_schedule", 0.0, 0.0, 0.0),)


def _iv(i):
    return None if i is None else {"p5": round(i.p5, 2), "p50": round(i.p50, 2), "p95": round(i.p95, 2)}


def _chosen(d: dict, equipment) -> list[tuple[dict, float]]:
    """(catalog equipment, quantity) for the selected equipment. None = catalog defaults; [] = none."""
    by_id = {e["id"]: e for e in d["equipment"]}
    if equipment is None:
        return [(e, e.get("defaultQuantity", 1)) for e in d["equipment"]]
    out = []
    for c in equipment:
        cid, q = (c, None) if isinstance(c, str) else (c["id"], c.get("quantity"))
        if cid not in by_id:
            raise ValueError(f"unknown equipment id: {cid}")
        out.append((by_id[cid], by_id[cid].get("defaultQuantity", 1) if q is None else q))
    return out


def _override(raw, item_id) -> tuple[float, float]:
    lo, hi = (raw, raw) if isinstance(raw, (int, float)) else (raw["low"], raw["high"])
    if lo < 0 or lo > hi:
        raise ValueError(f"price override for {item_id}: need 0 <= low <= high")
    return float(lo), float(hi)


def build(equipment=None, price_overrides=None, repairs=None, path=None):
    """(catalog items by id, Scenario lines, adjusted equipment/install cost lines for display)."""
    d = pc.load_financial_json(path)
    cat = pc.load_financial_catalog(path)
    po = dict(price_overrides or {})
    chosen = _chosen(d, equipment)
    items, lines = {}, []
    for e, q in chosen:
        it = cat[e["id"]]
        if e["id"] in po:
            lo, hi = _override(po.pop(e["id"]), e["id"])
            it = replace(it, price_low=lo, price_high=hi, source_url="user://override", status="estimated",
                         limitations="user-supplied unit price (assumption, not observed)")
        items[e["id"]] = it
        lines.append(Line(e["id"], q))
    ia = d["installAllowance"]
    sub = sum(e["listPrice"] * q for e, q in chosen)
    if sub > 0:
        lo, _, hi = pc.band(ia["referenceFractionOfEquipment"] * sub, "costBand", d)
        items[ia["id"]] = replace(cat[ia["id"]], price_low=lo, price_high=hi)
        lines.append(Line(ia["id"], 1))
    for k, q in (repairs or {}).items():
        rid = f"repair:{k}"
        if rid not in cat:
            raise ValueError(f"unknown repair category: {k}")
        items[rid] = cat[rid]
        lines.append(Line(rid, q))
    if po:
        raise ValueError(f"price overrides for items not in scenario: {sorted(po)}")
    return d, items, lines


def cost_lines(city, state, equipment, price_overrides, repairs, path=None) -> list[dict]:
    """financials.all_lines restricted to the chosen equipment, with user price overrides and a rescaled install line."""
    d, items, _ = build(equipment, price_overrides, repairs, path)
    eq_ids = {i for i in items if i in {e["id"] for e in d["equipment"]}}
    ia_id = d["installAllowance"]["id"]
    out = []
    for ln in financials.all_lines(city, state, repairs, path):
        iid = ln["itemId"]
        base, _, eid = iid.partition(":")
        if base == "equip" and eid not in eq_ids:
            continue
        if base.startswith("util_") and eid in {e["id"] for e in d["equipment"]} and eid not in eq_ids:
            continue
        if base == "equip" and items[eid].source_url == "user://override":
            it, q = items[eid], ln["quantity"]
            ln = dict(ln, low=round(it.price_low * q, 2), expected=round((it.price_low + it.price_high) / 2 * q, 2),
                      high=round(it.price_high * q, 2), status="estimated", source="user://override",
                      rationale="User-supplied unit price override (assumption, not observed).")
        if iid == ia_id:
            if ia_id not in items:
                continue
            it = items[ia_id]
            ln = dict(ln, low=round(it.price_low, 2), expected=round((it.price_low + it.price_high) / 2, 2),
                      high=round(it.price_high, 2))
        out.append(ln)
    return out


def buildout_bounds(path=None) -> tuple[float, float]:
    """(low, high) of default equipment + install one-time cost, no repairs: the interval the budget filter tests.
    Excludes repairs and hidden defects, so 'high' is not a true upper bound."""
    t = financials.totals(cost_lines(None, None, None, None, None, path))["totals"]
    return t["oneTime"]["low"], t["oneTime"]["high"]


def _scenario(items, lines, budget, *, tasks, rent, rent_free, delay_cost, planned) -> Scenario:
    return Scenario(tuple(lines), CONTINGENCY[0], CONTINGENCY[1], tuple(tasks), rent, rent_free, delay_cost, planned,
                    budget, catalog=tuple(items.values()))


def _sens(s: Scenario, n: int, seed: int) -> dict:
    r = sensitivity.analyse(s, n=max(500, n // 5), seed=seed)
    return {"status": r.status, "baselinePOver": r.baseline_p_over, "threshold": r.threshold,
            "oat": [asdict(x) for x in r.oat], "flips": [asdict(f) for f in r.flips],
            "note": "Flip = smallest multiplicative change to one assumption that moves P(over budget) across 0.5."}


def assess(city=None, state=None, *, budget=None, equipment=None, price_overrides=None, repairs=None,
           lease_start_delay_months=0.0, monthly_rent=None, rent_free_months=None, delay_cost_per_month=None,
           planned_open_months=None, tasks=None, n=5000, seed=0, path=None) -> dict:
    d, items, lines = build(equipment, price_overrides, repairs, path)
    cl = cost_lines(city, state, equipment, price_overrides, repairs, path)
    t = financials.totals(cl)
    used = [{"key": "contingency", "value": list(CONTINGENCY), "basis": "assumption", "note": "uniform fraction on build-out"},
            {"key": "equipment", "value": [i.item_id for i in items.values() if i.item_id in {e["id"] for e in d["equipment"]}],
             "basis": "catalog default" if equipment is None else "user choice"}]
    if price_overrides:
        used.append({"key": "unitPriceOverrides", "value": price_overrides, "basis": "user assumption"})
    out = {"label": LABEL, "lines": cl, "totals": t["totals"], "totalsStatus": t["totalsStatus"],
           "excludedLineIds": t["excludedLineIds"], "statusCounts": financials.counts(cl),
           "budget": budget, "seed": seed, "draws": n, "method": monte_carlo.METHOD,
           "buildout": None, "pOverBudgetBuildout": None, "total": None, "pOverBudget": None, "sensitivity": None,
           "sensitivityBasis": None, "analysisBasis": "unknown", "assumptionsUsed": used, "unknownInputs": {},
           "notes": ["Repair lines without a confirmed quantity are excluded from the simulation, not counted as zero; "
                     "a scan or photo cannot prove hidden defects.",
                     "Intervals are p5-p95 spreads of stated input ranges, not confidence intervals."]}
    if not lines:
        out["notes"].append("No equipment selected: nothing to simulate.")
        return out
    bo = _scenario(items, lines, budget, tasks=ZERO_TIME, rent=0.0, rent_free=0.0, delay_cost=0.0, planned=0.0)
    r = monte_carlo.run(bo, n, seed)
    out["buildout"] = _iv(r.buildout)
    out["pOverBudgetBuildout"] = r.p_over_budget
    if budget is None:
        out["unknownInputs"]["budget"] = ["budget"]
    elif r.p_over_budget is not None:
        out["analysisBasis"] = "buildout_only"
        out["sensitivity"], out["sensitivityBasis"] = _sens(bo, n, seed), "buildout_only"
        out["notes"].append("pOverBudgetBuildout compares build-out cost only (rent and delay excluded by definition, "
                            "not assumed zero).")
    # full basis only when the occupancy and delay inputs are actually supplied
    need = {"monthly_rent": monthly_rent, "delay_cost_per_month": delay_cost_per_month, "planned_open_months": planned_open_months}
    missing = [k for k, v in need.items() if v is None]
    if missing:
        out["unknownInputs"]["full_basis"] = missing
        return out
    rf = float(rent_free_months or 0.0) + float(lease_start_delay_months or 0.0)
    used += [{"key": "tasks", "value": [[x.name, x.low, x.mode, x.high] for x in (tasks or DEFAULT_TASKS)],
              "basis": "user assumption" if tasks else "default assumption (uncited)"},
             {"key": "rent_free_months_effective", "value": rf, "basis": "rent-free input + lease-start delay"}]
    full = _scenario(items, lines, budget, tasks=tasks or DEFAULT_TASKS, rent=monthly_rent, rent_free=rf,
                     delay_cost=delay_cost_per_month, planned=planned_open_months)
    fr = monte_carlo.run(full, n, seed)
    out["total"], out["pOverBudget"] = _iv(fr.total), fr.p_over_budget
    out["timeToOpenMonths"] = _iv(fr.time_to_open_months)
    if fr.p_over_budget is not None:
        out["analysisBasis"] = "buildout_plus_rent_and_delay"
        out["sensitivity"], out["sensitivityBasis"] = _sens(full, n, seed), "buildout_plus_rent_and_delay"
    return out
