import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from triage.reconcile.engine import triage_property  # noqa: E402
from triage.reconcile.run import build_queue, summarize  # noqa: E402
from app.main import app  # noqa: E402

client = TestClient(app)


def room(label, area, h=None):
    d = {"areaFloor": area}
    if h:
        d["height"] = h
    return {"id": label, "classifications": [{"label": label, "confidence": 1.0}], "dimensions": d}


def scan(rooms, floors=1, area=None):
    return {"modelId": "m", "model": {"dimensions": {"areaFloor": area or 1000}, "floors": [{"id": i} for i in range(floors)], "rooms": rooms}}


def prop(**kw):
    p = {"propertyType": 6, "numStoriesAboveGrade": 1, "grossBuildingAreaSquareFeet": 10000.0, "floors": [], "parking": []}
    p.update(kw)
    return p


def F(res, name):
    return next(f for f in res["fields"] if f["field"] == name)


def test_height_max_vs_room_confirmed_conflict_filled_blank():
    ret = lambda ft: {"structural": {"ceilingHeightFeet": ft}}
    r = triage_property("1", prop(propertyRetail=ret(20.0)), None, scan([room("Office", 500, 19.0)]), None)
    assert F(r, "clear_height_ft")["status"] == "confirmed"
    r = triage_property("1", prop(propertyRetail=ret(12.0)), None, scan([room("Office", 500, 18.0)]), None)
    assert F(r, "clear_height_ft")["status"] == "conflicting"
    # scan lower than a stored max is consistent, only weakly confirmed
    r = triage_property("1", prop(propertyRetail=ret(24.0)), None, scan([room("Office", 500, 10.0)]), None)
    assert (F(r, "clear_height_ft")["status"], F(r, "clear_height_ft")["confidence"]) == ("confirmed", "low")
    r = triage_property("1", prop(), None, scan([room("Office", 500, 9.5)]), None)
    f = F(r, "clear_height_ft")
    assert f["status"] == "filled" and f["value"] == 9.5 and f["valueStatus"] == "derived"
    assert F(triage_property("1", prop(), None, None, None), "clear_height_ft")["status"] == "blank-unfillable"


def test_area_scope_never_calls_costar_wrong():
    # scan 3000 vs building 10000, no suite figure: scope mismatch -> unverified, not conflicting
    r = triage_property("1", prop(), None, scan([room("Other", 3000)]), None)
    assert F(r, "area_sqft")["status"] == "unverified"
    # matches a listed suite within 20%
    lst = [{"forLeaseSummary": {"minDivisibleSquareFeet": 3100.0}}]
    r = triage_property("1", prop(), lst, scan([room("Other", 3000)]), None)
    f = F(r, "area_sqft")
    assert f["status"] == "confirmed" and f["scope"] == "suite"
    # impossible at any scope
    r = triage_property("1", prop(), None, scan([room("Other", 20000)]), None)
    assert F(r, "area_sqft")["status"] == "conflicting"


def test_void_rooms_excluded_and_unknown_not_zero():
    r = triage_property("1", prop(), None, scan([room("Void", 5000), room("Other", 900)]), None)
    assert F(r, "area_sqft")["scanValue"] == 900
    rr = F(r, "restroom_count")
    assert rr["status"] == "blank-unfillable" and rr["value"] is None  # no label is unknown, not 0
    r = triage_property("1", prop(), None, scan([room("Bathroom", 50), room("Bathroom", 40), room("Kitchen", 80)]), None)
    assert F(r, "restroom_count")["value"] == 2 and F(r, "kitchen_present")["value"] is True


def test_floors_rules():
    assert F(triage_property("1", prop(), None, scan([room("Other", 9)], floors=1), None), "floors")["status"] == "confirmed"
    assert F(triage_property("1", prop(), None, scan([room("Other", 9)], floors=3), None), "floors")["status"] == "conflicting"
    assert F(triage_property("1", prop(numStoriesAboveGrade=5), None, scan([room("Other", 9)], floors=1), None), "floors")["status"] == "unverified"


