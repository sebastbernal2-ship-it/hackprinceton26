import pytest
from fastapi.testclient import TestClient

from app import pipeline
from app.main import app
from app.models import Match, SpaceFacts
from integration.constraint_filter import filter as cf
from tests.test_api import FIX

client = TestClient(app)


def match(listing, building=None, space=None, source=None, tour="T"):
    return Match(listingId=listing, address="a", detail="", city="Houston, TX", blurb="", photo="", squareFeet=building,
                 spaceSquareFeet=space, spaceSource=source, tourId=tour, evidenceReadiness=10,
                 facts=SpaceFacts(photos=[], property=[], location=[]), factors=[])


PROFILE = cf.Profile(min_area_sqft=800, max_area_sqft=1500)


def area(m):
    res = cf.evaluate(PROFILE, pipeline.site_facts(m, None))
    return next(r for r in res.results if r.constraint == "area")


def test_building_area_is_not_the_suite_area():
    # a 23,789 sq ft building says nothing about the 800-1,500 sq ft suite the operator wants: unknown, not FAIL
    r = area(match(1, building=23789))
    assert r.status == "UNKNOWN", r


def test_listed_or_scanned_space_is_what_the_area_constraint_tests():
    assert area(match(2, building=23789, space=1000, source="scan")).status == "PASS"
    assert area(match(3, building=23789, space=3000, source="listing")).status == "FAIL"


def test_scan_sourced_area_is_labelled_as_scan_not_as_listed():
    m = match(4, space=1000, source="scan")
    fact = pipeline.site_facts(m, None).facts["listed_space_area_sqft"]
    assert "scan" in (fact.limitations or "").lower()


def brief(*a):
    return {"brief": [{"question": "q", "answer": x} for x in a]}


@pytest.fixture
def data(monkeypatch):
    monkeypatch.setenv("COSTAR_NORMALIZED_DIR", str(FIX))


def test_limit_controls_how_many_matches_are_shown(data):
    r3 = client.post("/api/matches", json=brief("")).json()
    r1 = client.post("/api/matches", json={**brief(""), "limit": 1}).json()
    assert len(r1["matches"]) == 1 and r1["notShownCount"] == len(r3["matches"]) + r3["notShownCount"] - 1
    assert client.post("/api/matches", json={**brief(""), "limit": 99}).status_code == 422


def test_each_match_carries_an_alignment_summary_from_its_constraints(data):
    r = client.post("/api/matches", json=brief("Springfield, 2,000 sq ft, 50 seats")).json()
    m = r["matches"][0]
    a = m["alignment"]
    verdicts = [c["status"] for c in m["constraints"]]
    assert a["total"] == len(verdicts) and a["pass"] == verdicts.count("PASS") and a["unknown"] == verdicts.count("UNKNOWN")
    assert a["fail"] == 0 and len(a["confirmed"]) == a["pass"] and len(a["unknownItems"]) == a["unknown"]
    assert all(isinstance(x, str) and x for x in a["confirmed"] + a["unknownItems"])
