import pytest

from planning import financials as f, monte_carlo, price_catalog as pc, sensitivity
from planning.timeline_model import Task

D = pc.load_financial_json()


def by_id(lines):
    return {l["itemId"]: l for l in lines}


def test_observed_equipment_is_list_price_and_quantity_multiplies():
    L = by_id(f.equipment_lines(D))
    r = L["equip:range_6_burner"]
    assert (r["low"], r["expected"], r["high"], r["status"]) == (1299.0, 1299.0, 1299.0, "observed")
    h = L["equip:hand_sink"]  # 2 x 89.99
    assert h["expected"] == 179.98 and h["quantity"] == 2


def test_estimated_equipment_band_hand_computed():
    r = by_id(f.equipment_lines(D))["equip:reach_in_refrigerator"]  # 5717.21 x 0.4 / 1 / 2.5
    assert r["status"] == "estimated"
    assert (r["low"], r["expected"]) == (2286.88, 5717.21) and r["high"] == pytest.approx(14293.03, abs=0.011)


def test_install_allowance_is_20pct_of_list_subtotal_banded():
    sub = 5717.21 + 1299 + 949.99 + 13932.35 + 1639 + 8509 + 482.99 + 394.99 + 2539 + 8871 + 2 * 89.99
    assert pc.equipment_subtotal(D) == pytest.approx(sub)
    a = by_id(f.equipment_lines(D))["equipment_install_allowance"]
    assert a["expected"] == pytest.approx(round(0.2 * sub, 2), abs=0.01)
    assert a["low"] == pytest.approx(0.4 * 0.2 * sub, abs=0.01)
    assert a["high"] == pytest.approx(2.5 * 0.2 * sub, abs=0.01)


def test_repair_estimated_and_observed_hand_computed():
    L = by_id(f.repair_lines(D, {"plumbing": 2, "ceiling_water_damage": 3}))
    p = L["repair:plumbing"]  # ref 900
    assert (p["low"], p["expected"], p["high"], p["status"]) == (720.0, 1800.0, 4500.0, "estimated")
    c = L["repair:ceiling_water_damage"]  # 325..1100, mid 712.5
    assert (c["low"], c["expected"], c["high"], c["status"]) == (975.0, 2137.5, 3300.0, "observed")


def test_repair_without_quantity_or_unit_cost_is_unknown_not_zero():
    L = by_id(f.repair_lines(D, {}))
    assert L["repair:plumbing"]["expected"] is None and L["repair:plumbing"]["status"] == "unknown"
    assert L["repair:plumbing"]["unitExpected"] == 900.0
    L2 = by_id(f.repair_lines(D, {"layout_inefficiency": 1}))
    assert L2["repair:layout_inefficiency"]["expected"] is None


def test_pizza_oven_electricity_texas_hand_computed():
    L = by_id(f.utility_lines(D, {"state": "TX", "city": "Houston"}))
    o = L["util_elec:pizza_deck_oven"]  # 3.2 kW x 360 h x duty .15/.3/.5 x 0.0896
    assert o["low"] == pytest.approx(3.2 * 360 * 0.15 * 0.0896, abs=0.01)
    assert o["expected"] == pytest.approx(30.96, abs=0.01)
    assert o["high"] == pytest.approx(51.61, abs=0.01)


def test_range_gas_by_state_hand_computed():
    mcf = 210000 * 360 * 0.3 / 1_037_000
    tx = by_id(f.utility_lines(D, {"state": "TX", "city": "Houston"}))["util_gas:range_6_burner"]
    ca = by_id(f.utility_lines(D, {"state": "CA", "city": "Los Angeles"}))["util_gas:range_6_burner"]
    assert tx["expected"] == pytest.approx(mcf * 11.85, abs=0.01)
    assert ca["expected"] == pytest.approx(mcf * 15.26, abs=0.01)


def test_la_water_tiers_and_sewer_unknown():
    L = by_id(f.utility_lines(D, {"state": "CA", "city": "Los Angeles"}))
    w = L["util_water:hand_sink"]  # 24 gal/day x 30 = 720 gal -> rating band .6/1/1.6
    assert w["expected"] == pytest.approx(720 / 748 * (10.529 + 14.513) / 2, abs=0.01)
    assert w["low"] == pytest.approx(0.6 * 720 / 748 * 10.529, abs=0.01)
    assert w["high"] == pytest.approx(1.6 * 720 / 748 * 14.513, abs=0.01)
    s = L["util_sewer:los_angeles"]
    assert s["expected"] is None and s["status"] == "unknown"


