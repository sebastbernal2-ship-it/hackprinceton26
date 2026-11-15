import pytest
from fastapi.testclient import TestClient

from app.main import app
from planning import assessment
from tests.test_api import FIX

client = TestClient(app)


@pytest.fixture(autouse=True)
def data(monkeypatch, tmp_path):
    # The area constraint tests the SUITE space (listed available space or scanned area), never the building. This copy of the
    # fixture states the areas these tests assume as listed available space.
    import csv
    import shutil
    d = tmp_path / "costar"
    shutil.copytree(FIX, d)
    p = d / "restaurant-site-candidates.csv"
    rows = list(csv.DictReader(p.open(newline="", encoding="utf-8")))
    names = list(rows[0]) + ["active_listed_min_available_sqft"]
    for r in rows:
        r["active_listed_min_available_sqft"] = r.get("rentable_area_sqft") or r.get("retail_gla_sqft") or ""
    with p.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=names)
        w.writeheader()
        w.writerows(rows)
    monkeypatch.setenv("COSTAR_NORMALIZED_DIR", str(d))


def brief(*a):
    return {"brief": [{"question": "q", "answer": x} for x in a]}


def test_matches_uses_profile_and_excludes_fail():
    r = client.post("/api/matches", json=brief("Shelbyville, 1,500-2,000 sq ft")).json()
    assert [m["listingId"] for m in r["matches"]] == [900002] and r["excludedCount"] == 1
    assert r["counts"] == {"PASS": 1, "FAIL": 1, "UNKNOWN": 0}
    assert r["profile"]["cities"] == ["Shelbyville"] and r["profile"]["minAreaSqft"] == 1500
    assert all(c["status"] == "PASS" for c in r["matches"][0]["constraints"])


def test_matches_pass_before_unknown_and_missing_fields():
    r = client.post("/api/matches", json=brief("at least 2,000 sq ft with 100 seats")).json()
    # 900001 area 2500 PASS but estimated capacity (83-116 seats) straddles 100 -> UNKNOWN; 900002 area 1800 FAIL
    assert [m["listingId"] for m in r["matches"]] == [900001] and r["excludedCount"] == 1
    m = r["matches"][0]
    assert m["constraintStatus"] == "UNKNOWN" and m["alignment"]["unknownItems"] == ["Seat capacity"]
    assert "fit" not in " ".join(k for k in m if "score" in k)


def test_matches_order_pass_first_then_readiness():
    r = client.post("/api/matches", json=brief("need a 3D scan")).json()
    # 900001 has a model (PASS); 900002 has none (UNKNOWN: absence is not a negative)
    assert [(m["listingId"], m["constraintStatus"]) for m in r["matches"]] == [(900001, "PASS"), (900002, "UNKNOWN")]


def test_matches_no_constraints_is_vacuous_pass():
    r = client.post("/api/matches", json={"brief": []}).json()
    assert {m["constraintStatus"] for m in r["matches"]} == {"PASS"} and r["excludedCount"] == 0


def test_budget_constraint_is_interval_based():
    lo, hi = assessment.buildout_bounds()
    assert 0 < lo < hi
    r = client.post("/api/matches", json=brief(f"budget ${int(lo) - 100}")).json()
    assert r["matches"] == [] and r["excludedCount"] == 2
    r = client.post("/api/matches", json=brief(f"budget ${int(hi) + 1000}")).json()
    assert {m["constraintStatus"] for m in r["matches"]} == {"PASS"}
    r = client.post("/api/matches", json=brief(f"budget ${int((lo + hi) / 2)}")).json()
    assert {m["constraintStatus"] for m in r["matches"]} == {"UNKNOWN"}
    assert r["matches"][0]["missingFields"] == []  # inside the interval, nothing missing: estimate straddles budget


