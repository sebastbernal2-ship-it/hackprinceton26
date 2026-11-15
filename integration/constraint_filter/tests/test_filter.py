import pytest
from integration.constraint_filter import *
from integration.constraint_filter.filter import NOT_APPLIED


def site(sid, **kw):
    return SiteFacts(sid, {k: Fact(v, "observed", "synthetic", sid) for k, v in kw.items()})


BASE = Profile(cities=("Houston",), min_area_sqft=1000, max_area_sqft=6000)


def test_pass_fail_unknown_area():
    assert evaluate(BASE, site("a", city="Houston", listed_space_area_sqft=2000)).status == PASS
    assert evaluate(BASE, site("b", city="Houston", listed_space_area_sqft=900)).status == FAIL
    r = evaluate(BASE, site("c", city="Houston"))
    assert r.status == UNKNOWN and r.missing_fields == ("listed_space_area_sqft",)


def test_fail_dominates_unknown_and_unknown_dominates_pass():
    r = evaluate(BASE, site("d", city="Austin"))  # city fail, area unknown
    assert r.status == FAIL and r.by_constraint()["area"].status == UNKNOWN


def test_unknown_status_fact_is_not_known():
    s = SiteFacts("e", {"city": Fact("Houston"), "listed_space_area_sqft": Fact(5000, "unknown")})
    assert evaluate(BASE, s).status == UNKNOWN


def test_budget_interval_semantics():
    p = Profile(budget=100)
    lo = lambda a, b: site("x", build_out_cost_low=a, build_out_cost_high=b)
    assert evaluate(p, lo(50, 90)).status == PASS
    assert evaluate(p, lo(120, 200)).status == FAIL
    assert evaluate(p, lo(50, 200)).status == UNKNOWN  # straddles
    assert evaluate(p, site("y", build_out_cost_low=50)).status == UNKNOWN
    assert evaluate(p, site("z", build_out_cost_low=150)).status == FAIL
    assert evaluate(p, site("w")).missing_fields == ("build_out_cost_high", "build_out_cost_low")


def test_requirements_missing_are_unknown_never_pass():
    p = Profile(require_active_listing=True, require_scan_model=True, require_restaurant_use=True, min_seats=10)
    r = evaluate(p, site("s", accessible_model_count=0))
    assert r.status == UNKNOWN
    assert {c.status for c in r.results} == {UNKNOWN}
    assert evaluate(p, site("s2", listing_status="Sold")).by_constraint()["active_listing"].status == FAIL


def test_evidence_carries_provenance():
    r = evaluate(BASE, site("p", city="Houston", listed_space_area_sqft=2000))
    assert r.by_constraint()["area"].evidence["listed_space_area_sqft"]["source"] == "synthetic"


def test_no_constraints_vacuous_pass_and_not_applied():
    assert evaluate(Profile(), site("n")).results == ()


def test_replan_reports_changes_and_why():
    sites = [site("a", city="Houston", listed_space_area_sqft=2000),
             site("b", city="Houston", listed_space_area_sqft=5000),
             site("c", city="Houston")]
    r = replan(BASE, {"max_area_sqft": 3000}, sites)
    assert [c["site_id"] for c in r["changed"]] == ["b"]
    assert r["changed"][0]["from"] == PASS and r["changed"][0]["to"] == FAIL
    assert r["changed"][0]["because"][0]["constraint"] == "area"
    r2 = replan(BASE, {"min_seats": 20}, sites)  # new constraint, no seat facts: PASS -> UNKNOWN
    assert {c["site_id"]: c["to"] for c in r2["changed"]} == {"a": UNKNOWN, "b": UNKNOWN}
    assert r2["changed"][0]["because"][0]["from"] == NOT_APPLIED
    assert r2["changed"][0]["because"][0]["missing_fields"] == ["seat_capacity_low", "seat_capacity_high"]
    assert replan(BASE, {"cities": None}, sites)["changed"] == []  # c was already UNKNOWN on area


def test_replan_budget_pushes_site_over():
    s = [SiteFacts("a", {"build_out_cost_low": Fact(300), "build_out_cost_high": Fact(450)})]
    assert evaluate(Profile(budget=500), s[0]).status == PASS
    r = replan(Profile(budget=500), {"budget": 250}, s)
    assert r["changed"][0]["to"] == FAIL


def test_replan_rejects_unknown_field():
    with pytest.raises(ValueError):
        replan(BASE, {"nope": 1}, [])


def test_profile_from_requirements(tmp_path):
    import json
    f = tmp_path / "r.json"
    f.write_text(json.dumps({"user_confirmed": {"cities": ["Houston", "Los Angeles"]},
                             "provisional_assumptions_for_iteration_only": {
                                 "target_suite_area_sqft": {"min": 1000, "max": 6000}, "required_seats": None, "budget": None}}))
    p = profile_from_requirements(f)
    assert p.cities == ("Houston", "Los Angeles") and p.min_seats is None and p.budget is None and p.max_area_sqft == 6000
