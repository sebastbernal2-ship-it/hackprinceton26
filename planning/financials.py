"""Financial line items for one space: equipment, install, repairs, maintenance, utilities.

Pure functions over data/financial/catalog.json. Totals use (low, expected, high) per line; unknown lines are
reported and excluded, never counted as zero. Scenario analysis, not a forecast."""
from __future__ import annotations

from . import price_catalog as pc
from .price_catalog import band
from .scenario import Line, Scenario

AS_OF_KEY = "asOf"


def _r(x):
    return None if x is None else round(x, 2)


def _line(item_id, label, category, quantity, unit, lo, ex, hi, basis, status, source, as_of, rationale, **extra):
    d = {"itemId": item_id, "label": label, "category": category, "quantity": quantity, "unit": unit,
         "low": _r(lo), "expected": _r(ex), "high": _r(hi), "currency": "USD", "basis": basis, "status": status,
         "source": source, "asOf": as_of, "rationale": rationale}
    d.update({k: _r(v) for k, v in extra.items() if v is not None})
    return d


def area_for(city: str | None, state: str | None) -> dict | None:
    """Map a listing to a utility area. Only Houston, TX and Los Angeles, CA have fetched rates."""
    c, st = (city or "").lower(), (state or "").upper()
    if "houston" in c and st in ("TX", ""):
        return {"state": "TX", "city": "Houston"}
    if "los angeles" in c and st in ("CA", ""):
        return {"state": "CA", "city": "Los Angeles"}
    return None


def equipment_lines(d: dict) -> list[dict]:
    out = []
    for e in d["equipment"]:
        q = e.get("defaultQuantity", 1)
        if e["priceStatus"] == "observed":
            lo = ex = hi = e["listPrice"] * q
            src = e["vendorUrl"]
        else:
            lo, ex, hi = (v * q for v in band(e["listPrice"], "costBand", d))
            src = "estimate://neutral-band-v1 (reference: " + e["vendorUrl"] + ")"
        out.append(_line(f'equip:{e["id"]}', f'{e["label"]} - {e["manufacturer"]} {e["model"]}', "equipment", q, "each",
                         lo, ex, hi, "one_time", e["priceStatus"], src, e["asOf"],
                         e["priceNote"] + " Excludes freight/install (see allowance line)."))
    ia = d["installAllowance"]
    lo, ex, hi = band(ia["referenceFractionOfEquipment"] * pc.equipment_subtotal(d), "costBand", d)
    out.append(_line(ia["id"], ia["label"], "buildout", 1, "lump_sum", lo, ex, hi, "one_time", "estimated",
                     "estimate://neutral-band-v1", d["asOf"], ia["rationale"]))
    return out


def repair_lines(d: dict, repairs: dict[str, float] | None) -> list[dict]:
    """One line per defect category. quantity None -> status unknown, totals null (never zero)."""
    repairs = repairs or {}
    out = []
    for r in d["repairUnitCosts"]:
        q = repairs.get(r["category"])
        iid = f'repair:{r["category"]}'
        if r["status"] == "unknown":
            out.append(_line(iid, r["label"], "repair", q, r["unit"], None, None, None, "one_time", "unknown",
                             "none", d["asOf"], r["rationale"]))
            continue
        if r["status"] == "observed":
            ulo, uhi = r["low"], r["high"]; uex = (ulo + uhi) / 2; src = r["sourceUrl"]
        else:
            ulo, uex, uhi = band(r["reference"], "costBand", d); src = "estimate://neutral-band-v1"
        unit_txt = f" Unit cost ({r['unit']}): low {ulo:g} / expected {uex:g} / high {uhi:g}."
        if q is None:
            out.append(_line(iid, r["label"], "repair", None, r["unit"], None, None, None, "one_time", "unknown",
                             src, d["asOf"], "Quantity unknown (no confirmed finding)." + unit_txt + " " + r["rationale"],
                             unitLow=ulo, unitExpected=uex, unitHigh=uhi))
        else:
            out.append(_line(iid, r["label"], "repair", q, r["unit"], q * ulo, q * uex, q * uhi, "one_time",
                             r["status"], src, d["asOf"], r["rationale"] + unit_txt,
                             unitLow=ulo, unitExpected=uex, unitHigh=uhi))
    return out


