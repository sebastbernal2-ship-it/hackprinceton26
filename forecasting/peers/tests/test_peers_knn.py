from datetime import date

import numpy as np
import pytest

from forecasting.peers import fit
from forecasting.peers import peers_knn as K

ASOF = date(2026, 11, 9)


def sp(i, lat, lon, kind="cafe_coffee", start=date(2018, 1, 1), end=None, etype=0, prop=None, market="Houston", **kw):
    stop = end or ASOF
    return {"id": f"P-{i}", "propertyId": prop if prop is not None else i, "lat": lat, "lon": lon, "market": market, "kind": kind, "start": start, "end": end,
            "etype": etype, "years": (stop - start).days / 365.25, "sqft": kw.get("sqft"), "ptype": kw.get("ptype"), "bclass": kw.get("bclass"), "yearBuilt": kw.get("yearBuilt")}


def test_weighted_curves_hand_computed():
    d, e = np.array([1.0, 2.0, 3.0]), np.array([1, 0, 2])
    r = K.weighted_curves(d, e, np.ones(3), 2.0)
    assert r["survival"] == pytest.approx(2 / 3) and r["closure"] == pytest.approx(1 / 3)
    r = K.weighted_curves(d, e, np.array([2.0, 1.0, 1.0]), 2.0)  # weights: the closure carries half the mass
    assert r["survival"] == pytest.approx(0.5) and r["closure"] == pytest.approx(0.5)
    r = K.weighted_curves(d, e, np.ones(3), 3.0)  # all ended or censored by 3y: other exit at 3 removes the last at-risk
    assert r["survival"] == pytest.approx(0.0) and r["closure"] == pytest.approx(1 / 3)


def test_km_median_and_weighted_median():
    assert K.km_median(np.array([1.0, 2.0, 3.0, 4.0]), np.array([1, 1, 1, 1]), np.ones(4)) == 2.0
    assert K.km_median(np.array([1.0, 5.0]), np.array([0, 0]), np.ones(2)) is None  # median not reached
    assert K.weighted_median(np.array([1.0, 2.0, 10.0]), np.array([1.0, 1.0, 5.0])) == 10.0


def test_metrics_hand_computed():
    assert K.brier(np.array([0.5, 0.5]), np.array([1.0, 0.0])) == 0.25
    assert K.auc(np.array([0.9, 0.8, 0.2, 0.1]), np.array([1, 1, 0, 0])) == 1.0
    assert K.auc(np.array([0.5, 0.5]), np.array([1, 0])) == 0.5
    assert K.auc(np.array([0.5, 0.6]), np.array([1, 1])) is None


def test_distance_weights_decrease_with_distance_and_normalise():
    spells = [sp(1, 29.7000, -95.5, ), sp(2, 29.7145, -95.5), sp(3, 29.7725, -95.5)]  # ~0, ~1, ~5 miles from the target
    tab = K.SpellTable(spells)
    t = K.Target(lat=29.7, lon=-95.5, market="Houston", concept="cafe")
    idx, w, comps = K.neighbours(t, tab, K.Params(k=3, h_miles=1.0, w_kind=0.0), np.ones(3, dtype=bool))
    assert list(idx) == [0, 1, 2] and w.sum() == pytest.approx(1.0)
    assert w[0] > w[1] > w[2]
    assert comps["geo_mi"][1] == pytest.approx(1.0, abs=0.02)
    # exp(-d2/2) relative to the nearest: (1/1)^2 = 1 -> weight ratio exp(-0.5)
    assert w[1] / w[0] == pytest.approx(np.exp(-0.5), rel=0.03)


def test_k_limits_neighbours_and_other_market_is_excluded():
    spells = [sp(i, 29.7 + 0.001 * i, -95.5) for i in range(1, 8)] + [sp(99, 29.7, -95.5, market="Los Angeles")]
    tab = K.SpellTable(spells)
    t = K.Target(lat=29.7, lon=-95.5, market="Houston", concept="cafe")
    idx, w, _ = K.neighbours(t, tab, K.Params(k=3), np.ones(tab.n, dtype=bool))
    assert len(idx) == 3 and 7 not in idx  # index 7 is the Los Angeles spell, nearest of all but another market


