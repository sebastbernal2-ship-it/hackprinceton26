"""Pooled all-industry cause-specific hazard, evaluated on the food-service subset.

PRE-DECLARED (before any model metric was computed; event counts had been inspected):
  split   train = all-industry spells starting 2012-2020, right-censored at the cutoff 2021-01-01 (no outcome after
          the cutoff enters training); test = FOOD spells starting 2021-01-01 or later, observed to the as-of date.
  model   cause-specific Cox (closure; other exit competing), ridge penalizer 0.05 fixed (not tuned on test),
          industry-group term; closure = ClosedLocationOrBankrupt only.
  naive   marginal Aalen-Johansen closure incidence of FOOD training spells (C-index 0.5 by construction).
  gate    test C-index bootstrap (resample properties) 2.5th percentile > 0.5, AND Brier skill vs naive > 0 at 1y and 2y,
          AND each of those horizons has >= 5 closures by the horizon and censoring survival >= 0.2.
Secondary (not gating): grouped-by-property 5-fold CV on the food subset, cutoff sensitivity (2022-01-01, 2024-01-01),
food-only model with the same covariates (the old survival design).

uv run --no-project --with numpy --with pandas --with lifelines python -m forecasting.hazard.train
"""
from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from forecasting.survival import metrics as M
from forecasting.survival.data import DEFAULT_ASOF
from forecasting.survival.model import grouped_folds

from . import describe as D
from .data import FOOD, apply_cutoff, build_spells
from .model import FoodOnlyPre, HazardCox

HORIZONS = (1, 2, 3)
GATE_H = (1, 2)
PEN = 0.05
CUTOFF = "2021-01-01"
MIN_EVENTS = 5


def baseline(df):
    return {t: M.aj_cif(df["years"], df["etype"], t) for t in HORIZONS}


def event_counts(df):
    return {"spells": int(len(df)), "properties": int(df["propertyId"].nunique()), "closures": int((df["etype"] == 1).sum()),
            "other_exits": int((df["etype"] == 2).sum()), "censored": int((df["etype"] == 0).sum()),
            "closures_by_h": {t: int(((df["etype"] == 1) & (df["years"] <= t)).sum()) for t in HORIZONS}}


def boot(df, cif, risk, base, b, seed):
    rng = np.random.default_rng(seed)
    props = df["propertyId"].values
    idx = {p: np.flatnonzero(props == p) for p in np.unique(props)}
    keys = list(idx)
    acc = {"c_index": [], **{f"skill_{t}": [] for t in HORIZONS}}
    for _ in range(b):
        s = np.concatenate([idx[keys[i]] for i in rng.integers(0, len(keys), len(keys))])
        r = M.evaluate(df["years"].values[s], df["etype"].values[s], {t: cif[t][s] for t in HORIZONS}, risk[s], HORIZONS, base)
        acc["c_index"].append(r["c_index"])
        for t in HORIZONS:
            acc[f"skill_{t}"].append(r["horizons"][t].get("brier_skill", np.nan))
    out = {}
    for k, v in acc.items():
        v = np.array(v, float)
        v = v[~np.isnan(v)]
        out[k] = {"lo": float(np.percentile(v, 2.5)), "hi": float(np.percentile(v, 97.5)), "se": float(v.std()), "n_valid": int(len(v))} if len(v) >= 50 else None
    return out


def evaluate_model(test, model, base, b, seed):
    cif, risk = model.cif(test, HORIZONS), model.risk(test)
    ev = M.evaluate(test["years"].values, test["etype"].values, cif, risk, HORIZONS, base)
    return ev, boot(test, cif, risk, base, b, seed), cif, risk


def gate(ev, ci):
    why = []
    lo = (ci["c_index"] or {}).get("lo")
    if lo is None or not lo > 0.5:
        why.append(f"C-index {ev['c_index']:.3f}, bootstrap lower bound {lo} not > 0.5")
    for t in GATE_H:
        h = ev["horizons"][t]
        if not h["valid"]:
            why.append(f"{t}y not evaluable: {h['reason']}")
        elif not h["brier_skill"] > 0:
            why.append(f"{t}y Brier skill {h['brier_skill']:.3f} not > 0")
    return not why, why


def split_run(spells, cutoff, b, seed, pen=PEN, with_food_only=True):
    cut = pd.Timestamp(cutoff)
    train = apply_cutoff(spells, cut)
    test = spells[(spells["start"] >= cut) & (spells["industry_group"] == FOOD)].reset_index(drop=True)
    food_tr = train[train["industry_group"] == FOOD].reset_index(drop=True)
    base = baseline(food_tr)
    res = {"cutoff": cutoff, "train_all": event_counts(train), "train_food": event_counts(food_tr), "test_food": event_counts(test), "naive_baseline_cif": base}
    pooled = HazardCox(pen).fit(train)
    ev, ci, cif, risk = evaluate_model(test, pooled, base, b, seed)
    res["pooled"] = {"eval": ev, "bootstrap": ci}
    res["gate_pass"], res["gate_reasons"] = gate(ev, ci)
    res["industry_hazard_ratios_closure"] = {k.replace("ind_", ""): float(np.exp(v)) for k, v in pooled.m1.params_.items() if k.startswith("ind_")}
    if with_food_only:
        fo = HazardCox(pen, FoodOnlyPre).fit(food_tr)
        ev2, ci2, _, _ = evaluate_model(test, fo, base, b, seed + 1)
        res["food_only"] = {"eval": ev2, "bootstrap": ci2}
    return res, pooled, train, test


