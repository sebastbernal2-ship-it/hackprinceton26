"""Fit, validate and write rent artifacts to forecasting/artifacts/rent/ (gitignored).

Usage: PYTHONPATH=. python -m forecasting.rent.run [--kit DIR] [--out DIR]
Writes report.json (aggregate validation per segment) and predictions.json (per listing; only for metros whose
all-type fit passed the gate). Listings with an asking rent get OUT-OF-FOLD (spatially held-out) expectations, so the
'asking vs expected' flag is never in-sample. Listings with no asking rate get an expectation from the final fit.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np

from . import model as M
from .data import build_frame

REPO = Path(__file__).resolve().parents[2]
DEFAULT_OUT = REPO / "forecasting" / "artifacts" / "rent"
LABEL = "scenario/estimate: hedonic regression on CoStar-kit asking rents, not a market appraisal or guarantee"


def kit_dir() -> Path:
    from data.costar.client import kit_dir as k
    return k()


def _round(x):
    return None if x is None or (isinstance(x, float) and not math.isfinite(x)) else round(float(x), 4)


def run(kit: Path, out: Path) -> dict:
    df = build_frame(kit)
    rated = df.dropna(subset=["log_rent"]).reset_index(drop=True)
    report: dict = {"label": LABEL, "gate_definition": M.__doc__.split("PRE-DECLARED GATE")[1].split('"""')[0].strip(),
                    "n_listings_with_lease_spaces": int(len(df)), "n_rated": int(len(rated)), "segments": {}}
    preds: dict = {}
    for metro, g in rated.groupby("metro"):
        g = g.reset_index(drop=True)
        segs = {"all": None, "retail": g["is_retail"]}
        for name, mask in segs.items():
            report["segments"][f"{metro}/{name}"] = M.evaluate_segment(g, mask)
        # Challenger: gradient boosting is adopted only if it beats ridge on spatial MAE by 3% AND passes the gate.
        gb = M.evaluate_segment(g, None, method="gbm")
        ridge_mae = report["segments"][f"{metro}/all"]["spatial"]["model"]["mae_log"]
        report["segments"][f"{metro}/all"]["gbm_challenger"] = {"gate": gb["gate"], "spatial_mae_log": gb["spatial"]["model"]["mae_log"],
                                                                "temporal_mae_log": gb["temporal"]["model"]["mae_log"],
                                                                "adopted": bool(gb["gate"]["passed"] and gb["spatial"]["model"]["mae_log"] < 0.97 * ridge_mae)}
        seg = report["segments"][f"{metro}/all"]
        if not seg["gate"]["passed"]:
            continue
        d, m, q, sp = M.fit_final(g)
        unr = df[(df["metro"] == metro) & df["log_rent"].isna()].reset_index(drop=True)
        ret_ok = report["segments"][f"{metro}/retail"]["gate"]["passed"]
        rows = [(r, r["pred"], r["contrib"], True) for _, r in sp.iterrows()]
        if len(unr):
            X = d.transform(unr)
            pu = m.predict(X)
            cu = M.group_contrib(d, m, unr)
            rows += [(r, pu[i], cu[i], False) for i, (_, r) in enumerate(unr.iterrows())]
        tw = {"start": str(g["date_on_market"].min().date()), "end": str(g["date_on_market"].max().date()), "geography": metro}
        val = [{"name": "spatial_cv_mae_log_vs_best_baseline", "value": seg["spatial"]["model"]["mae_log"],
                "threshold": M.BEAT * min(seg["spatial"]["metro_median"]["mae_log"], seg["spatial"]["submarket_median"]["mae_log"]), "passed": True},
               {"name": "temporal_holdout_mae_log_vs_best_baseline", "value": seg["temporal"]["model"]["mae_log"],
                "threshold": M.BEAT * min(seg["temporal"]["metro_median"]["mae_log"], seg["temporal"]["submarket_median"]["mae_log"]), "passed": True},
               {"name": "temporal_coverage80", "value": seg["temporal"]["model"]["coverage80"], "threshold": M.COV_LO, "passed": True}]
        for r, p, c, oof in rows:
            if r["is_retail"] and not ret_ok:
                preds[str(r["listingId"])] = {"listingId": int(r["listingId"]), "metro": metro, "status": "unknown",
                                              "reason": "retail segment failed or is too thin for the validation gate", "label": LABEL}
                continue
            lo, hi, pt = math.exp(p - q), math.exp(p + q), math.exp(p)
            ask = float(r["rent"]) if r["rent"] == r["rent"] else None
            top = sorted(c.items(), key=lambda kv: -abs(kv[1]))[:5]
            preds[str(r["listingId"])] = {
                "listingId": int(r["listingId"]), "metro": metro, "status": "estimated", "label": LABEL,
                "expectedRentPerSfYear": _round(pt), "lower80": _round(lo), "upper80": _round(hi),
                "askingRentPerSfYear": _round(ask), "flag": M.flag(ask, lo, hi),
                "expectationSource": "spatial out-of-fold" if oof else "final fit (listing has no asking rate)",
                "contributions": [{"feature": k, "effectPct": _round((math.exp(v) - 1) * 100)} for k, v in top],
                "method": "ridge (submarket fixed effects) on log asking rent, split-conformal 80% interval",
                "trainingWindow": tw, "validation": val,
            }
    out.mkdir(parents=True, exist_ok=True)
    (out / "report.json").write_text(json.dumps(report, indent=1, default=str))
    (out / "predictions.json").write_text(json.dumps(preds))
    return report


def summarize(rep: dict) -> None:
    for k, s in rep["segments"].items():
        sp, tp = s["spatial"], s["temporal"]
        f = lambda x: {a: _round(b) for a, b in x.items() if a in ("n", "mae_usd_sf_yr", "mape", "r2_log", "coverage80", "mae_log")}
        print(k, "n=", s["n_segment"], "passed=", s["gate"]["passed"], s["gate"])
        for nm, v in (("spatial", sp), ("temporal", tp)):
            print("  ", nm, "model", f(v["model"]), "| submkt", f(v["submarket_median"]), "| metro", f(v["metro_median"]))
        if "gbm_challenger" in s:
            print("   gbm", s["gbm_challenger"])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--kit", type=Path, default=None)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    a = ap.parse_args()
    summarize(run(a.kit or kit_dir(), a.out))