def test_houston_water_uses_houston_rate():
    w = by_id(f.utility_lines(D, {"state": "TX", "city": "Houston"}))["util_water:hand_sink"]
    assert w["expected"] == pytest.approx(720 / 1000 * 21.14, abs=0.01)


def test_unknown_area_gives_unknown_line_not_zero():
    L = f.utility_lines(D, f.area_for("Springfield", "ZZ"))
    assert len(L) == 1 and L[0]["status"] == "unknown" and L[0]["expected"] is None


def test_totals_hand_computed_keep_basis_separate_and_exclude_unknown():
    mk = lambda i, b, lo, ex, hi, st="estimated": {"itemId": i, "basis": b, "low": lo, "expected": ex, "high": hi, "status": st}
    lines = [mk("a", "one_time", 1, 2, 3), mk("b", "one_time", 10, 20, 30), mk("c", "monthly", 5, 6, 7),
             mk("d", "annual", 12, 24, 36), mk("u", "monthly", None, None, None, "unknown")]
    t = f.totals(lines)
    assert t["totals"]["oneTime"] == {"low": 11, "expected": 22, "high": 33}
    assert t["totals"]["monthly"] == {"low": 6, "expected": 8, "high": 10}
    assert t["excludedLineIds"] == ["u"] and t["totalsStatus"].startswith("partial")


def test_totals_none_when_nothing_computable_and_complete_flag():
    u = {"itemId": "u", "basis": "monthly", "low": None, "expected": None, "high": None, "status": "unknown"}
    assert f.totals([u])["totals"] is None
    ok = {"itemId": "o", "basis": "one_time", "low": 1, "expected": 1, "high": 1, "status": "observed"}
    assert f.totals([ok])["totalsStatus"] == "complete"


def test_counts_sum_to_line_count():
    L = f.all_lines("Houston", "TX", {"plumbing": 1})
    assert sum(f.counts(L).values()) == len(L) and f.counts(L)["observed"] > 0


def test_same_method_every_site_identical_equipment_lines():
    a = [l for l in f.all_lines("Houston", "TX") if l["category"] == "equipment"]
    b = [l for l in f.all_lines("Los Angeles", "CA") if l["category"] == "equipment"]
    assert a == b


def test_core_catalog_invariant_unchanged_and_financial_catalog_loads():
    assert sum(i.known for i in pc.ITEMS.values()) == 1
    cat = pc.load_financial_catalog()
    assert cat["repair:plumbing"].status == "estimated" and cat["repair:plumbing"].price_low == pytest.approx(360)
    assert not cat["repair:layout_inefficiency"].known


def test_estimated_inputs_appear_in_flip_analysis():
    tasks = (Task("design", 1, 2, 3), Task("build", 2, 3, 5))
    base = dict(tasks=tasks, monthly_rent=2000, rent_free_months=1, delay_cost_per_month=500, planned_open_months=4)
    s0 = f.build_scenario({"plumbing": 2}, budget=1e9, **base)
    p50 = monte_carlo.run(s0, 2000).total.p50
    s = f.build_scenario({"plumbing": 2}, budget=p50, **base)
    res = sensitivity.analyse(s, n=500)
    assert res.status == "estimated"
    knobs = {fl.knob: fl for fl in res.flips}
    assert "quantity:equipment_install_allowance" in knobs and "quantity:repair:plumbing" in knobs
    assert knobs["budget"].flips


def test_assessment_buildout_bounds_and_override():
    from planning import assessment as a
    lo, hi = a.buildout_bounds()
    assert 0 < lo < hi
    r = a.assess(budget=1.0, equipment=["hand_sink"], price_overrides={"hand_sink": 1000.0}, n=300, seed=1)
    assert r["pOverBudgetBuildout"] == 1.0 and r["analysisBasis"] == "buildout_only"
    assert a.assess(budget=None, n=300)["pOverBudgetBuildout"] is None
    assert a.assess(budget=5.0, equipment=[], n=300)["buildout"] is None  # nothing selected: unknown, not zero
