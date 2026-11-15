from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app

FIX = Path(__file__).parent / "fixtures"
client = TestClient(app)


@pytest.fixture(autouse=True)
def data(monkeypatch):
    monkeypatch.setenv("COSTAR_NORMALIZED_DIR", str(FIX))


def test_rent_is_excluded_not_zero_without_a_rate_or_area():
    d = client.get("/api/property/900001/total-cost").json()
    ids = {p["id"] for p in d["parts"]}
    # No listed space and no owner area: build-out is unknown too (sized by space, never by building area).
    assert "buildout" not in ids and "rent" not in ids
    assert {e["id"] for e in d["excluded"]} >= {"rent", "buildout"}
    assert d["totalStatus"].startswith("partial")


def test_buildout_scales_with_space_area():
    small = next(p for p in client.get("/api/property/900001/total-cost?sqft=1000").json()["parts"] if p["id"] == "buildout")
    large = next(p for p in client.get("/api/property/900001/total-cost?sqft=2000").json()["parts"] if p["id"] == "buildout")
    assert large["low"] > small["low"] and large["high"] > small["high"]


def test_owner_rate_and_area_complete_the_total_deterministically():
    d = client.get("/api/property/900001/total-cost?sqft=1200&rent=30&months=12").json()
    rent = next(p for p in d["parts"] if p["id"] == "rent")
    assert rent["low"] == rent["high"] == 3000.0  # 30 $/sf/yr x 1,200 sf / 12
    assert rent["status"] == "assumption"
    one, mon = d["oneTime"], d["monthly"]
    assert d["total"]["low"] == round(one["low"] + 12 * mon["low"], 2)
    assert d["total"]["high"] == round(one["high"] + 12 * mon["high"], 2)


def test_unknown_listing_is_404(monkeypatch):
    from app import total_cost_routes as tc
    monkeypatch.setattr(tc, "kit_property", lambda pid: None)
    assert client.get("/api/property/123/total-cost").status_code == 404


def test_kit_property_outside_the_candidates_gets_a_total(monkeypatch):
    from types import SimpleNamespace
    from app import total_cost_routes as tc
    monkeypatch.setattr(tc, "kit_property", lambda pid: SimpleNamespace(listingId=pid, city="Houston, TX",
                                                                         rentPerSquareFootYear=None, squareFeet=50_000))
    d = client.get("/api/property/777/total-cost?sqft=1000&rent=20").json()
    assert d["listingId"] == 777 and d["buildingSquareFeet"] == 50_000
    assert next(p for p in d["parts"] if p["id"] == "rent")["low"] == round(20 * 1000 / 12, 2)
