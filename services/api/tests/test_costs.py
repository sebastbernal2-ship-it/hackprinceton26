from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app import costs_routes
from app.main import app

client = TestClient(app)


def fake(monkeypatch, city):
    monkeypatch.setattr(costs_routes, "load_matches", lambda: [SimpleNamespace(listingId=7, city=city)])


def test_costs_houston_hand_computed_and_unknown_excluded(monkeypatch):
    fake(monkeypatch, "Houston, TX")
    r = client.get("/api/property/7/costs?repairs=plumbing:2").json()
    L = {l["itemId"]: l for l in r["lines"]}
    assert L["repair:plumbing"]["expected"] == 1800.0
    assert L["equip:range_6_burner"]["status"] == "observed" and L["equip:range_6_burner"]["expected"] == 1299.0
    assert L["util_gas:range_6_burner"]["expected"] == pytest.approx(210000 * 360 * 0.3 / 1_037_000 * 11.85, abs=0.01)
    assert "repair:hvac" in r["excludedLineIds"] and L["repair:hvac"]["expected"] is None
    assert r["totalsStatus"].startswith("partial")
    assert sum(r["statusCounts"].values()) == len(r["lines"])
    assert r["totals"]["oneTime"]["expected"] > 0 and r["totals"]["monthly"]["expected"] > 0


def test_costs_los_angeles_sewer_unknown(monkeypatch):
    fake(monkeypatch, "Los Angeles, CA")
    r = client.get("/api/property/7/costs").json()
    assert "util_sewer:los_angeles" in r["excludedLineIds"]


def test_costs_unknown_area_not_zero(monkeypatch):
    fake(monkeypatch, "Springfield, ZZ")
    r = client.get("/api/property/7/costs").json()
    u = [l for l in r["lines"] if l["category"] == "utility"]
    assert len(u) == 1 and u[0]["expected"] is None


def test_costs_404_and_bad_repairs(monkeypatch):
    fake(monkeypatch, "Houston, TX")
    assert client.get("/api/property/8/costs").status_code == 404
    assert client.get("/api/property/7/costs?repairs=plumbing:x").status_code == 422
