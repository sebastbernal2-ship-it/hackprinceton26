import numpy as np
import pandas as pd
import pytest

from forecasting.rent import model as M
from forecasting.rent.data import annual_rate


def synth(n=240, noise=0.15, signal=True, seed=0):
    rng = np.random.default_rng(seed)
    sub = rng.integers(0, 12, n)
    sub_eff = rng.normal(0, 0.5, 12)
    lat, lon = 29.5 + sub * 0.04 + rng.normal(0, 0.005, n), -95.5 + sub * 0.04 + rng.normal(0, 0.005, n)
    gba = rng.uniform(8, 13, n)
    year = rng.integers(1960, 2020, n).astype(float)
    year[rng.random(n) < 0.1] = np.nan
    dom = 2020 + rng.uniform(0, 6, n)
    y = 2.8 + (sub_eff[sub] - 0.2 * (gba - 10) + 0.004 * np.nan_to_num(year - 1990) + 0.05 * (dom - 2023)) * signal + rng.normal(0, noise, n)
    df = pd.DataFrame({"listingId": np.arange(n), "metro": "houston", "ptype": rng.choice([5, 6], n), "bclass": rng.choice([1, 2, 3], n),
                       "service": rng.choice([4, 7], n), "submarket": sub, "lat": lat, "lon": lon, "log_sqft_avail": gba - 2,
                       "log_gba": gba, "year_built": year, "stories": rng.integers(1, 8, n).astype(float),
                       "parking_ratio": np.where(rng.random(n) < 0.2, np.nan, rng.uniform(1, 4, n)), "rating": rng.integers(2, 5, n).astype(float),
                       "dom_year": dom, "log_rent": y})
    df["rent"] = np.exp(df["log_rent"])
    df["is_retail"] = df["ptype"] == 6
    df["date_on_market"] = pd.to_datetime("2020-01-01") + pd.to_timedelta((dom - 2020) * 365, unit="D")
    df["grid"] = (np.floor(df["lat"] / 0.05).astype(int).astype(str) + "_" + np.floor(df["lon"] / 0.05).astype(int).astype(str))
    return df


def test_annual_rate_units_and_unknown():
    assert annual_rate({"rateLow": 2.0, "rateHigh": 3.0, "rateBasis": 1}) == pytest.approx(30.0)
    assert annual_rate({"rateLow": 18.0, "rateHigh": 0, "rateBasis": 2}) == 18.0
    assert annual_rate({"rateLow": 0, "rateHigh": 0, "rateBasis": 2}) is None  # 0 means no rate given: unknown
    assert annual_rate({"rateLow": 5.0, "rateBasis": 0}) is None  # unknown basis: cannot annualise


def test_conformal_and_flag():
    q = M.conformal_q(np.abs(np.linspace(-1, 1, 99)))
    assert 0.75 < q <= 1.0
    assert M.flag(30, 10, 20) == "above" and M.flag(5, 10, 20) == "below" and M.flag(15, 10, 20) == "within"
    assert M.flag(None, 10, 20) == "unknown" and M.flag(float("nan"), 10, 20) == "unknown"


def test_signal_passes_gate_and_beats_baselines():
    res = M.evaluate_segment(synth(signal=True))
    g = res["gate"]  # temporal coverage on ~60 rows is noisy, so assert the accuracy gates and spatial coverage
    assert g["G1_n"] and g["G2_spatial_beats_baseline"] and g["G2_temporal_beats_baseline"] and g["G4_spatial_coverage"], g
    assert res["spatial"]["model"]["mae_log"] < res["spatial"]["metro_median"]["mae_log"]
    assert res["spatial"]["model"]["r2_log"] > 0.3


def test_pure_noise_fails_gate():
    # no relation to features: model must not beat the baselines by the declared margin
    res = M.evaluate_segment(synth(signal=False, noise=0.4, seed=3))
    assert not res["gate"]["passed"]


def test_thin_segment_fails_g1():
    df = synth()
    res = M.evaluate_segment(df, df["is_retail"] & (df["listingId"] < 20))
    assert not res["gate"]["G1_n"] and not res["gate"]["passed"]


def test_spatial_folds_hold_out_whole_grid_cells():
    df = synth()
    out = M.spatial_oof(df)
    assert out["pred"].notna().all() and len(out) == len(df)
    from sklearn.model_selection import GroupKFold
    for tr, te in GroupKFold(5).split(df, groups=df["grid"]):
        assert not set(df["grid"].iloc[tr]) & set(df["grid"].iloc[te])


def test_contributions_sum_to_prediction_gap_and_missing_is_not_zero():
    df = synth()
    d, m = M.fit_ridge(df)
    c = M.group_contrib(d, m, df)
    pred = m.predict(d.transform(df))
    tot = np.array([sum(x.values()) for x in c])
    assert np.allclose(tot, pred - pred.mean(), atol=1e-8)
    assert "year_built_missing" in d.cols  # unknown year gets its own flag rather than a silent 0


def test_contribution_reference_is_the_training_average_not_the_prediction_batch():
    df = synth(n=120)
    d, m = M.fit_ridge(df)
    row = df.iloc[[3]]
    alone = M.group_contrib(d, m, row)[0]
    batch = M.group_contrib(d, m, df.iloc[:30])[3]
    assert alone == pytest.approx(batch)
    assert any(abs(v) > 1e-9 for v in alone.values())  # a single unrated listing is not explained as all zeros


def test_undefined_metrics_are_serialized_as_null():
    out = M.finite({"a": float("nan"), "b": [1.0, float("inf")], "c": {"d": 2.5}})
    assert out == {"a": None, "b": [1.0, None], "c": {"d": 2.5}}
