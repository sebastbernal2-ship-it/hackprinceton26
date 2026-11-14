"""Reproducible training/validation script.

uv run --no-project --with numpy --with pandas --with lifelines python -m forecasting.survival.train \
    --kit-data data/raw/costar/full-kit/data --out forecasting/artifacts/survival

Prints and writes aggregate numbers only. Emits cards.json only if the pre-declared gate passes.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from . import cards as C
from . import metrics as M
from .data import DEFAULT_ASOF, MARKETS, build_spells, split_by_start_year
from .model import CompetingCox, grouped_folds

HORIZONS = (1, 2, 3)
PENALIZERS = (0.01, 0.1, 0.5, 1.0)
GATE_HORIZONS = (1, 2)
GATE_C_LOWER = 0.5
LIMITS = ("CoStar kit is office/multifamily dominated (few true restaurant/retail buildings); spells are tenancy records, not stores; "
          "failure = CoStar research label ClosedLocationOrBankrupt; small samples; market context only")
INPUTS = ("location-occupancy.jsonl", "company-detail.jsonl", "commercial-property.jsonl")


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def code_hash() -> str:
    h = hashlib.sha256()
    for p in sorted(Path(__file__).parent.glob("*.py")):
        h.update(p.name.encode() + p.read_bytes())
    return h.hexdigest()


def predict(model, df, horizons=HORIZONS):
    return model.cif(df, horizons), model.risk(df)


def marginal_baseline(df, horizons=HORIZONS):
    return {t: M.aj_cif(df["years"], df["etype"], t) for t in horizons}


def _eval(df, cif, risk, base):
    return M.evaluate(df["years"].values, df["etype"].values, cif, risk, HORIZONS, base)


def cluster_bootstrap(df, cif, risk, base, b, seed):
    """Resample properties with replacement; return percentile CIs of c-index, AUC, Brier skill."""
    rng = np.random.default_rng(seed)
    groups = {g: np.flatnonzero(df["propertyId"].values == g) for g in df["propertyId"].unique()}
    keys = list(groups)
    acc = {"c_index": []}
    for t in HORIZONS:
        acc[f"auc_{t}"], acc[f"brier_skill_{t}"] = [], []
    for _ in range(b):
        idx = np.concatenate([groups[keys[i]] for i in rng.integers(0, len(keys), len(keys))])
        sub = df.iloc[idx]
        r = M.evaluate(sub["years"].values, sub["etype"].values, {t: cif[t][idx] for t in HORIZONS}, risk[idx], HORIZONS, base)
        acc["c_index"].append(r["c_index"])
        for t in HORIZONS:
            h = r["horizons"][t]
            acc[f"auc_{t}"].append(h.get("auc", np.nan))
            acc[f"brier_skill_{t}"].append(h.get("brier_skill", np.nan))
    out = {}
    for k, v in acc.items():
        v = np.array(v, float)
        v = v[~np.isnan(v)]
        out[k] = {"lo": float(np.percentile(v, 2.5)), "hi": float(np.percentile(v, 97.5)), "n_valid_reps": int(len(v))} if len(v) >= 20 else None
    return out


def select_penalizer(train, val):
    rows = []
    for p in PENALIZERS:
        m = CompetingCox(p).fit(train)
        cif, risk = predict(m, val)
        b2 = M.brier(val["years"].values, val["etype"].values, cif[2], 2) if M.horizon_support(val["years"], val["etype"], 2)[0] else np.nan
        # grouped CV on train (stability report only)
        oof = []
        for tr, te in grouped_folds(train["propertyId"].values):
            mm = CompetingCox(p).fit(train.iloc[tr])
            oof.append(M.c_index(train["years"].values[te], train["etype"].values[te], mm.risk(train.iloc[te])))
        rows.append({"penalizer": p, "val_brier_2y": float(b2), "val_c_index": M.c_index(val["years"].values, val["etype"].values, risk), "train_grouped_cv_c_index_mean": float(np.nanmean(oof)), "train_grouped_cv_c_index_sd": float(np.nanstd(oof))})
    ok = [r for r in rows if not np.isnan(r["val_brier_2y"])]
    best = min(ok, key=lambda r: r["val_brier_2y"]) if ok else max(rows, key=lambda r: (r["val_c_index"] if not np.isnan(r["val_c_index"]) else -1))
    return best["penalizer"], rows


def gate(test_eval, ci):
    reasons = []
    c = test_eval["c_index"]
    lo = (ci["c_index"] or {}).get("lo")
    if lo is None or not lo > GATE_C_LOWER:
        reasons.append(f"test C-index {c:.3f}, bootstrap lower bound {lo} not > {GATE_C_LOWER}")
    for t in GATE_HORIZONS:
        h = test_eval["horizons"][t]
        if not h["valid"]:
            reasons.append(f"{t}y horizon not evaluable on test: {h['reason']}")
        elif not h["brier_skill"] > 0:
            reasons.append(f"{t}y Brier skill vs naive baseline {h['brier_skill']:.3f} not > 0")
    return not reasons, reasons


def card_segments(full, model, b, seed, asof):
    """Standardized CIF per market x property-type segment with bootstrap-by-property intervals."""
    segs = []
    for mk_id, mk in MARKETS.items():
        for name, pt in C.PTYPE.items():
            m = (full["market_id"] == mk_id) & (full["property_type"] == pt)
            if m.sum() >= C.MIN_SEGMENT:
                segs.append((mk_id, mk, name, pt, m.values))
    if not segs:
        return [], {}, {}
    point = {s[1:3]: model.cif(full[s[4]], HORIZONS) for s in segs}
    rng = np.random.default_rng(seed)
    props = full["propertyId"].values
    groups = {g: np.flatnonzero(props == g) for g in np.unique(props)}
    keys = list(groups)
    boots = {(s[1], s[2]): {t: [] for t in HORIZONS} for s in segs}
    for _ in range(b):
        idx = np.concatenate([groups[keys[i]] for i in rng.integers(0, len(keys), len(keys))])
        try:
            bm = CompetingCox(model.penalizer).fit(full.iloc[idx])
        except Exception:
            continue
        for s in segs:
            c = bm.cif(full[s[4]], HORIZONS)
            for t in HORIZONS:
                boots[(s[1], s[2])][t].append(float(np.mean(c[t])))
    return segs, point, boots


def run(kit_data, out_dir, asof=DEFAULT_ASOF, n_boot=500, n_boot_cards=200, seed=20260101, spells=None):
    """`spells` (synthetic tests only) bypasses the kit; input hashes are then omitted."""
    kit_data, out = Path(kit_data), Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    if spells is None:
        spells = build_spells(kit_data, asof)
    sp = split_by_start_year(spells)
    train, val, test = sp["train"], sp["val"], sp["test"]
    trval = pd.concat([train, val], ignore_index=True)

    pen, tuning = select_penalizer(train, val)
    # validation-set report: model fit on train only, tuned penalizer
    mv = CompetingCox(pen).fit(train)
    cv, rv = predict(mv, val)
    val_eval = _eval(val, cv, rv, marginal_baseline(train))
    val_ci = cluster_bootstrap(val, cv, rv, marginal_baseline(train), n_boot, seed + 7)
    # test: refit on train+val
    final = CompetingCox(pen).fit(trval)
    base = marginal_baseline(trval)
    ct, rt = predict(final, test)
    test_eval = _eval(test, ct, rt, base)
    ci = cluster_bootstrap(test, ct, rt, base, n_boot, seed)
    mkt_base = {mk: marginal_baseline(trval[trval["market_id"] == i]) for i, mk in MARKETS.items()}
    # market-only baseline Brier on pooled test (stronger naive baseline)
    mb = {}
    for t in HORIZONS:
        if test_eval["horizons"][t]["valid"]:
            pred = np.array([mkt_base[m][t] for m in test["market"]])
            bb = M.brier(test["years"].values, test["etype"].values, pred, t)
            mb[t] = {"brier": bb, "model_skill_vs_market_baseline": 1 - test_eval["horizons"][t]["brier"] / bb}
    per_market = {}
    for i, mk in MARKETS.items():
        m = (test["market_id"] == i).values
        sub = test[m].reset_index(drop=True)
        if len(sub) < 10:
            per_market[mk] = {"n": int(len(sub)), "note": "too few test spells"}
            continue
        e = _eval(sub, {t: ct[t][m] for t in HORIZONS}, rt[m], base)
        e["bootstrap_95ci"] = cluster_bootstrap(sub, {t: ct[t][m] for t in HORIZONS}, rt[m], base, n_boot, seed + i)
        e["insufficient_events"] = e["n_failures"] < 10
        per_market[mk] = e
    passed, reasons = gate(test_eval, ci)

    manifest = {
        "inputs_sha256": {n: sha256_file(kit_data / n) for n in INPUTS} if (kit_data / INPUTS[0]).exists() else {},
        "code_sha256": code_hash(),
        "config": {"asof": asof.isoformat(), "horizons_years": HORIZONS, "penalizer_grid": PENALIZERS, "selected_penalizer": pen,
                   "splits_by_start_year": {"train": "2012-2020", "val": "2021-2023", "test": "2024-2026"},
                   "n_boot": n_boot, "n_boot_cards": n_boot_cards, "seed": seed, "gate_horizons": GATE_HORIZONS, "gate_c_lower": GATE_C_LOWER},
        "counts": {k: {"spells": int(len(v)), "properties": int(v["propertyId"].nunique()), "failures": int((v["etype"] == 1).sum()), "other_exits": int((v["etype"] == 2).sum()), "censored": int((v["etype"] == 0).sum())} for k, v in sp.items()},
        "covariates": final.pre.columns,
    }
    manifest["manifest_hash"] = hashlib.sha256(json.dumps(manifest, sort_keys=True, default=str).encode()).hexdigest()
    result = {"manifest_hash": manifest["manifest_hash"], "tuning": tuning, "validation": val_eval, "validation_bootstrap_95ci": val_ci, "test": test_eval, "test_bootstrap_95ci": ci,
              "test_market_baseline": mb, "test_per_market": per_market, "naive_baseline_marginal_cif": base,
              "gate": {"passed": passed, "reasons": reasons}, "labels": C.LABEL}
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2, default=str))
    (out / "metrics.json").write_text(json.dumps(result, indent=2, default=str))
    cards_path = out / "cards.json"
    if cards_path.exists():
        cards_path.unlink()
    n_cards = 0
    if passed:
        segs, point, boots = card_segments(trval, final, n_boot_cards, seed, asof)
        window = {"start": "2012-01-01", "end": "2023-12-31", "geography": "Houston and Los Angeles CoStar research markets"}
        cards = []
        for mk_id, mk, name, pt, m in segs:
            n, nf = int(m.sum()), int((trval["etype"][m] == 1).sum())
            for t in HORIZONS:
                bs = boots[(mk, name)][t]
                if len(bs) < 20 or not test_eval["horizons"][t]["valid"]:
                    continue  # unvalidated horizon: no card (unknown, not zero)
                h = test_eval["horizons"][t]
                val = [{"name": "test_c_index", "value": test_eval["c_index"], "threshold": GATE_C_LOWER, "passed": bool(ci["c_index"]["lo"] > GATE_C_LOWER)},
                       {"name": f"test_brier_skill_{t}y_vs_marginal_baseline", "value": h["brier_skill"], "threshold": 0.0, "passed": bool(h["brier_skill"] > 0)}]
                cards.append(C.card(name, mk, t, float(np.mean(point[(mk, name)][t])), np.percentile(bs, 2.5), np.percentile(bs, 97.5), n, nf, val, window, asof.isoformat(), LIMITS))
        cards_path.write_text(json.dumps(cards, indent=2))
        n_cards = len(cards)
    result["cards_emitted"] = n_cards
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kit-data", default="data/raw/costar/full-kit/data")
    ap.add_argument("--out", default="forecasting/artifacts/survival")
    ap.add_argument("--asof", default=DEFAULT_ASOF.isoformat())
    ap.add_argument("--n-boot", type=int, default=500)
    a = ap.parse_args()
    r = run(a.kit_data, a.out, date.fromisoformat(a.asof), a.n_boot)
    print(json.dumps({k: r[k] for k in ("manifest_hash", "gate", "cards_emitted", "tuning", "validation", "validation_bootstrap_95ci", "test", "test_bootstrap_95ci", "test_market_baseline", "test_per_market", "naive_baseline_marginal_cif")}, indent=1, default=str))


if __name__ == "__main__":
    main()
