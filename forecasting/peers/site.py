"""Per-site result: kNN peer outcomes + neighbourhood context index, shaped for the API and UI. Pure: takes already-loaded data."""
from __future__ import annotations

import numpy as np

from forecasting.peers import kinds, neighbourhood
from forecasting.peers import peers_knn as K

DEMO_TAG = "DEMO DATA"
BOOT_REPS = 300


def _iv(pt, ci, evaluable=True):
    return {"value": None if pt is None or pt != pt else round(float(pt), 3), "low": None if ci is None else round(ci[0], 3),
            "high": None if ci is None else round(ci[1], 3), "evaluable": evaluable}


def _market_only(site: dict, tab: K.SpellTable, params: K.Params) -> dict:
    """No coordinates: the unweighted same-market prior over all peers. Descriptive context, no neighbours."""
    dur, ev = tab.years, tab.etype
    mk = tab.market == site.get("market") if site.get("market") else np.ones(tab.n, dtype=bool)
    pri = K.prior(tab, dur, ev, mk)
    return {"mode": "market_prior_only",
            "survival": {str(int(h)): _iv(pri[h]["survival"], None) for h in K.HORIZONS},
            "closure2y": _iv(pri[2.0]["closure"], None), "nMarketSpells": int(mk.sum())}


def knn_block(site: dict, tab: K.SpellTable, params: K.Params, evaluation: dict | None, reps: int = BOOT_REPS) -> dict:
    concept = site.get("concept") or "cafe"
    if site.get("lat") is None or site.get("lon") is None:
        return {"status": "estimated", "method": "market prior only (no coordinates for this site)", "neighbours": [], **_market_only(site, tab, params)}
    t = K.Target(lat=site["lat"], lon=site["lon"], market=site["market"], concept=concept, sqft=site.get("sqft"), bclass=site.get("bclass"),
                 year_built=site.get("yearBuilt"), ptype=site.get("ptype"), property_id=site.get("propertyId"))
    r = K.predict(t, tab, params, reps=reps)
    if r["n"] == 0:
        return {"status": "estimated", "method": "no peers in this market", "neighbours": [], **_market_only(site, tab, params)}
    idx, w = r["idx"], r["w"]
    ev = r["estimate"]
    ci = r["ci"]
    surv = {}
    for h in K.HORIZONS:
        e = ev[h]
        surv[str(int(h))] = _iv(e["survival"], ci[h]["survival"], e["evaluable"])
        surv[str(int(h))]["source"] = "neighbours" if e["evaluable"] else "market prior (too few neighbours still observed at this horizon)"
    neigh = []
    for j, i in enumerate(idx):
        s = tab.spells[i]
        rel = kinds.relation(concept, s["kind"])
        neigh.append({"id": s["id"], "distanceMi": round(float(r["dist"][j]), 3), "kind": s["kind"], "relation": rel, "sameKind": rel == "direct",
                      "weight": round(float(w[j]), 3), "outcome": {0: "open", 1: "closed", 2: "moved"}[int(tab.etype[i])], "years": round(float(tab.years[i]), 2),
                      "startYear": s["start"].year if hasattr(s["start"], "year") else int(str(s["start"])[:4]), "market": s["market"], "demo": bool(tab.demo[i])})
    out_w = {o: round(float(sum(w[j] for j, n in enumerate(neigh) if n["outcome"] == o)), 3) for o in ("open", "closed", "moved")}
    same = [n for n in neigh if n["sameKind"]]
    pri = r["prior"]
    demo = any(n["demo"] for n in neigh)
    return {
        "status": "demo" if demo else "estimated",
        "method": "Distance- and similarity-weighted k-nearest-neighbour aggregate of peer tenancy outcomes (Kaplan-Meier / Aalen-Johansen), 5th-95th percentile "
                  "neighbour bootstrap. Describes how past nearby food businesses fared; it is not a forecast for this site.",
        "k": params.k, "metric": params.metric_dict(), "nNeighbours": r["n"], "effectiveN": round(r["nEff"], 2),
        "nearestMi": round(float(r["dist"].min()), 3), "farthestMi": round(float(r["dist"].max()), 3),
        "survival": surv, "closure2y": {**_iv(ev[2.0]["closure"], ci[2.0]["closure"], ev[2.0]["evaluable"]), "definition": "clear closure (CoStar ClosedLocationOrBankrupt) within 2 years, other exits as a competing outcome"},
        "medianCompletedTenureYears": {**_iv(r["medianCompleted"], r["ciMedianCompleted"]), "basis": "weighted median over neighbours whose tenancy has ended: biased short (open tenancies excluded)"},
        "medianTenureKM": None if r["kmMedian"] is None else round(r["kmMedian"], 2),
        "shareStillOpen": _iv(r["shareOpen"], r["ciShareOpen"]), "outcomeWeights": out_w,
        "sameKind": {"n": len(same), "open": sum(1 for n in same if n["outcome"] == "open"), "closed": sum(1 for n in same if n["outcome"] == "closed"),
                     "moved": sum(1 for n in same if n["outcome"] == "moved"), "note": "neighbours of the same kind as the concept (similarity >= 0.75); small n"},
        "marketPrior": {"survival": {str(int(h)): round(float(pri[h]["survival"]), 3) for h in K.HORIZONS},
                        "closure2y": round(float(pri[2.0]["closure"]), 3), "note": "same-market, unweighted, all peers; the baseline the kNN is judged against"},
        "neighbours": neigh,
        "evaluation": evaluation_summary(evaluation),
    }