def test_assess_buildout_only_and_deterministic():
    body = {"listingId": 900001, "budget": 20000, "draws": 1000}
    a = client.post("/api/assess", json=body).json()
    assert a["label"] == "scenario analysis, not a forecast" and a["analysisBasis"] == "buildout_only"
    assert a["pOverBudgetBuildout"] == 1.0 and a["pOverBudget"] is None  # budget below any plausible buildout
    assert a["unknownInputs"]["full_basis"] == ["monthly_rent", "delay_cost_per_month", "planned_open_months"]
    assert a["sensitivity"]["status"] in ("estimated", "unknown")
    assert a == client.post("/api/assess", json=body).json()
    big = client.post("/api/assess", json={**body, "budget": 10_000_000}).json()
    assert big["pOverBudgetBuildout"] == 0.0 and big["buildout"]["p5"] <= big["buildout"]["p50"] <= big["buildout"]["p95"]


def test_assess_overrides_equipment_and_assumption_keys():
    base = {"budget": 10_000_000, "draws": 500}
    full = client.post("/api/assess", json=base).json()
    fewer = client.post("/api/assess", json={**base, "equipment": [{"id": "range_6_burner"}]}).json()
    assert fewer["buildout"]["p50"] < full["buildout"]["p50"]
    ids = {l["itemId"] for l in fewer["costLines"]}
    assert "equip:range_6_burner" in ids and "equip:pizza_deck_oven" not in ids
    pricey = client.post("/api/assess", json={**base, "equipment": ["range_6_burner"],
                                              "unitPriceOverrides": {"range_6_burner": 50000}}).json()
    line = next(l for l in pricey["costLines"] if l["itemId"] == "equip:range_6_burner")
    assert line["expected"] == 50000 and line["source"] == "user://override" and line["status"] == "estimated"
    legacy = client.post("/api/assess", json={"assumptions": [{"key": "budget", "value": 1.0}, {"key": "zzz", "value": 1}],
                                              "draws": 500}).json()
    assert legacy["budget"] == 1.0 and legacy["pOverBudgetBuildout"] == 1.0 and any("zzz" in n for n in legacy["notes"])
    assert client.post("/api/assess", json={"equipment": ["nope"]}).status_code == 422
    assert client.post("/api/assess", json={"listingId": 1}).status_code == 404


def test_assess_full_basis_and_lease_delay_raises_cost():
    body = {"budget": 100_000, "monthlyRent": 5000, "delayCostPerMonth": 1000, "plannedOpenMonths": 3, "draws": 1000}
    a = client.post("/api/assess", json=body).json()
    assert a["analysisBasis"] == "buildout_plus_rent_and_delay" and a["pOverBudget"] is not None
    assert any(x["key"] == "tasks" and "assumption" in x["basis"] for x in a["assumptionsUsed"])
    d = client.post("/api/assess", json={**body, "leaseStartDelayMonths": 6}).json()
    assert d["total"]["p50"] < a["total"]["p50"]  # later lease start -> less dead rent


def test_replan_changes_status_and_p_over():
    r = client.post("/api/replan", json={**brief("Springfield"), "assess": {"budget": 20000, "draws": 500},
                                         "profileChange": {"cities": ["Shelbyville"], "budget": 10_000_000}}).json()
    assert r["label"] == "scenario analysis, not a forecast"
    assert {(c["site_id"], c["from"], c["to"]) for c in r["changed"]} == {("900001", "PASS", "FAIL"), ("900002", "FAIL", "PASS")}
    assert r["countsBefore"]["PASS"] == 1 and r["countsAfter"]["PASS"] == 1
    p = r["pOverBudget"]["buildoutOnly"]
    assert (p["before"], p["after"], p["delta"]) == (1.0, 0.0, -1.0)


def test_replan_unknown_p_and_bad_keys():
    r = client.post("/api/replan", json={**brief("Springfield"), "profileChange": {"minSeats": 100}}).json()
    assert r["pOverBudget"]["buildoutOnly"] == {"before": None, "after": None, "delta": None}
    assert [c["to"] for c in r["changed"]] == ["UNKNOWN"]
    assert client.post("/api/replan", json={"profileChange": {"bogus": 1}}).status_code == 422
