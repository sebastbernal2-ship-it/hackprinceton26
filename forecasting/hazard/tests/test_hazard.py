import numpy as np
import pandas as pd

from forecasting.hazard import describe as D
from forecasting.hazard.data import FOOD, apply_cutoff
from forecasting.hazard.model import HazardCox
from forecasting.hazard.train import gate


def synth(n=1500, seed=0):
    rng = np.random.default_rng(seed)
    ind = rng.choice([FOOD, "Health care", "Retail & wholesale"], n)
    yr = rng.integers(2012, 2026, n)
    start = pd.to_datetime(yr.astype(str) + "-06-01")
    rate = np.where(ind == FOOD, 0.15, 0.05)
    t = rng.exponential(1 / rate)
    t_o = rng.exponential(1 / 0.2, n)
    obs = (pd.Timestamp("2026-11-09") - start).days / 365.25
    et = np.where(np.minimum(t, t_o) > obs, 0, np.where(t < t_o, 1, 2))
    yrs = np.minimum(np.minimum(t, t_o), obs)
    return pd.DataFrame({"propertyId": rng.integers(0, 300, n), "start_year": yr, "start": start, "years": yrs, "etype": et,
                         "market_id": 14, "market": "Houston", "property_type": 5, "building_class": 2, "sqft": 1000.0,
                         "lease_type": 1, "employees": 10.0, "industry_group": ind})


def test_cutoff_censors_and_drops():
    d = synth()
    c = apply_cutoff(d, pd.Timestamp("2020-01-01"))
    assert (c["start"] < pd.Timestamp("2020-01-01")).all()
    obs = (pd.Timestamp("2020-01-01") - c["start"]).dt.days / 365.25
    assert (c["years"] <= obs + 1e-9).all()
    assert ((c["etype"] == 0) | (c["years"] < obs)).all()


def test_km_known():
    s, med = D.km(np.array([1.0, 2.0, 3.0, 4.0]), np.array([True, True, False, True]), (1, 2, 3))
    assert np.allclose(s, [0.75, 0.5, 0.5]) and med == 2.0
    _, med = D.km(np.array([1.0, 2.0]), np.array([False, False]), (1,))
    assert np.isnan(med)  # unknown, not 0


def test_model_recovers_food_effect_and_cif_ordering():
    d = synth()
    m = HazardCox(0.01).fit(d)
    assert m.m1.params_["ind_Health care"] < 0
    c = m.cif(d.head(20), (1, 2, 3))
    assert np.all(c[1] <= c[2]) and np.all(c[2] <= c[3]) and np.all(c[3] < 1)


def test_gate_fails_without_events():
    ev = {"c_index": 0.9, "horizons": {1: {"valid": False, "reason": "only 1 failures"}, 2: {"valid": True, "brier_skill": 0.1}}}
    ok, why = gate(ev, {"c_index": {"lo": 0.8}})
    assert not ok and any("1y not evaluable" in w for w in why)


def test_descriptive_table_min_n():
    d = synth()
    t = D.table(d, by=("industry_group",), n_boot=20, min_n=30)
    assert len(t) == 3 and (t["surv_1y"].between(0, 1)).all()