def maintenance_lines(d: dict) -> list[dict]:
    out = []
    for m in d["maintenance"]:
        lo, ex, hi = band(m["referenceAnnual"], "costBand", d)
        out.append(_line(m["id"], m["label"], "maintenance", 1, "year", lo, ex, hi, "annual", "estimated",
                         "estimate://neutral-band-v1", d["asOf"], m["rationale"]))
    return out


def _hours(d):
    o = d["operatingAssumptions"]
    return o["hoursPerDay"] * o["daysPerMonth"]


def _triples(base: float, rating_status: str, d: dict, duty_class: str | None):
    """(low, expected, high) of base x rating band x duty band; products of lows/expecteds/highs."""
    rb = band(base, "ratingBand", d) if rating_status == "estimated" else (base, base, base)
    duty = d["operatingAssumptions"]["dutyCycle"][duty_class] if duty_class else {"low": 1, "expected": 1, "high": 1}
    return tuple(r * duty[k] for r, k in zip(rb, ("low", "expected", "high")))


def utility_lines(d: dict, area: dict | None) -> list[dict]:
    """Monthly utility cost per equipment item for the area. No area -> one unknown line, not zeros."""
    if area is None:
        return [_line("util:area", "Utilities (area has no fetched rates)", "utility", None, "month", None, None, None,
                      "monthly", "unknown", "none", d["asOf"],
                      "Only Houston TX and Los Angeles CA rates were fetched; other areas stay unknown.")]
    st = area["state"]
    rates = {r["id"]: r for r in d["utilityRates"] + d["waterRates"]}
    el, gs = rates[f"electricity_{st}"], rates[f"gas_{st}"]
    hrs, btu_mcf = _hours(d), d["operatingAssumptions"]["btuPerMcf"]
    out = []
    water_gal = []  # (equip, (lo,ex,hi) gal/month)
    for e in d["equipment"]:
        p = e.get("power") or {}
        if "kW" in p:
            k = _triples(p["kW"], p["status"], d, e["dutyClass"])
            kwh = tuple(x * hrs for x in k)
            lo, ex, hi = (x * el["value"] for x in kwh)
            out.append(_line(f'util_elec:{e["id"]}', f'Electricity - {e["label"]}', "utility", None, "month", lo, ex, hi,
                             "monthly", "estimated", el["sourceUrl"], el["asOf"],
                             f'{p["kW"]} kW ({p["status"]}: {p["rationale"]}) x {hrs} h/month x {e["dutyClass"]} duty cycle '
                             f'(assumption) x {el["value"]} USD/kWh ({el["status"]}, EIA {el["period"]}, {st} state average). '
                             f'kWh/month low/expected/high = {kwh[0]:.0f}/{kwh[1]:.0f}/{kwh[2]:.0f}.',
                             ))
        if "btuh" in p:
            b = _triples(p["btuh"], p["status"], d, e["dutyClass"])
            mcf = tuple(x * hrs / (btu_mcf * 1000) for x in b)
            lo, ex, hi = (x * gs["value"] for x in mcf)
            out.append(_line(f'util_gas:{e["id"]}', f'Natural gas - {e["label"]}', "utility", None, "month", lo, ex, hi,
                             "monthly", "estimated", gs["sourceUrl"], gs["asOf"],
                             f'{p["btuh"]} BTU/h ({p["status"]}) x {hrs} h/month x {e["dutyClass"]} duty (assumption) / '
                             f'{btu_mcf} BTU/cf x {gs["value"]} USD/Mcf ({gs["status"]}, EIA {gs["period"]}, {st} state average). '
                             f'Mcf/month low/expected/high = {mcf[0]:.2f}/{mcf[1]:.2f}/{mcf[2]:.2f}.'))
        w = e.get("waterGalPerDay")
        if w:
            g = tuple(x * d["operatingAssumptions"]["daysPerMonth"] for x in _triples(w["value"], w["status"], d, None))
            water_gal.append((e, g))
    if st == "TX":
        wr = rates["water_sewer_houston"]
        for e, g in water_gal:
            lo, ex, hi = (g[0] / 1000 * wr["low"], g[1] / 1000 * wr["expected"], g[2] / 1000 * wr["high"])
            out.append(_line(f'util_water:{e["id"]}', f'Water + sewer - {e["label"]}', "utility", None, "month", lo, ex, hi,
                             "monthly", "estimated", wr["sourceUrl"], wr["asOf"],
                             f'{e["waterGalPerDay"]["value"]} gal/day ({e["waterGalPerDay"]["rationale"]}) with rating band, '
                             f'x {d["operatingAssumptions"]["daysPerMonth"]} days; Houston volume rate {wr["low"]}/{wr["expected"]}/{wr["high"]} '
                             f'USD/1000 gal. {wr["rationale"]}'))
    else:
        wr = rates["water_los_angeles"]
        t1, t2 = wr["tier1"], wr["tier2"]
        rt = (t1, (t1 + t2) / 2, t2)
        for e, g in water_gal:
            lo, ex, hi = (g[0] / wr["galPerHcf"] * rt[0], g[1] / wr["galPerHcf"] * rt[1], g[2] / wr["galPerHcf"] * rt[2])
            out.append(_line(f'util_water:{e["id"]}', f'Water (volume charge only) - {e["label"]}', "utility", None, "month",
                             lo, ex, hi, "monthly", "estimated", wr["sourceUrl"], wr["asOf"],
                             f'{e["waterGalPerDay"]["value"]} gal/day with rating band x {d["operatingAssumptions"]["daysPerMonth"]} days / '
                             f'{wr["galPerHcf"]} gal per HCF x {t1}/{(t1 + t2) / 2:.4f}/{t2} USD/HCF. {wr["rationale"]}'))
        sw = rates["sewer_los_angeles"]
        out.append(_line("util_sewer:los_angeles", sw["label"], "utility", None, "month", None, None, None, "monthly",
                         "unknown", "none", sw["asOf"], sw["rationale"]))
    return out


