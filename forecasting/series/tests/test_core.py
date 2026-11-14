import numpy as np
import pytest

from forecasting.series import core
from forecasting.series.cards import finalize

CIT = {"source": "synthetic", "recordId": "t", "asOf": "2026-01-01", "geography": "none", "limitations": "test"}


def monthly(n, trend=0.004, noise=0.03, seed=0, amp=0.3):
    rng = np.random.default_rng(seed)
    t = np.arange(n)
    return 1000 * np.exp(trend * t + amp * np.sin(2 * np.pi * t / 12) + rng.normal(0, noise, n))


def make(y, spec):
    return core.make_card(y, spec, metric="m", unit="count", scenario="status quo", horizon_text="12 mo",
                          window=("2010-01", "2025-12"), geography="g", citation=CIT)


def test_trending_seasonal_series_emits_fitted_card():
    y = monthly(168)
    card, reason = make(y, core.Spec("s", 12))
    assert reason is None and card["status"] == "estimated"
    out = finalize(card)
    assert not out["hidden"] and out["lower"] <= out["point"] <= out["upper"]
    t = 168 + 11
    truth = 1000 * np.exp(0.004 * t + 0.3 * np.sin(2 * np.pi * t / 12))
    assert out["point"] == pytest.approx(truth, rel=0.15)


def test_seasonal_naive_perfect_series_is_unknown():
    # exactly periodic: seasonal-naive has zero error, nothing can beat it
    t = np.arange(120)
    y = 500 + 100 * np.sin(2 * np.pi * t / 12)
    card, reason = make(y, core.Spec("s", 12, transform="none"))
    assert card["status"] == "unknown" and "does not beat" in reason
    out = finalize(card, reason)
    assert out["hidden"] and out["point"] is None and out["hiddenReason"] == reason


def test_too_short_is_unknown_with_reason():
    card, reason = make(monthly(40), core.Spec("s", 12))
    assert card["status"] == "unknown" and "backtest origins" in reason
    assert finalize(card, reason)["hidden"]


def test_interval_calibration_on_stationary_noise():
    y = monthly(240, trend=0.0, noise=0.05, seed=3)
    bt = core.backtest(y, core.Spec("s", 12, step=2))
    assert abs(bt.coverage["seasonal_mean"] - 0.8) <= 0.15
    assert bt.mae["seasonal_mean"] < bt.mae["seasonal_naive"]


def test_coverage_gate_blocks_structural_break():
    # level shift after the model has learned: coverage collapses or model loses, card must not be emitted
    y = monthly(150, trend=0.0, noise=0.02, seed=4)
    y[110:] *= 2.5
    bt = core.backtest(y, core.Spec("s", 12, step=1))
    best, metrics, reason = core.gate(bt, core.Spec("s", 12))
    assert best is None or abs(bt.coverage[best] - 0.8) <= core.COVERAGE_TOL


def test_annual_loglinear_needs_five_years():
    spec = core.Spec("aadt", 1, horizon=1, min_train=5, inner_min=5, step=1, models=("loglin", "ets"),
                     min_loglin_points=5)
    rng = np.random.default_rng(1)
    y = 10000 * np.exp(0.04 * np.arange(4) + rng.normal(0, 0.01, 4))
    assert core.forecast("loglin", core.fwd(y, "log"), 1, spec) is None
    y = 10000 * np.exp(0.04 * np.arange(20) + rng.normal(0, 0.01, 20))
    card, reason = core.make_card(y, spec, metric="AADT", unit="veh/day", scenario="s", horizon_text="1 yr",
                                  window=("2005", "2024"), geography="g", citation=CIT)
    assert reason is None, reason
    out = finalize(card)
    assert out["point"] == pytest.approx(10000 * np.exp(0.04 * 20), rel=0.08)


def test_card_matches_schema_fields():
    card, reason = make(monthly(168), core.Spec("s", 12))
    out = finalize(card)
    for k in ("kind", "status", "metric", "horizon", "scenario", "method"):
        assert out[k]
    assert out["kind"] == "fitted" and out["trainingWindow"] and out["validation"]