def test_kind_similarity_can_outrank_distance():
    near_bar = sp(1, 29.7010, -95.5, kind="bar")
    far_cafe = sp(2, 29.7145, -95.5, kind="cafe_coffee")  # ~1 mi
    tab = K.SpellTable([near_bar, far_cafe])
    t = K.Target(lat=29.7, lon=-95.5, market="Houston", concept="cafe")
    spatial, _, _ = K.neighbours(t, tab, K.Params(k=1, h_miles=2.0, w_kind=0.0), np.ones(2, dtype=bool))
    kindy, _, _ = K.neighbours(t, tab, K.Params(k=1, h_miles=2.0, w_kind=8.0), np.ones(2, dtype=bool))
    assert spatial[0] == 0 and kindy[0] == 1


def test_missing_features_do_not_create_distance():
    tab = K.SpellTable([sp(1, 29.7, -95.5, sqft=None, bclass=None, yearBuilt=None, ptype=None)])
    t = K.Target(lat=29.7, lon=-95.5, market="Houston", concept="cafe", sqft=1200, bclass="B", year_built=1990, ptype=6)
    c = K.components(t, tab)
    assert c["size"][0] == c["class"][0] == c["age"][0] == c["ptype"][0] == 0.0


def test_no_self_leak_and_no_future_peers():
    spells = [sp(1, 29.7, -95.5, start=date(2016, 1, 1), end=date(2017, 6, 1), etype=1),
              sp(2, 29.7, -95.5, start=date(2018, 1, 1)),                       # the target
              sp(3, 29.7, -95.5, start=date(2020, 1, 1), end=date(2021, 1, 1), etype=1)]  # starts after the target: its future
    tab = K.SpellTable(spells)
    t = K.target_for_spell(tab, 1)
    ex = np.zeros(3, dtype=bool)
    ex[1] = True
    r = K.predict(t, tab, K.Params(k=5), as_of_day=tab.start[1], exclude=ex)
    assert list(r["idx"]) == [0]  # not itself, not the spell that starts later


def test_as_of_censors_outcomes_after_the_target_start():
    spells = [sp(1, 29.7, -95.5, start=date(2016, 1, 1), end=date(2020, 1, 1), etype=1)]
    tab = K.SpellTable(spells)
    t0 = float(date(2018, 1, 1).toordinal())
    dur, ev = K.observed(tab, t0, 0)
    assert ev[0] == 0 and dur[0] == pytest.approx(2.0, abs=0.01)  # the 2020 closure is unknown on 2018-01-01
    dur, ev = K.observed(tab, float(date(2021, 1, 1).toordinal()), 0)
    assert ev[0] == 1 and dur[0] == pytest.approx(4.0, abs=0.01)


def test_labels_do_not_call_short_followup_a_survivor():
    tab = K.SpellTable([sp(1, 29.7, -95.5, start=date(2026, 1, 1)),                       # open, 0.85 y of follow-up: not evaluable
                        sp(2, 29.7, -95.5, start=date(2020, 1, 1)),                       # open 6.8 y: survived 2 y
                        sp(3, 29.7, -95.5, start=date(2020, 1, 1), end=date(2021, 1, 1), etype=1),   # closed within 2 y
                        sp(4, 29.7, -95.5, start=date(2020, 1, 1), end=date(2021, 1, 1), etype=2)])  # moved within 2 y
    ev, yc, ye = K.labels(tab, 2.0)
    assert list(ev) == [False, True, True, True]
    assert list(yc) == [0, 0, 1, 0] and list(ye) == [0, 0, 1, 1]