def all_lines(city=None, state=None, repairs=None, path=None) -> list[dict]:
    d = pc.load_financial_json(path)
    return (equipment_lines(d) + repair_lines(d, repairs) + maintenance_lines(d)
            + utility_lines(d, area_for(city, state)))


def totals(lines: list[dict]) -> dict:
    """oneTime and monthly (annual/12 folded into monthly) sums over lines with values. Unknown lines excluded
    and listed; totals None when no line is computable."""
    acc = {"oneTime": [0.0, 0.0, 0.0, 0], "monthly": [0.0, 0.0, 0.0, 0]}
    excluded = []
    for ln in lines:
        if ln["expected"] is None:
            excluded.append(ln["itemId"]); continue
        key, div = ("oneTime", 1) if ln["basis"] == "one_time" else ("monthly", 12 if ln["basis"] == "annual" else 1)
        for i, k in enumerate(("low", "expected", "high")):
            acc[key][i] += ln[k] / div
        acc[key][3] += 1
    def box(a):
        return {"low": _r(a[0]), "expected": _r(a[1]), "high": _r(a[2])} if a[3] else {"low": None, "expected": None, "high": None}
    if not (acc["oneTime"][3] or acc["monthly"][3]):
        return {"totals": None, "totalsStatus": "none computable", "excludedLineIds": excluded}
    status = "partial: excludes unknown lines (not zero)" if excluded else "complete"
    return {"totals": {"oneTime": box(acc["oneTime"]), "monthly": box(acc["monthly"])},
            "totalsStatus": status, "excludedLineIds": excluded}


def counts(lines: list[dict]) -> dict:
    c = {"observed": 0, "estimated": 0, "unknown": 0}
    for ln in lines:
        c[ln["status"]] += 1
    return c


def build_scenario(repairs: dict[str, float] | None = None, *, tasks=(), monthly_rent=None, rent_free_months=None,
                   delay_cost_per_month=None, planned_open_months=None, budget=None,
                   contingency=(0.10, 0.20), path=None) -> Scenario:
    """Scenario over equipment + install allowance + confirmed repairs so estimated inputs show in flip analysis.
    Contingency default is a stated assumption. Repair categories without quantity are omitted (see unknown lines)."""
    cat = pc.load_financial_catalog(path)
    d = pc.load_financial_json(path)
    lines = [Line(e["id"], e.get("defaultQuantity", 1)) for e in d["equipment"]]
    lines.append(Line(d["installAllowance"]["id"], 1))
    for cat_name, q in (repairs or {}).items():
        lines.append(Line(f"repair:{cat_name}", q))
    return Scenario(tuple(lines), contingency[0], contingency[1], tuple(tasks), monthly_rent, rent_free_months,
                    delay_cost_per_month, planned_open_months, budget, catalog=tuple(cat.values()))
