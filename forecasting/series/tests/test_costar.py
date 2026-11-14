import numpy as np
from forecasting.series import core, costar

CIT = {"source": "synthetic", "recordId": "t", "asOf": "2026-01-01", "geography": "none", "limitations": "test"}


def rows(vals, n=10, start=2000 * 4, series="sale_price_median"):
    return [{"metro": "m", "quarter": costar.qstr(start + i), "series": series, "n": str(n if v else 1),
             "value": str(v or 5), "unit": "usd"} for i, v in enumerate(vals)]


def test_thin_quarter_breaks_run_not_zero():
    vals = [100.0] * 20 + [0] + [100.0] * 10  # 0 -> placeholder with n=1 (thin)
    first, v, info = costar.trailing_run(rows(vals), "sale_price_median")
    assert len(v) == 10 and info["thin"] == 1 and min(v) > 0
    assert first == costar.qstr(2000 * 4 + 21)


def test_gap_quarter_is_missing():
    r = rows([100.0] * 12)
    del r[5]
    _, v, info = costar.trailing_run(r, "sale_price_median")
    assert len(v) == 6 and info["quarters_observed"] == 11


def test_future_quarters_excluded_and_incomplete_tail_dropped():
    r = rows([50.0] * 10 + [5.0], series="sale_comps", n=50)
    r += rows([50.0], start=2030 * 4, series="sale_comps")
    r[10]["n"] = "50"
    _, v, info = costar.trailing_run(r, "sale_comps", last="2029Q4")
    assert len(v) == 10 and info["dropped_tail"]


def test_random_walk_stays_unknown_and_trend_series_passes():
    rng = np.random.default_rng(1)
    spec = costar.spec_for("t", 4, "x")
    est = 0
    for sd in range(6):  # random walks: naive is optimal; the gate is not perfect (known false-positive rate)
        rw = np.exp(5 + np.cumsum(np.random.default_rng(sd).normal(0, 0.15, 120)))
        card, _ = core.make_card(rw, spec, metric="m", unit="u", scenario="s", horizon_text="4q", window=("a", "b"),
                                 geography="g", citation=CIT)
        est += card["status"] == "estimated"
    assert est <= 3
    t = np.arange(120)
    y = 100 * np.exp(0.02 * t + 0.2 * np.sin(2 * np.pi * t / 4) + rng.normal(0, 0.03, 120))
    card, reason = core.make_card(y, spec, metric="m", unit="u", scenario="s", horizon_text="4q", window=("a", "b"),
                                  geography="g", citation=CIT)
    assert card["status"] == "estimated", reason