def _clusters(n=120, seed=0):
    """Two areas ~10 miles apart: area A closes fast, area B lasts. Location truly carries the signal."""
    rng = np.random.default_rng(seed)
    out = []
    for i in range(n):
        a = i % 2 == 0
        lat = (29.70 if a else 29.85) + rng.normal(0, 0.003)
        start = date(2013 + i % 9, 1 + i % 12, 1)
        if a:
            fail = rng.random() < 0.8
            end, et = (date(start.year + 1, start.month, 1), 1) if fail else (None, 0)
        else:
            fail = rng.random() < 0.05
            end, et = (date(start.year + 1, start.month, 1), 1) if fail else (None, 0)
        out.append(sp(i, lat, -95.5 + rng.normal(0, 0.003), start=start, end=end, etype=et, prop=i))
    return out


def test_knn_beats_prior_when_location_carries_signal_and_not_when_shuffled():
    spells = _clusters()
    tab = K.SpellTable(spells)
    idx = np.array([i for i, s in enumerate(spells) if 2016 <= s["start"].year <= 2020])
    p = K.Params(k=8, h_miles=1.0, w_kind=0.0, shrink_m=0.0)
    r = K.evaluate_split(tab, idx, p)
    assert r["closure2y"]["brier"]["knn"] < 0.7 * r["closure2y"]["brier"]["marketPrior"]
    assert r["closure2y"]["auc"]["knn"] > 0.8
    rng = np.random.default_rng(1)
    perm = rng.permutation(len(spells))
    shuffled = [{**s, **{k: spells[perm[i]][k] for k in ("start", "end", "etype", "years")}} for i, s in enumerate(spells)]
    stab = K.SpellTable(shuffled)
    idx2 = np.array([i for i, s in enumerate(shuffled) if 2016 <= s["start"].year <= 2020])
    r2 = K.evaluate_split(stab, idx2, p)
    assert r2["closure2y"]["brier"]["knn"] > 0.9 * r2["closure2y"]["brier"]["marketPrior"]  # no skill without signal


def test_tune_prefers_signal_configuration_and_select_is_smoothest_within_tolerance():
    spells = _clusters()
    tab = K.SpellTable(spells)
    idx = np.array([i for i, s in enumerate(spells) if 2015 <= s["start"].year <= 2019])
    cfgs = [K.Params(k=k, h_miles=h, w_kind=0.0, shrink_m=0.0) for k in (3, 8) for h in (1.0, 50.0)]
    rows = K.tune(tab, idx, cfgs)
    assert rows[0]["params"].h_miles == 1.0  # with a 50-mile bandwidth the two areas blur together
    assert rows[0]["objective"] <= rows[-1]["objective"]
    fake = [{"params": K.Params(k=5, h_miles=1.0), "objective": 0.100}, {"params": K.Params(k=40, h_miles=4.0), "objective": 0.1015},
            {"params": K.Params(k=80, h_miles=8.0), "objective": 0.15}]
    assert fit.select(fake).k == 40  # within tolerance of the best -> the smoother one; the worse 80 is out


def test_predict_returns_intervals_and_neighbours():
    spells = _clusters()
    tab = K.SpellTable(spells)
    t = K.Target(lat=29.70, lon=-95.5, market="Houston", concept="cafe")
    r = K.predict(t, tab, K.Params(k=10, h_miles=1.0, w_kind=0.0, shrink_m=0.0), reps=60)
    lo, hi = r["ci"][2.0]["closure"]
    assert lo <= r["estimate"][2.0]["closure"] <= hi and r["n"] == 10
    assert r["estimate"][2.0]["closure"] > 0.5  # area A closes fast


def test_cluster_bootstrap_delta_runs():
    spells = _clusters()
    tab = K.SpellTable(spells)
    idx = np.array([i for i, s in enumerate(spells) if 2016 <= s["start"].year <= 2020])
    res = K.evaluate_split(tab, idx, K.Params(k=8, h_miles=1.0, w_kind=0.0, shrink_m=0.0))
    d = K.cluster_bootstrap_delta(tab, res, reps=50)
    assert d["closure2y"]["high"] < 0  # location signal: significantly better than the prior
    assert d["closure2y"]["low"] <= d["closure2y"]["delta"] <= d["closure2y"]["high"]