def evaluation_summary(ev: dict | None) -> dict | None:
    if not ev:
        return None
    h = ev["heldOut"]
    return {"protocol": ev["protocol"], "heldOutWindow": h["window"], "nTargets": h["main"]["n"], "nClosed2y": h["main"]["nClosed2y"],
            "closure2y": {"brierKnn": h["main"]["closure2y"]["brier"]["knn"], "brierMarketPrior": h["main"]["closure2y"]["brier"]["marketPrior"],
                          "deltaCI95": h["deltaVsMarketPrior"]["closure2y"], "aucKnn": h["main"]["closure2y"]["auc"]["knn"]},
            "ended2y": {"brierKnn": h["main"]["ended2y"]["brier"]["knn"], "brierMarketPrior": h["main"]["ended2y"]["brier"]["marketPrior"],
                        "deltaCI95": h["deltaVsMarketPrior"]["ended2y"], "aucKnn": h["main"]["ended2y"]["auc"]["knn"]},
            "tenureMAE": h["main"]["tenureMAE"], "verdict": [v["conclusion"] for v in ev["verdict"].values()],
            "plainly": "On held-out recent tenancies the kNN is not shown to be more accurate than the same-market prior. Treat the neighbour outcomes as context, not as a prediction."}


def site_result(site: dict, pool: list[dict], others: list[dict], params: K.Params, evaluation: dict | None = None,
                demo_spells: list[dict] | None = None, reps: int = BOOT_REPS) -> dict:
    """site: {listingId, lat, lon, market, concept, sqft, bclass, yearBuilt, ptype}. demo_spells: invented peers (fixture sites), tagged demo."""
    spells = list(pool) + [{**d, "demo": True} for d in (demo_spells or [])]
    tab = K.SpellTable(spells)
    knn = knn_block(site, tab, params, evaluation, reps)
    nb = None
    if site.get("lat") is not None:
        food = [{**s, "demo": bool(s.get("demo"))} for s in spells]
        nb = neighbourhood.score(site, food, others)
        nb["sensitivity"] = neighbourhood.sensitivity(site, food, others)
        nb["status"] = "demo" if any(n["demo"] for n in nb["nearbyFood"]) else "derived"
    demo = knn.get("status") == "demo" or (nb or {}).get("status") == "demo"
    return {"listingId": site.get("listingId"), "concept": site.get("concept") or "cafe",
            "site": {k: site.get(k) for k in ("lat", "lon", "market", "locationSource")},
            "knn": knn, "neighbourhood": nb, "demo": demo,
            "demoNote": f"{DEMO_TAG}: the nearby food businesses marked demo are invented to match the hand-authored demo site; real kit neighbours are marked observed." if demo else None,
            "coverage": (nb or {}).get("coverage"),
            "labels": {"neighbours": "observed (CoStar kit tenancy records, anonymised)", "kind": "derived from the company name (heuristic, unverified)",
                       "survival, closure, tenure": "estimated (neighbour aggregates with bootstrap interval)", "index": "derived (documented rule, assumed thresholds)"}}
