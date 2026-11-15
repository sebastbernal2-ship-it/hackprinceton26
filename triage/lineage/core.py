"""Restaurant lineage: per-building food-tenant timelines from CoStar tenancy spells.

Pure functions over plain dicts (kit records), so tests can use synthetic data.
Definitions (all assumptions are explicit and returned in the outputs):
- tenant = one company location (tenantLocationId) at one property; its occupancies there are merged.
- end types: open (no toDate, or toDate after as-of: a scheduled end is not an observation),
  failure (expirationReason 4 = ClosedLocationOrBankrupt, CoStar's research label), other_exit (everything
  else, including 10 MovingOutNewAddressUnknown, which is NOT failure; a renewal/relocation is not a closure).
- successor = another food-service tenant at the same property whose first fromDate is within
  SUCCESSOR_WINDOW_DAYS after (or up to 30 days before) the end. In multi-tenant buildings this can be a
  neighbouring space, not the same suite.
"""
from __future__ import annotations

import math
import random
import statistics
from datetime import date, datetime

FOOD = 17  # IndustryType.AccommodationAndFoodServices
FAILURE_REASON = 4
SUCCESSOR_WINDOW_DAYS = 365
OVERLAP_DAYS = 30
CHURN_MIN_TENANTS = 3
CHURN_MEDIAN_YEARS = 2.0  # screening rule, not validated
DAYS_PER_YEAR = 365.25
MARKET_PRIOR_LABEL = "exploratory market prior, not a per-site prediction"


def _d(s):
    return datetime.fromisoformat(s).date() if s else None


def merge_tenants(occupancies: list[dict], asof: date) -> list[dict]:
    """occupancies: food-service occupancies of ONE property, each with tenantLocationId, fromDate, toDate,
    expirationReason (+ optional name). Returns tenants sorted by start."""
    by: dict = {}
    for o in occupancies:
        by.setdefault(o.get("tenantLocationId"), []).append(o)
    out = []
    for tid, occs in by.items():
        starts = [_d(o.get("fromDate")) for o in occs]
        starts_known = [s for s in starts if s]
        start = min(starts_known) if starts_known else None
        ends = [(_d(o.get("toDate")), o) for o in occs]
        open_ = any(e is None or e > asof for e, _ in ends)
        if open_:
            end, reason = None, None
        else:
            end, last = max(ends, key=lambda t: t[0])
            reason = last.get("expirationReason", 0)
        if start is not None and start > asof:
            continue  # not started as of the window end
        if open_:
            etype = "open"
        else:
            etype = "failure" if reason == FAILURE_REASON else "other_exit"
        years = None
        if start is not None:
            stop = end if end is not None else asof
            if stop >= start:
                years = round((stop - start).days / DAYS_PER_YEAR, 2)
        out.append({"tenantLocationId": tid, "start": start, "end": end, "etype": etype, "reason": reason,
                    "years": years, "name": next((o.get("name") for o in occs if o.get("name")), None)})
    out.sort(key=lambda t: (t["start"] is None, t["start"] or date.max, str(t["tenantLocationId"])))
    return out


def _successor(t: dict, tenants: list[dict]) -> bool | None:
    if t["end"] is None:
        return None
    for u in tenants:
        if u is t or u["start"] is None:
            continue
        gap = (u["start"] - t["end"]).days
        if -OVERLAP_DAYS <= gap <= SUCCESSOR_WINDOW_DAYS:
            return True
    return False


def building_lineage(occupancies: list[dict], asof: date, names: bool = False) -> dict:
    tenants = merge_tenants(occupancies, asof)
    rows = []
    for i, t in enumerate(tenants, 1):
        succ = _successor(t, tenants)
        row = {"tenant": f"Tenant {i}", "start": t["start"].isoformat() if t["start"] else None,
               "end": t["end"].isoformat() if t["end"] else None, "tenureYears": t["years"], "ending": t["etype"],
               "expirationReason": t["reason"], "successorWasFood": succ}
        if names:
            row["name"] = t["name"]
        rows.append(row)
    done = [t for t in tenants if t["etype"] != "open"]
    fail = [t for t in tenants if t["etype"] == "failure"]
    ended_succ = [_successor(t, tenants) for t in done]
    closures_after = [_successor(t, tenants) for t in fail]
    tenures_done = [t["years"] for t in done if t["years"] is not None]
    med = round(statistics.median(tenures_done), 2) if tenures_done else None
    churn = (len(tenants) >= CHURN_MIN_TENANTS and med is not None and med < CHURN_MEDIAN_YEARS)
    return {
        "tenants": rows,
        "counts": {"foodTenants": len(tenants), "open": len(tenants) - len(done), "ended": len(done),
                   "clearFailure": len(fail), "otherExit": len(done) - len(fail),
                   "unknownTenure": sum(1 for t in tenants if t["years"] is None)},
        "medianCompletedTenureYears": med,
        "medianTenureBasis": f"tenants whose tenancy has ended (n={len(tenures_done)}); open tenancies excluded, so this is biased short",
        "secondGeneration": {"endedWithFoodSuccessor": sum(1 for s in ended_succ if s),
                             "ended": len(done),
                             "failuresWithFoodSuccessor": sum(1 for s in closures_after if s),
                             "failures": len(fail)},
        "isSecondGenerationSpace": any(ended_succ),
        "churnFlag": churn,
        "churnRule": f">= {CHURN_MIN_TENANTS} food tenants and median completed tenure < {CHURN_MEDIAN_YEARS} years; a screening rule, not validated",
        "anonymized": not names,
    }


