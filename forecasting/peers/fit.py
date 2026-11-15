"""Select kNN hyper-parameters by cross-validation, evaluate honestly on held-out time, and write the peers index artifact.

Protocol (all declared before looking at held-out numbers; see docs/models/business-knn.md):
  * Unit = one food-tenancy spell (company location x building) that started 2012 or later, in Houston or LA, not lodging/corporate.
  * "As-of" prediction: for a target spell starting at t0, only peers that started before t0 are used, and a peer that ended after t0 is
    censored at t0. Nothing from the target's future leaks in. The target itself is always excluded.
  * Tuning window: targets starting 2015-2019 (pool grows from 2012). Held-out window: targets starting 2020-2024, never used to choose anything.
  * Selection objective: Brier(closed within 2y) + Brier(tenancy ended within 2y) over the tuning window.
  * Baselines: the as-of market prior (same market, unweighted Aalen-Johansen), the as-of global prior and the global median tenure.
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import numpy as np

from forecasting.peers import peers_knn as K

TUNE_YEARS, TEST_YEARS = (2015, 2019), (2020, 2024)
DEFAULT_CONFIGS = 300
INDEX_NAME = "peers_index.json"


def _spell_json(s: dict) -> dict:
    return {**s, "start": s["start"].isoformat(), "end": s["end"].isoformat() if s["end"] else None}


def _spell_from_json(s: dict) -> dict:
    return {**s, "start": date.fromisoformat(s["start"]), "end": date.fromisoformat(s["end"]) if s.get("end") else None}


SELECT_TOLERANCE = 0.002  # configs within this of the best tuning objective count as tied


def select(rows: list[dict]) -> K.Params:
    """One-standard-error-style rule, declared up front: among located (geography on) configs whose tuning objective is within
    SELECT_TOLERANCE of the best, take the smoothest (largest k, then largest bandwidth, then most shrinkage). Differences below the
    tolerance are noise at this sample size, and smoother models give wider, more honest neighbourhoods."""
    located = [r for r in rows if r["params"].h_miles < 1e5]
    tied = [r for r in located if r["objective"] <= located[0]["objective"] + SELECT_TOLERANCE]
    return max(tied, key=lambda r: (r["params"].k, r["params"].h_miles, r["params"].shrink_m))["params"]


def _strip(res: dict) -> dict:
    """Scores only (no per-target arrays), numbers rounded for the report."""
    def r(x):
        if isinstance(x, dict):
            return {k: r(v) for k, v in x.items()}
        if isinstance(x, float):
            return round(x, 4)
        return x
    return r({k: v for k, v in res.items() if k not in ("keep", "pred")})


def run_evaluation(pool: list[dict], n_configs: int = DEFAULT_CONFIGS, seed: int = 3, reps: int = 400) -> tuple[K.Params, dict]:
    tab = K.SpellTable(pool)
    yr = np.array([s["start"].year for s in pool])
    tune_idx = np.flatnonzero((yr >= TUNE_YEARS[0]) & (yr <= TUNE_YEARS[1]))
    test_idx = np.flatnonzero((yr >= TEST_YEARS[0]) & (yr <= TEST_YEARS[1]))
    configs = K.random_configs(n_configs, seed)
    rows = K.tune(tab, tune_idx, configs)
    best = select(rows)
    spatial = next(r for r in rows if r["params"].w_kind == 0 and not (r["params"].w_size or r["params"].w_class or r["params"].w_age or r["params"].w_ptype))["params"]
    kind_only = next(r for r in rows if r["params"].h_miles >= 1e5)["params"]

    main = K.evaluate_split(tab, test_idx, best)
    out = {
        "protocol": "as-of leave-one-out: peers started before the target, outcomes censored at the target's start; target excluded",
        "data": {"spells": len(pool), "buildings": int(len(np.unique(tab.prop))), "closures": int((tab.etype == 1).sum()),
                 "otherExits": int((tab.etype == 2).sum()), "open": int((tab.etype == 0).sum()),
                 "kinds": {k: int((tab.kind == i).sum()) for i, k in enumerate(K.kinds.KINDS) if (tab.kind == i).any()}},
        "tuning": {"window": TUNE_YEARS, "targets": int(len(tune_idx)), "configsTried": len(configs),
                   "top": [{"params": r["params"].metric_dict(), "closureBrier": round(r["closure"], 4), "endedBrier": round(r["ended"], 4)} for r in rows[:5]],
                   "tuningWindowMarketPriorBrier": {"closure": round(rows[0]["closureMarket"], 4), "ended": round(rows[0]["endedMarket"], 4)}},
        "selected": best.metric_dict(), "selectionRule": f"smoothest config within {SELECT_TOLERANCE} of the best tuning objective (geography on)",
        "heldOut": {"window": TEST_YEARS, "main": _strip(main), "deltaVsMarketPrior": K.cluster_bootstrap_delta(tab, main, reps),
                    "reliabilityClosure": K.reliability(main["pred"]["closure"], main["pred"]["yc"]),
                    "reliabilityEnded": K.reliability(main["pred"]["ended"], main["pred"]["ye"])},
    }
    # Where does the skill (if any) come from? Ablations and exclusions, all on the held-out window.
    abl = {}
    building_only = K.Params(**{**best.metric_dict(), "h_miles": 1e6})  # selected weights with geography switched off
    for name, prm, kw in (("spatialOnly", spatial, {}), ("kindOnly", kind_only, {}), ("buildingTypeAgeOnlyNoGeography", building_only, {}), ("selectedExcludingOwnBuilding", best, {"same_building": False}),
                          ("selectedExcludingPeersWithin1mi", best, {"block_miles": 1.0}), ("selectedHindsightNotAsOf", best, {"as_of": False})):
        res = K.evaluate_split(tab, test_idx, prm, **kw)
        abl[name] = {"params": prm.metric_dict(), **_strip(res), "deltaVsMarketPrior": K.cluster_bootstrap_delta(tab, res, reps)}
    out["heldOut"]["ablations"] = abl
    # k curve: all other selected values held fixed
    kc = []
    for k in K.GRID["k"]:
        prm = K.Params(**{**best.metric_dict(), "k": k})
        tr = K.evaluate_split(tab, tune_idx, prm)
        te = K.evaluate_split(tab, test_idx, prm)
        kc.append({"k": k, "tuneObjective": round(K.objective(tr), 4), "heldOutClosureBrier": round(te["closure2y"]["brier"]["knn"], 4),
                   "heldOutEndedBrier": round(te["ended2y"]["brier"]["knn"], 4)})
    out["kCurve"] = kc
    # Leakage check: permute the outcome block (start/end/etype/years) across spells, keep features. Skill must vanish.
    rng = np.random.default_rng(0)
    perm = rng.permutation(len(pool))
    shuffled = []
    for i, s in enumerate(pool):
        o = pool[perm[i]]
        shuffled.append({**s, "start": o["start"], "end": o["end"], "etype": o["etype"], "years": o["years"]})
    ptab = K.SpellTable(shuffled)
    pres = K.evaluate_split(ptab, np.flatnonzero((np.array([s["start"].year for s in shuffled]) >= TEST_YEARS[0]) & (np.array([s["start"].year for s in shuffled]) <= TEST_YEARS[1])), best)
    out["leakage"] = {"outcomePermutation": {"closure2y": _strip(pres)["closure2y"], "ended2y": _strip(pres)["ended2y"],
                                              "note": "outcomes shuffled across spells, features kept: kNN must show no skill over the market prior"}}
    # Full-period as-of LOO with the selected parameters (the window used for tuning is included, so it is optimistic; for information)
    allidx = np.flatnonzero((yr >= TUNE_YEARS[0]) & (yr <= TEST_YEARS[1]))
    allres = K.evaluate_split(tab, allidx, best)
    out["fullPeriodAsOfLOO"] = {"note": "includes the tuning window: optimistic, not a held-out result", **_strip(allres),
                                "deltaVsMarketPrior": K.cluster_bootstrap_delta(tab, allres, reps)}
    out["verdict"] = verdict(out)
    return best, out


def verdict(ev: dict) -> dict:
    d = ev["heldOut"]["deltaVsMarketPrior"]
    res = {}
    for k, label in (("closure2y", "clear closure within 2 years"), ("ended2y", "tenancy ended within 2 years")):
        x = d[k]
        better = x["high"] < 0
        worse = x["low"] > 0
        res[k] = {"deltaBrier": round(x["delta"], 4), "ci95": [round(x["low"], 4), round(x["high"], 4)],
                  "conclusion": (f"kNN beats the market prior for {label} (95% CI of the Brier difference is below 0)" if better else
                                 f"kNN is WORSE than the market prior for {label}" if worse else
                                 f"kNN is not distinguishable from the market prior for {label} (95% CI of the Brier difference includes 0)")}
    return res


def load_index(out_dir: str | Path) -> dict | None:
    p = Path(out_dir) / INDEX_NAME
    if not p.is_file():
        return None
    idx = json.loads(p.read_text(encoding="utf-8"))
    idx["pool"] = [_spell_from_json(s) for s in idx["pool"]]
    return idx