def test_aerial_fields_pending_then_filled():
    p = prop(parking=[{"totalSpaces": 100}])
    assert F(triage_property("1", p, None, None, None), "parking_spaces")["status"] == "unverified"
    aer = {"parkingSpaces": {"value": 104, "confidence": "medium"}, "rooftopUnits": {"value": 6}, "loadingDocks": {"value": 2}}
    r = triage_property("1", p, None, None, aer)
    assert F(r, "parking_spaces")["status"] == "confirmed"
    assert F(r, "rooftop_units")["status"] == "filled" and F(r, "rooftop_units")["valueStatus"] == "estimated"
    aer["parkingSpaces"]["value"] = 40
    assert F(triage_property("1", p, None, None, aer), "parking_spaces")["status"] == "conflicting"


def test_summary_and_queue_ranking():
    a = triage_property("1", prop(), None, scan([room("Other", 20000)]), None)  # area conflict
    b = triage_property("2", prop(), None, None, None)
    s = summarize([a, b], {"all": {"1", "2"}})
    h = s["cohorts"]["all"]["fields"]["area_sqft"]
    assert h["statuses"]["conflicting"] == 1 and h["fillRateBefore"] == 1.0
    q = build_queue([a, b])
    assert q[0]["status"] == "conflicting" and q == sorted(q, key=lambda x: (-x["score"], x["listingId"], x["field"]))


@pytest.fixture
def derived(tmp_path, monkeypatch):
    a = triage_property("7", prop(), None, scan([room("Other", 20000)]), None)
    (tmp_path / "results.json").write_text(json.dumps([a]))
    (tmp_path / "summary.json").write_text(json.dumps(summarize([a], {"all": {"7"}})))
    (tmp_path / "queue.json").write_text(json.dumps(build_queue([a])))
    monkeypatch.setenv("TRIAGE_DERIVED_DIR", str(tmp_path))


def test_routes(derived):
    assert client.get("/api/triage/summary").json()["cohorts"]["all"]["properties"] == 1
    assert client.get("/api/triage/property/7").json()["fields"][0]["field"] == "clear_height_ft"
    assert client.get("/api/triage/property/8").status_code == 404
    q = client.get("/api/triage/queue?limit=1").json()
    assert len(q["items"]) == 1 and q["total"] >= 1
    assert "not a statement that CoStar is wrong" in q["notice"]


def test_routes_503_when_unbuilt(tmp_path, monkeypatch):
    monkeypatch.setenv("TRIAGE_DERIVED_DIR", str(tmp_path / "none"))
    assert client.get("/api/triage/summary").status_code == 503


def _res(lid, statuses, scan=True, aerial=False):
    return {"listingId": lid, "hasScan": scan, "hasAerial": aerial,
            "fields": [{"field": f"f{i}", "status": s} for i, s in enumerate(statuses)]}


def test_demo_sites_sorted_by_evidence_completeness_not_fit(tmp_path, monkeypatch):
    FIX = Path(__file__).parent / "fixtures"
    monkeypatch.setenv("COSTAR_NORMALIZED_DIR", str(FIX))
    monkeypatch.setenv("TRIAGE_DERIVED_DIR", str(tmp_path))
    (tmp_path / "results.json").write_text(json.dumps([
        _res("900001", ["unverified", "unverified", "blank-unfillable", "unverified"]),
        _res("900002", ["confirmed", "filled", "conflicting", "unverified"]),
        _res("555555", ["confirmed", "confirmed", "confirmed", "confirmed"]),  # not in the candidate registry: cannot open, so not offered
    ]))
    r = client.get("/api/triage/demo-sites?limit=5")
    assert r.status_code == 200
    body = r.json()
    assert [s["listingId"] for s in body["sites"]] == [900002, 900001]
    top = body["sites"][0]
    assert top["fieldsWithEvidence"] == 3 and top["fieldsTotal"] == 4 and top["completeness"] == 0.75
    assert "not a fit ranking" in body["notice"].lower()
    assert "address" in top and "tourId" in top


def test_demo_sites_503_when_triage_not_built(tmp_path, monkeypatch):
    monkeypatch.setenv("TRIAGE_DERIVED_DIR", str(tmp_path))
    assert client.get("/api/triage/demo-sites").status_code == 503


def test_reconcile_finds_aerial_where_the_aerial_builder_writes_it(tmp_path):
    from triage.reconcile.run import load_aerial
    (tmp_path / "aerial" / "properties").mkdir(parents=True)
    (tmp_path / "aerial" / "properties" / "42.json").write_text('{"vehicles": {}}')
    assert load_aerial(tmp_path, "42") == {"vehicles": {}}
    assert load_aerial(tmp_path, "43") is None
