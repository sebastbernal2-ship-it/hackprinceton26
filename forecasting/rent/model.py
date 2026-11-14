"""Hedonic log asking-rent model: ridge with submarket fixed effects (+ optional gradient boosting if it earns its place).

PRE-DECLARED GATE (set before looking at results; per metro segment, evaluated on held-out rows only):
  G1 n_test >= MIN_N in the segment
  G2 spatial block CV (lat/lon 0.05-degree grid cells) MAE(log) <= BEAT * best baseline MAE(log), baselines being
     submarket median (metro median when submarket unseen) and metro median
  G3 temporal holdout (latest 25% by dateOnMarket) MAE(log) <= BEAT * best baseline on the same rows
  G4 80% interval empirical coverage within [COV_LO, COV_HI] on BOTH splits
Failing segments emit nothing (unknown). Intervals: split-conformal from spatial out-of-fold absolute residuals.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import RidgeCV
from sklearn.model_selection import GroupKFold

from .data import CATEGORICAL, NUMERIC

MIN_N, BEAT, COV_LO, COV_HI, LEVEL = 30, 0.95, 0.70, 0.90, 0.80
TEMPORAL_Q = 0.75
GROUPS = {"size": ["log_sqft_avail", "log_gba"], "age": ["year_built"], "height": ["stories"], "parking": ["parking_ratio"],
          "condition": ["rating"], "listing_date_trend": ["dom_year"], "geography": ["lat", "lon"],
          "property_type": ["ptype"], "class": ["bclass"], "lease_type": ["service"], "submarket": ["submarket"]}


class Design:
    """Median-imputed numerics + missing flags (unknown stays distinguishable), standardised; one-hot categoricals."""

    def fit(self, df: pd.DataFrame) -> "Design":
        self.med = {c: float(np.nanmedian(df[c])) if df[c].notna().any() else 0.0 for c in NUMERIC}
        z = {c: (df[c].fillna(self.med[c])) for c in NUMERIC}
        self.mu = {c: float(z[c].mean()) for c in NUMERIC}
        self.sd = {c: float(z[c].std()) or 1.0 for c in NUMERIC}
        self.flag = [c for c in NUMERIC if df[c].isna().any()]
        self.levels = {c: sorted({str(v) for v in df[c].dropna()}) for c in CATEGORICAL}
        self.cols = list(NUMERIC) + [f"{c}_missing" for c in self.flag] + [f"{c}={l}" for c in CATEGORICAL for l in self.levels[c]]
        self.owner = {n: (n.split("=")[0] if "=" in n else n.replace("_missing", "")) for n in self.cols}
        return self

    def transform(self, df: pd.DataFrame) -> np.ndarray:
        cols = [(df[c].fillna(self.med[c]) - self.mu[c]) / self.sd[c] for c in NUMERIC]
        cols += [df[c].isna().astype(float) for c in self.flag]
        for c in CATEGORICAL:
            s = df[c].astype("object").map(lambda v: None if pd.isna(v) else str(v))
            cols += [(s == l).astype(float) for l in self.levels[c]]
        return np.column_stack([np.asarray(x, dtype=float) for x in cols])


def fit_ridge(df: pd.DataFrame):
    d = Design().fit(df)
    m = RidgeCV(alphas=np.logspace(-1, 3, 13)).fit(d.transform(df), df["log_rent"].to_numpy())
    return d, m


def contributions(d: Design, m, X: np.ndarray) -> list[dict[str, float]]:
    """Per-row log-point contribution of each feature group relative to the average listing (sum + intercept = pred)."""
    mean = np.zeros(X.shape[1])
    mean[:] = 0.0  # standardised numerics are centred; one-hot means handled below
    centre = X.mean(axis=0) if len(X) > 1 else mean
    out = []
    for row in X:
        g: dict[str, float] = {}
        for j, n in enumerate(d.cols):
            g[d.owner[n]] = g.get(d.owner[n], 0.0) + m.coef_[j] * (row[j] - d._centre[j])
        out.append(g)
    return out


def _centre(d: Design, df: pd.DataFrame) -> None:
    d._centre = d.transform(df).mean(axis=0)


def group_contrib(d, m, df):
    _centre(d, df)
    return contributions(d, m, d.transform(df))


def baselines(train: pd.DataFrame, test: pd.DataFrame) -> dict[str, np.ndarray]:
    metro = train["log_rent"].median()
    sub = train.groupby("submarket")["log_rent"].median()
    return {"metro_median": np.full(len(test), metro), "submarket_median": test["submarket"].map(sub).fillna(metro).to_numpy()}


def gbm_fit_predict(train: pd.DataFrame, test: pd.DataFrame) -> np.ndarray:
    def mat(df):
        X = df[NUMERIC].copy()
        for c in ("ptype", "bclass", "service"):
            X[c] = pd.to_numeric(df[c], errors="coerce")
        return X.to_numpy(dtype=float)
    m = HistGradientBoostingRegressor(max_depth=3, learning_rate=0.05, max_iter=200, min_samples_leaf=8, random_state=0)
    return m.fit(mat(train), train["log_rent"]).predict(mat(test))


def spatial_oof(df: pd.DataFrame, k: int = 5, method: str = "ridge") -> pd.DataFrame:
    """Out-of-fold predictions where each lat/lon grid cell is held out together. Returns pred, base columns, fold-model contribs."""
    df = df.reset_index(drop=True)
    pred = np.full(len(df), np.nan)
    base = {b: np.full(len(df), np.nan) for b in ("metro_median", "submarket_median")}
    contrib: list = [None] * len(df)
    for tr, te in GroupKFold(n_splits=min(k, df["grid"].nunique())).split(df, groups=df["grid"]):
        a, b = df.iloc[tr], df.iloc[te]
        if method == "ridge":
            d, m = fit_ridge(a)
            pred[te] = m.predict(d.transform(b))
            for i, c in zip(te, group_contrib(d, m, b)):
                contrib[i] = c
        else:
            pred[te] = gbm_fit_predict(a, b)
        for n, v in baselines(a, b).items():
            base[n][te] = v
    out = df.copy()
    out["pred"] = pred
    for n, v in base.items():
        out[n] = v
    out["contrib"] = contrib
    return out


def conformal_q(abs_resid: np.ndarray, level: float = LEVEL) -> float:
    n = len(abs_resid)
    return float(np.quantile(abs_resid, min(1.0, np.ceil((n + 1) * level) / n)))


def metrics(y_log: np.ndarray, pred_log: np.ndarray, q: float | None = None) -> dict:
    y, p = np.exp(y_log), np.exp(pred_log)
    out = {"n": int(len(y)), "mae_log": float(np.mean(np.abs(y_log - pred_log))), "mae_usd_sf_yr": float(np.mean(np.abs(y - p))),
           "mape": float(np.mean(np.abs(y - p) / y)),
           "r2_log": float(1 - np.sum((y_log - pred_log) ** 2) / np.sum((y_log - y_log.mean()) ** 2)) if len(y) > 1 else float("nan")}
    if q is not None:
        out["coverage80"] = float(np.mean(np.abs(y_log - pred_log) <= q))
    return out


def evaluate_segment(df: pd.DataFrame, mask: pd.Series | None = None, method: str = "ridge") -> dict:
    """df: one metro, rated rows. mask selects the segment whose held-out rows are scored (model trains on all of df)."""
    df = df.reset_index(drop=True)
    sel = np.ones(len(df), bool) if mask is None else mask.reset_index(drop=True).to_numpy()
    res: dict = {"n_segment": int(sel.sum())}
    sp = spatial_oof(df, method=method)
    q_sp = conformal_q(np.abs(sp["log_rent"] - sp["pred"]).to_numpy())
    res["spatial"] = {"model": metrics(sp["log_rent"][sel].to_numpy(), sp["pred"][sel].to_numpy(), q_sp),
                      **{b: metrics(sp["log_rent"][sel].to_numpy(), sp[b][sel].to_numpy()) for b in ("metro_median", "submarket_median")}}
    cut = df["date_on_market"].quantile(TEMPORAL_Q)
    tr_m, te_m = (df["date_on_market"] <= cut).to_numpy(), (df["date_on_market"] > cut).to_numpy()
    tr, te = df[tr_m], df[te_m]
    sp_tr = spatial_oof(tr, method=method)  # interval width learned on training rows only
    q_t = conformal_q(np.abs(sp_tr["log_rent"] - sp_tr["pred"]).to_numpy())
    if method == "ridge":
        d, m = fit_ridge(tr)
        pt = m.predict(d.transform(te))
    else:
        pt = gbm_fit_predict(tr, te)
    ts = sel[te_m]
    bt = baselines(tr, te)
    res["temporal"] = {"model": metrics(te["log_rent"].to_numpy()[ts], pt[ts], q_t),
                       **{b: metrics(te["log_rent"].to_numpy()[ts], v[ts]) for b, v in bt.items()},
                       "cutoff": str(cut.date()), "n_train": int(len(tr))}
    res["q80_spatial_log"] = q_sp
    res["gate"] = gate(res)
    return res


def gate(res: dict) -> dict:
    g = {"G1_n": res["n_segment"] >= MIN_N and res["temporal"]["model"]["n"] >= 10}
    for split in ("spatial", "temporal"):
        s = res[split]
        best = min(s["metro_median"]["mae_log"], s["submarket_median"]["mae_log"])
        g[f"G2_{split}_beats_baseline"] = s["model"]["mae_log"] <= BEAT * best
        g[f"G4_{split}_coverage"] = COV_LO <= s["model"]["coverage80"] <= COV_HI
    g["passed"] = all(g.values())
    return g


def fit_final(df: pd.DataFrame):
    d, m = fit_ridge(df)
    sp = spatial_oof(df)
    return d, m, conformal_q(np.abs(sp["log_rent"] - sp["pred"]).to_numpy()), sp


def flag(asking: float | None, lo: float, hi: float) -> str:
    if asking is None or not np.isfinite(asking):
        return "unknown"
    return "above" if np.log(asking) > np.log(hi) else "below" if np.log(asking) < np.log(lo) else "within"