def grouped_cv(spells, b, seed, pen=PEN, k=5):
    """Out-of-fold food predictions; folds by property, all industries in each training fold. Not temporal."""
    folds = grouped_folds(spells["propertyId"].values, k, seed)
    oof = {t: np.full(len(spells), np.nan) for t in HORIZONS}
    oof_b = {t: np.full(len(spells), np.nan) for t in HORIZONS}
    risk = np.full(len(spells), np.nan)
    food = (spells["industry_group"] == FOOD).values
    for tr, te in folds:
        m = HazardCox(pen).fit(spells.iloc[tr])
        te_f = te[food[te]]
        c = m.cif(spells.iloc[te_f], HORIZONS)
        risk[te_f] = m.risk(spells.iloc[te_f])
        trf = spells.iloc[tr][food[tr]]
        for t in HORIZONS:
            oof[t][te_f] = c[t]
            oof_b[t][te_f] = M.aj_cif(trf["years"], trf["etype"], t)
    f = spells[food].reset_index(drop=True)
    cif = {t: oof[t][food] for t in HORIZONS}
    # per-row naive baseline (fold specific) -> evaluate Brier skill manually through evaluate with mean baseline
    base = {t: float(np.mean(oof_b[t][food])) for t in HORIZONS}
    ev = M.evaluate(f["years"].values, f["etype"].values, cif, risk[food], HORIZONS, base)
    return {"eval": ev, "bootstrap": boot(f, cif, risk[food], base, b, seed), "counts": event_counts(f), "note": "5-fold grouped by property, not temporal; baseline = mean of fold-specific food marginal CIF"}


def sample_size_needed(res):
    """Closures needed for the C-index lower bound to clear 0.5 if the observed C were the truth (SE ~ 1/sqrt(events))."""
    ev, ci = res["pooled"]["eval"], res["pooled"]["bootstrap"]["c_index"]
    if not ci or not ev["c_index"] > 0.5:
        return {"note": "observed C-index <= 0.5 on test; no sample size helps unless the model improves"}
    n_ev = res["test_food"]["closures"]
    need = n_ev * (1.96 * ci["se"] / (ev["c_index"] - 0.5)) ** 2
    rate = res["test_food"]["closures"] / max(res["test_food"]["spells"], 1)
    return {"observed_c": ev["c_index"], "observed_se": ci["se"], "closures_in_test": n_ev, "closures_needed_approx": float(need),
            "test_spells_needed_approx": float(need / rate) if rate > 0 else None}


def run(kit_data, out_dir, asof=DEFAULT_ASOF, b=300, seed=20261114, spells=None, cv=True, sens=True, cards=True):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    if spells is None:
        spells = build_spells(kit_data, asof)
    res, pooled, train, test = split_run(spells, CUTOFF, b, seed)
    res["sample_size_needed"] = sample_size_needed(res)
    res["label"] = "exploratory market prior, not a per-site prediction"
    res["spells_all_industries"] = int(len(spells))
    if cv:
        res["grouped_cv_food"] = grouped_cv(spells, b, seed + 5)
    if sens:
        res["sensitivity"] = {}
        for c in ("2022-01-01", "2024-01-01"):
            r, *_ = split_run(spells, c, b, seed + 11, with_food_only=False)
            res["sensitivity"][c] = {k: r[k] for k in ("train_food", "test_food", "pooled", "gate_pass", "gate_reasons")}
    tab = D.table(spells, n_boot=min(b, 200), seed=seed)
    tab.to_csv(out / "descriptive_tenure.csv", index=False)
    fp = out / "cards.json"
    if fp.exists():
        fp.unlink()
    res["cards_emitted"] = 0
    if res["gate_pass"] and cards:
        from .cards import make_cards
        cs = make_cards(spells, res, asof, b=100, seed=seed)
        fp.write_text(json.dumps(cs, indent=2))
        res["cards_emitted"] = len(cs)
    (out / "metrics.json").write_text(json.dumps(res, indent=2, default=str))
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kit-data", default="/home/vorte/code/hackprinceton/data/raw/costar/full-kit/data")
    ap.add_argument("--out", default="forecasting/artifacts/hazard")
    ap.add_argument("--n-boot", type=int, default=300)
    a = ap.parse_args()
    r = run(a.kit_data, a.out, b=a.n_boot)
    print(json.dumps({k: r[k] for k in r if k != "industry_hazard_ratios_closure"}, indent=1, default=str))


if __name__ == "__main__":
    main()