# ---- descriptive survival (market context only) -------------------------------------------

def km(durations: list[float], events: list[int], horizons=(1, 2, 3, 5)):
    """Kaplan-Meier of time to tenancy end (event=1 any ended; 0 censored) with Greenwood 95% CI (log-log)."""
    pairs = sorted(zip(durations, events))
    n = len(pairs)
    at_risk, s, var_sum = n, 1.0, 0.0
    curve = [(0.0, 1.0, 0.0)]
    i = 0
    while i < n:
        t = pairs[i][0]
        d = c = 0
        while i < n and pairs[i][0] == t:
            d += pairs[i][1]
            c += 1 - pairs[i][1]
            i += 1
        if d and at_risk > 0:
            s *= 1 - d / at_risk
            if at_risk > d:
                var_sum += d / (at_risk * (at_risk - d))
            curve.append((t, s, var_sum))
        at_risk -= d + c
    def at(h):
        cur = [c for c in curve if c[0] <= h]
        t, sv, v = cur[-1]
        # not evaluable when fewer than 10 spells remain at risk at the horizon
        if sum(1 for d_ in durations if d_ >= h) < 10:
            return None
        if sv <= 0 or sv >= 1 or v <= 0:
            return {"survival": round(sv, 3), "low": None, "high": None}
        se = math.sqrt(v) / abs(math.log(sv))
        lo, hi = sv ** math.exp(1.96 * se), sv ** math.exp(-1.96 * se)
        return {"survival": round(sv, 3), "low": round(lo, 3), "high": round(hi, 3)}
    med = next((c[0] for c in curve if c[1] <= 0.5), None)
    return {"n": n, "ended": sum(events), "atYears": {str(h): at(h) for h in horizons},
            "medianYears": round(med, 2) if med is not None else None}


def cumulative_failure(durations, etypes, horizon: float) -> float:
    """Aalen-Johansen cumulative incidence of clear failure (etype 1) with other exit (2) as competing risk; 0 censored."""
    pairs = sorted(zip(durations, etypes))
    n = len(pairs)
    at_risk, s, cif, i = n, 1.0, 0.0, 0
    while i < n and pairs[i][0] <= horizon:
        t = pairs[i][0]
        d1 = d2 = c = 0
        while i < n and pairs[i][0] == t:
            d1 += pairs[i][1] == 1
            d2 += pairs[i][1] == 2
            c += pairs[i][1] == 0
            i += 1
        if at_risk > 0:
            cif += s * d1 / at_risk
            s *= 1 - (d1 + d2) / at_risk
        at_risk -= d1 + d2 + c
    return cif


def survival_context(spells: list[dict], horizons=(1, 2, 3), reps=300, seed=7) -> dict:
    """spells: {propertyId, years, etype 0/1/2}. Cluster bootstrap by property for failure incidence."""
    spells = [s for s in spells if s["years"] and s["years"] > 0]
    dur = [s["years"] for s in spells]
    et = [s["etype"] for s in spells]
    ended = [1 if e else 0 for e in et]
    out = {"label": MARKET_PRIOR_LABEL, "nSpells": len(spells), "nClearFailures": sum(1 for e in et if e == 1),
           "nOtherExits": sum(1 for e in et if e == 2), "nCensored": sum(1 for e in et if e == 0),
           "tenancyEndKM": km(dur, ended) if spells else None,
           "method": "Kaplan-Meier of time to tenancy end (Greenwood 95% log-log CI); clear-failure cumulative incidence is "
                     "Aalen-Johansen with other exits competing, 95% percentile cluster bootstrap by property. "
                     "Descriptive over past tenancies; the S1 cause-specific Cox model failed its held-out gate and is not used.",
           "failureCumulativeIncidence": {}}
    if not spells:
        return out
    groups: dict = {}
    for s in spells:
        groups.setdefault(s["propertyId"], []).append(s)
    keys = list(groups)
    rng = random.Random(seed)
    boots = {h: [] for h in horizons}
    for _ in range(reps):
        samp = [x for k in (rng.choice(keys) for _ in keys) for x in groups[k]]
        d = [x["years"] for x in samp]
        e = [x["etype"] for x in samp]
        for h in horizons:
            boots[h].append(cumulative_failure(d, e, h))
    for h in horizons:
        evaluable = sum(1 for x in dur if x >= h) >= 10
        if not evaluable:
            out["failureCumulativeIncidence"][str(h)] = None
            continue
        b = sorted(boots[h])
        out["failureCumulativeIncidence"][str(h)] = {
            "expected": round(cumulative_failure(dur, et, h), 3),
            "low": round(b[int(0.025 * (len(b) - 1))], 3), "high": round(b[int(0.975 * (len(b) - 1))], 3),
            "rationale": "95% cluster-bootstrap interval around the Aalen-Johansen estimate"}
    return out
