import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from data.costar import client, series_fetch  # noqa: E402
from app.main import app  # noqa: E402


def w(d: Path, name, rows):
    (d / f"{name}.jsonl").write_text("\n".join(json.dumps(r) for r in rows) + "\n")


@pytest.fixture
def kit(tmp_path, monkeypatch):
    addr = lambda m: {"researchMarketId": m}
    w(tmp_path, "commercial-property", [
        {"id": 1, "propertyType": 5, "primaryAddress": addr(14), "primarySubmarketId": 9, "rentableBuildingAreaSquareFeet": 5000},
        {"id": 2, "propertyType": 11, "primaryAddress": addr(20)}, {"id": 3, "propertyType": 5, "primaryAddress": addr(14)}])
    w(tmp_path, "location-occupancy", [
        {"id": 10, "propertyId": 1, "tenantLocationId": 100, "fromDate": "2020-02-10T12:00:00-05:00",
         "spaces": [{"squareFeetOccupied": 1000}], "leaseDeal": {"rateActual": 2.0, "rateAmountType": 0, "rateBasis": 1}},
        {"id": 11, "propertyId": 1, "tenantLocationId": None, "fromDate": "2020-03-01T12:00:00-05:00", "spaces": [],
         "leaseDeal": {"rateActual": 30.0, "rateAmountType": 0, "rateBasis": 0}}])  # basis unknown -> no rate
    w(tmp_path, "company-detail", [{"id": 100, "name": "Synthetic Co", "numEmployees": 4}])
    w(tmp_path, "commercial-sale-comp", [
        {"id": 20, "soldDate": "2019-12-01T00:00:00", "soldForPrice": 1000000, "numberOfEntities": 1, "entities": [{"propertyId": 1}]},
        {"id": 21, "soldDate": "2021-05-01T00:00:00", "soldForPrice": 9000000, "numberOfEntities": 2,
         "entities": [{"propertyId": 1}, {"propertyId": 3}]}])
    w(tmp_path, "commercial-listing-summary", [{"id": 30, "propertyId": 1, "listingStatus": 1, "listingType": 14}])
    w(tmp_path, "apartment-listing", [{"propertyId": 2, "minRent": 1500, "maxRent": 2500}])
    monkeypatch.setenv("COSTAR_KIT_DIR", str(tmp_path))
    client.kit.cache_clear()
    yield
    client.kit.cache_clear()


def test_extended_observed_and_unknown_not_zero(kit):
    r = TestClient(app).get("/api/costar/1/extended").json()
    assert r["areaSqft"] == 5000 and r["fill"] == {"tenancies": True, "saleComps": True, "listings": True, "apartment": False}
    t = {x["from"]: x for x in r["tenancies"]}
    assert t["2020-02-10"]["tenant"] == "Synthetic Co" and t["2020-02-10"]["contractRatePerSfYear"] == 24.0
    assert t["2020-03-01"]["tenant"] is None and t["2020-03-01"]["contractRatePerSfYear"] is None
    assert [s["price"] for s in r["saleComps"]] == [9000000, 1000000]
    assert r["saleComps"][0]["portfolioSale"] and "portfolio" in r["saleComps"][0]["priceNote"]


def test_extended_404(kit):
    assert TestClient(app).get("/api/costar/999/extended").status_code == 404


def test_market_hand_computed(kit):
    r = TestClient(app).get("/api/costar/market?metro=Houston").json()
    assert r["properties"] == 2 and r["propertiesByType"] == {"Office": 2} and r["submarkets"] == 1
    assert r["contractRatePerSfYear"] == {"n": 1, "median": 24.0}
    assert r["singlePropertySalePriceUsd"] == {"n": 1, "median": 1000000.0}  # portfolio price excluded
    la = TestClient(app).get("/api/costar/market?metro=los angeles").json()
    assert la["apartmentMinAskingRentUsd"] == {"n": 1, "median": 1500} and la["status"] == "derived"
    assert TestClient(app).get("/api/costar/market?metro=dallas").status_code == 404


def test_series_quarters_and_missing_absent(kit):
    rows = series_fetch.build(client.kit())
    got = {(r["metro"], r["quarter"], r["series"]): r for r in rows}
    assert got[("houston", "2020Q1", "lease_commencements")]["n"] == 2
    assert got[("houston", "2020Q1", "leased_sqft")]["value"] == 1000
    assert got[("houston", "2020Q1", "contract_rate_median")]["value"] == 24.0
    assert ("houston", "2021Q2", "sale_price_median") not in got  # portfolio price: unknown, not zero
    assert got[("houston", "2021Q2", "sale_comps")]["n"] == 1


def test_remote_dormant_without_env_and_cached_rate_limited(tmp_path, monkeypatch):
    monkeypatch.delenv("COSTAR_API_KEY", raising=False)
    monkeypatch.delenv("COSTAR_API_BASE_URL", raising=False)
    assert client.RemoteClient(tmp_path).get("x") is None
    monkeypatch.setenv("COSTAR_API_KEY", "synthetic")
    monkeypatch.setenv("COSTAR_API_BASE_URL", "https://example.invalid")
    calls = []

    class R:
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def read(self): return b'{"ok": 1}'
    rc = client.RemoteClient(tmp_path, min_interval=0, opener=lambda req, timeout: calls.append(req.full_url) or R())
    assert rc.get("a") == {"ok": 1} and rc.get("a") == {"ok": 1} and calls == ["https://example.invalid/a"]
