import dataclasses
import math

import pytest

from planning import cost_model, monte_carlo, price_catalog, sensitivity, timeline_model
from planning.price_catalog import CatalogItem, WEBSTER_TX_COMMERCIAL as W
from planning.scenario import Line, Scenario, unknown_inputs
from planning.timeline_model import Task

CAT = (
    CatalogItem("A", "thing a", "each", 100, 200, "https://example.test/a", "2026-01-01"),
    CatalogItem("B", "thing b", "sqft", 10, 20, "https://example.test/b", "2026-01-01"),
    CatalogItem("U", "unpriced", "each"),
)


def scen(**kw):
    base = dict(
        lines=(Line("A", 2), Line("B", 50)), contingency_low=0.1, contingency_high=0.2,
        tasks=(Task("t1", 1, 2, 3), Task("t2", 2, 3, 4)), monthly_rent=1000, rent_free_months=1,
        delay_cost_per_month=500, planned_open_months=4, budget=6000, catalog=CAT)
    base.update(kw)
    return Scenario(**base)


# ---- catalog
def test_catalog_unknown_items_have_null_prices_and_priced_have_source():
    for it in price_catalog.ITEMS.values():
        if it.known:
            assert it.source_url.startswith("https://") and it.as_of
        else:
            assert it.price_low is None and it.price_high is None
    assert sum(i.known for i in price_catalog.ITEMS.values()) == 1


def test_priced_item_requires_source():
    with pytest.raises(ValueError):
        CatalogItem("x", "x", "each", 1, 2)
    with pytest.raises(ValueError):
        CatalogItem("x", "x", "each", 3, 2, "u", "d")


@pytest.mark.parametrize("val,fee", [(1000, 15), (20000, 110), (50000, 260), (75000, 360), (100000, 460),
                                     (100001, 463), (500000, 1660), (600000, 1860), (500, 15)])
def test_webster_permit_fee_hand_computed(val, fee):
    assert W.permit_fee(val) == fee


def test_webster_total_includes_half_plan_review():
    assert W.total_fee(75000) == 540  # 360 + 180


def test_permit_fee_monotone():
    vals = [0, 500, 1000, 1001, 5000, 49999, 50000, 50001, 99999, 100000, 250000, 500000, 750000]
    fees = [W.permit_fee(v) for v in vals]
    assert fees == sorted(fees)


# ---- timeline
def test_pert_hand_computed():
    est = timeline_model.estimate(scen().tasks)
    assert (est.low, est.high) == (3, 7)
    assert est.pert_mean == pytest.approx(2 + 3)


def test_cited_task_needs_source_and_unknown_task_propagates():
    with pytest.raises(ValueError):
        Task("x", 1, 2, 3, basis="cited")
    est = timeline_model.estimate((Task("a", 1, 2, 3), Task("b", None, None, None)))
    assert est.status == "unknown" and est.low is None and est.unknown_tasks == ("b",)


# ---- cost model
def test_cost_hand_computed_components_separate():
    c = cost_model.estimate(scen())
    assert c.equipment_subtotal == (700, 1400)
    assert c.buildout == pytest.approx((770, 1680))
    assert c.occupancy_dead_rent == (2000, 6000)
    assert c.delay == (0, 1500)
    assert c.total == pytest.approx((2770, 9180))
    assert c.label == "scenario analysis, not a forecast"


def test_cost_with_permit_hand_computed():
    c = cost_model.estimate(scen(permit_schedule=W))
    assert c.permit_fees == (22.5, 30.0)
    assert c.buildout == pytest.approx(((700 + 22.5) * 1.1, (1400 + 30) * 1.2))


def test_unknown_price_propagates_not_zero():
    c = cost_model.estimate(scen(lines=(Line("A", 2), Line("U", 3))))
    assert c.status == "unknown" and c.buildout is None and c.total is None and c.equipment_subtotal is None
    assert "price:U" in c.unknown_inputs["buildout"]
    assert c.known_lines_subtotal_partial == (200, 400)  # explicitly partial
    assert c.occupancy_dead_rent is not None  # independent component still reported


def test_unknown_quantity_and_rent_propagate():
    c = cost_model.estimate(scen(lines=(Line("A", None),), monthly_rent=None))
    assert c.buildout is None and c.occupancy_dead_rent is None and c.total is None
    assert c.delay == (0, 1500)


def test_cost_monotone_in_price_and_quantity():
    lo = cost_model.estimate(scen()).total
    hi = cost_model.estimate(scen(lines=(Line("A", 3), Line("B", 50)))).total
    assert hi[0] > lo[0] and hi[1] > lo[1]
    r = cost_model.estimate(scen(monthly_rent=2000)).total
    assert r[0] > lo[0]


# ---- monte carlo
def test_seed_stability():
    a, b = monte_carlo.run(scen(), 2000, 7), monte_carlo.run(scen(), 2000, 7)
    assert a == b
    assert monte_carlo.run(scen(), 2000, 8) != a


