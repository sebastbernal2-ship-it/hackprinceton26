"""Simple univariate forecasters, a rolling-origin backtest and the card gate.

Models (all numpy only): seasonal-naive (the baseline), seasonal mean, log-linear/linear trend with
seasonal dummies, and additive Holt-Winters ETS. Prediction intervals are empirical: the 80% interval is the
point forecast plus/minus the 80% quantile of absolute h-step errors made by the same model on earlier data
(rolling origin inside the training window), so it never uses the held-out test point.

A fitted card is emitted only when the best non-baseline model beats the baseline on out-of-sample MAE and the
80% interval coverage is within COVERAGE_TOL of 0.80 over enough origins. Otherwise the card is `unknown`.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

LEVEL = 0.80
COVERAGE_TOL = 0.15
MIN_ORIGINS = 8
MIN_INNER_ERRORS = 5


@dataclass
class Spec:
    name: str
    season: int  # 12 for monthly seasonal series, 1 for annual
    transform: str = "log"  # "log" (positive counts/levels) or "none"
    horizon: int = 12  # steps ahead the card forecasts
    min_train: int = 48
    inner_min: int = 24
    step: int = 3
    models: tuple = ("ets", "loglin", "seasonal_mean")
    min_loglin_points: int = 0  # extra data-sufficiency floor for the trend model (AADT: 5 years)


# ---- transforms ----
def fwd(y, t):
    return np.log(y) if t == "log" else np.asarray(y, float)


def inv(z, t):
    return np.exp(z) if t == "log" else z


# ---- models: each returns h forecasts in transformed space, or None if the data are too short ----
def f_baseline(z, h, m):
    if m == 1:
        return np.full(h, z[-1]) if len(z) >= 1 else None
    if len(z) < m:
        return None
    return np.array([z[len(z) - m + (k % m)] for k in range(h)])


def f_seasonal_mean(z, h, m):
    if m == 1 or len(z) < 2 * m:
        return None
    n = len(z)
    return np.array([z[(n + k) % m::m].mean() for k in range(h)])


def f_loglin(z, h, m, min_points=0):
    n = len(z)
    if n < max(2 * m, 5, min_points):
        return None
    def design(t):
        cols = [np.ones(len(t)), t.astype(float)]
        if m > 1:
            for j in range(1, m):
                cols.append((t % m == j).astype(float))
        return np.column_stack(cols)
    t = np.arange(n)
    beta, *_ = np.linalg.lstsq(design(t), z, rcond=None)
    return design(np.arange(n, n + h)) @ beta


_GRID = [(a, b, g) for a in (0.1, 0.3, 0.6) for b in (0.01, 0.1) for g in (0.1, 0.3)]


def _hw(z, m, a, b, g):
    n = len(z)
    if m > 1:
        level = z[:m].mean()
        trend = (z[m:2 * m].mean() - z[:m].mean()) / m
        seas = list(z[:m] - level)
        start = m
    else:
        level, trend, seas, start = z[0], z[1] - z[0], [0.0], 1
    sse = 0.0
    for t in range(start, n):
        s = seas[t % m] if m > 1 else 0.0
        pred = level + trend + s
        e = z[t] - pred
        sse += e * e
        new_level = level + trend + a * e
        trend = trend + a * b * e
        if m > 1:
            seas[t % m] = s + g * (1 - a) * e
        level = new_level
    return sse, level, trend, seas


def f_ets(z, h, m):
    n = len(z)
    if n < (2 * m + 2 if m > 1 else 5):
        return None
    grid = _GRID if m > 1 else [(a, b, 0.0) for a in (0.1, 0.3, 0.6) for b in (0.01, 0.1, 0.3)]
    best = min((_hw(z, m, *p) + (p,) for p in grid), key=lambda r: r[0])
    _, level, trend, seas, _p = best
    return np.array([level + (k + 1) * trend + (seas[(n + k) % m] if m > 1 else 0.0) for k in range(h)])


def forecast(model, z, h, spec):
    m = spec.season
    if model == "seasonal_naive":
        return f_baseline(z, h, m)
    if model == "seasonal_mean":
        return f_seasonal_mean(z, h, m)
    if model == "loglin":
        return f_loglin(z, h, m, spec.min_loglin_points)
    if model == "ets":
        return f_ets(z, h, m)
    raise ValueError(model)


def inner_quantile(model, z, spec):
    """80% quantile of absolute h-step errors of `model` on data before the end of z."""
    h = spec.horizon
    errs = []
    for o in range(spec.inner_min, len(z) - h + 1):
        fc = forecast(model, z[:o], h, spec)
        if fc is not None:
            errs.append(abs(z[o + h - 1] - fc[h - 1]))
    k = len(errs)
    if k < MIN_INNER_ERRORS:
        return None
    rank = min(k, math.ceil((k + 1) * LEVEL))
    return float(np.sort(errs)[rank - 1])


def predict(model, y, spec):
    """(point, lower, upper) in original units for step `horizon`, or None if not estimable."""
    z = fwd(y, spec.transform)
    fc = forecast(model, z, spec.horizon, spec)
    q = inner_quantile(model, z, spec) if fc is not None else None
    if fc is None or q is None:
        return None
    p = fc[spec.horizon - 1]
    return float(inv(p, spec.transform)), float(inv(p - q, spec.transform)), float(inv(p + q, spec.transform))


@dataclass
class Backtest:
    n_origins: int = 0
    mae: dict = field(default_factory=dict)
    coverage: dict = field(default_factory=dict)


def backtest(y, spec, models=None):
    y = np.asarray(y, float)
    models = models or ("seasonal_naive",) + tuple(spec.models)
    h = spec.horizon
    rows = {m: [] for m in models}
    for o in range(spec.min_train, len(y) - h + 1, spec.step):
        preds = {m: predict(m, y[:o], spec) for m in models}
        if any(p is None for p in preds.values()):
            continue  # compare models only on origins where all are estimable
        actual = y[o + h - 1]
        for m, (p, lo, hi) in preds.items():
            rows[m].append((abs(actual - p), lo <= actual <= hi))
    bt = Backtest()
    bt.n_origins = len(rows[models[0]])
    for m, r in rows.items():
        if r:
            bt.mae[m] = float(np.mean([a for a, _ in r]))
            bt.coverage[m] = float(np.mean([c for _, c in r]))
    return bt


def gate(bt, spec):
    """Pick the best non-baseline model; return (model|None, metrics list, reason|None)."""
    base = "seasonal_naive"
    metrics = [{"name": "backtest_origins", "value": float(bt.n_origins), "threshold": float(MIN_ORIGINS),
                "passed": bt.n_origins >= MIN_ORIGINS}]
    cands = [m for m in bt.mae if m != base]
    if bt.n_origins < MIN_ORIGINS or not cands or base not in bt.mae:
        return None, metrics, f"only {bt.n_origins} backtest origins (need {MIN_ORIGINS})"
    best = min(cands, key=lambda m: bt.mae[m])
    ratio = bt.mae[best] / bt.mae[base] if bt.mae[base] > 0 else float("inf")
    cov_err = abs(bt.coverage[best] - LEVEL)
    metrics += [
        {"name": f"mae_ratio_{best}_vs_seasonal_naive", "value": float(ratio), "threshold": 1.0, "passed": ratio < 1.0},
        {"name": "abs_error_of_80pct_interval_coverage", "value": float(cov_err), "threshold": COVERAGE_TOL,
         "passed": cov_err <= COVERAGE_TOL},
    ]
    reasons = []
    if ratio >= 1.0:
        reasons.append(f"best model {best} does not beat seasonal-naive (MAE ratio {ratio:.2f})")
    if cov_err > COVERAGE_TOL:
        reasons.append(f"80% interval coverage {bt.coverage[best]:.2f} outside 0.80 +/- {COVERAGE_TOL}")
    return (best if not reasons else None), metrics, ("; ".join(reasons) or None)


MODEL_TEXT = {
    "ets": "additive Holt-Winters ETS (trend + seasonal) on {t} scale",
    "loglin": "{t}-linear trend with seasonal dummies fitted by OLS",
    "seasonal_mean": "seasonal mean (same calendar month average)",
}


def make_card(y, spec, *, metric, unit, scenario, horizon_text, window, geography, citation, extra_limits=""):
    """Run backtest + gate and return a ProjectionCard-compatible dict (plus nothing else)."""
    y = np.asarray(y, float)
    bt = backtest(y, spec)
    best, metrics, reason = gate(bt, spec)
    tw = {"start": window[0], "end": window[1], "geography": geography}
    tscale = "log" if spec.transform == "log" else "level"
    bt_text = (f"Rolling-origin backtest at horizon {spec.horizon}, {bt.n_origins} origins: "
               + ", ".join(f"{m} MAE {v:.4g}/cov {bt.coverage[m]:.2f}" for m, v in bt.mae.items()) + ".")
    card = {"kind": "fitted", "metric": metric, "horizon": horizon_text, "scenario": scenario, "unit": unit,
            "trainingWindow": tw, "validation": metrics, "citation": citation}
    if best is not None:
        p, lo, hi = predict(best, y, spec)
        card.update(status="estimated", point=p, lower=lo, upper=hi, method=(
            f"{MODEL_TEXT[best].format(t=tscale)}; 80% interval = point +/- empirical 80% quantile of "
            f"{spec.horizon}-step errors on earlier data. {bt_text} Statistical extrapolation of the historical "
            f"pattern; assumes no structural break. {extra_limits}").strip())
    else:
        card.update(status="unknown", method=(
            f"No fitted projection emitted: {reason}. {bt_text} Unknown is not zero. {extra_limits}").strip())
    return card, reason