def test_default_is_10k_draws_and_label():
    r = monte_carlo.run(scen(), seed=1)
    assert r.n_draws == 10_000 and r.label == "scenario analysis, not a forecast" and "not a forecast" in r.method


def test_mc_within_deterministic_bounds():
    r, c = monte_carlo.run(scen(), 5000, 3), cost_model.estimate(scen())
    assert c.total[0] <= r.total.p5 <= r.total.p50 <= r.total.p95 <= c.total[1]
    assert 3 <= r.time_to_open_months.p5 and r.time_to_open_months.p95 <= 7
    assert r.time_to_open_months.p50 == pytest.approx(5, abs=0.15)
    assert r.buildout.p50 == pytest.approx(1225, rel=0.05)  # mean-ish: 1050 * 1.15 * (mid prices) = 1207.5 +- noise


def test_degenerate_scenario_is_exact():
    cat = (CatalogItem("A", "a", "each", 100, 100, "u", "d"),)
    s = scen(lines=(Line("A", 3),), catalog=cat, contingency_low=0.1, contingency_high=0.1,
             tasks=(Task("t", 2, 2, 2),), monthly_rent=100, rent_free_months=0, delay_cost_per_month=10,
             planned_open_months=1)
    total = 330 + 200 + 10
    r = monte_carlo.run(replace_budget(s, total - 1), 500, 0)
    assert r.total.p5 == pytest.approx(total) and r.total.p95 == pytest.approx(total)
    assert r.p_over_budget == 1.0
    assert monte_carlo.run(replace_budget(s, total + 1), 500, 0).p_over_budget == 0.0


def replace_budget(s, b):
    return dataclasses.replace(s, budget=b)


def test_p_over_budget_monotone_in_budget_rent_and_extremes():
    ps = [monte_carlo.run(scen(budget=b), 3000, 5).p_over_budget for b in (0, 2000, 4000, 6000, 8000, 20000)]
    assert ps == sorted(ps, reverse=True) and ps[0] == 1.0 and ps[-1] == 0.0
    rents = [monte_carlo.run(scen(monthly_rent=r), 3000, 5).p_over_budget for r in (500, 1000, 2000, 4000)]
    assert rents == sorted(rents)


def test_mc_unknown_propagates():
    r = monte_carlo.run(scen(lines=(Line("U", 1),)), 500, 0)
    assert r.buildout is None and r.total is None and r.p_over_budget is None and r.status == "partial"
    r = monte_carlo.run(scen(budget=None), 500, 0)
    assert r.total is not None and r.p_over_budget is None
    r = monte_carlo.run(scen(tasks=(Task("t", None, None, None),)), 500, 0)
    assert r.time_to_open_months is None and r.dead_rent is None and r.total is None
    r = monte_carlo.run(scen(lines=(Line("U", 1),), tasks=(Task("t", None, None, None),)), 100, 0)
    assert r.status == "unknown"


def test_mc_permit_adds_cost():
    a, b = monte_carlo.run(scen(), 2000, 2), monte_carlo.run(scen(permit_schedule=W), 2000, 2)
    assert b.buildout.p50 > a.buildout.p50


# ---- sensitivity
def test_sensitivity_unknown_when_inputs_unknown():
    r = sensitivity.analyse(scen(lines=(Line("U", 1),)), n=200)
    assert r.status == "unknown" and r.oat == () and r.flips == ()
    assert sensitivity.analyse(scen(budget=None), n=200).status == "unknown"


def test_oat_direction():
    r = sensitivity.analyse(scen(budget=6000), n=1500, seed=4)
    row = {x.knob: x for x in r.oat}
    assert row["monthly_rent"].p_over_at_high >= row["monthly_rent"].p_over_at_low
    assert row["budget"].p_over_at_high <= row["budget"].p_over_at_low
    assert row["monthly_rent"].median_total_at_high > row["monthly_rent"].median_total_at_low


def test_flip_found_and_actually_flips():
    s = scen(budget=4000)  # median total is about 5.5k, so baseline is over budget
    r = sensitivity.analyse(s, n=1500, seed=4)
    assert r.baseline_p_over > 0.5
    fl = {f.knob: f for f in r.flips}
    assert fl["budget"].flips and fl["budget"].direction == "increase" and fl["budget"].factor > 1
    k = sensitivity.knobs(s)["budget"]
    assert monte_carlo.run(k(s, fl["budget"].factor), 1500, 4).p_over_budget < 0.5
    assert fl["monthly_rent"].flips and fl["monthly_rent"].direction == "decrease"


def test_flip_none_when_no_knob_reaches():
    r = sensitivity.analyse(scen(budget=1e9), n=300, seed=1)
    assert r.baseline_p_over == 0.0
    assert [f.flips for f in r.flips if f.knob == "budget"] == [False]  # 4x smaller budget still 2.5e8
