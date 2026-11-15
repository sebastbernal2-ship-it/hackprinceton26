import json
import sys
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from triage.lineage import core  # noqa: E402
from triage.presence import core as pcore  # noqa: E402
from app.main import app  # noqa: E402

ASOF = date(2026, 11, 9)


def occ(t, fr, to, reason=0, name=None):
    return {"tenantLocationId": t, "fromDate": fr, "toDate": to, "expirationReason": reason, "name": name}


def test_lineage_endings_successor_and_anonymization():
    L = core.building_lineage([
        occ(1, "2015-01-01", "2018-01-01", 4, "Secret Cafe"),   # clear failure, successor starts within a year
        occ(2, "2018-03-01", "2021-03-01", 10),                  # MovingOutNewAddressUnknown: other exit
        occ(3, "2022-01-01", None),                              # open
        occ(4, "2020-01-01", "2030-01-01", 0),                   # scheduled future end => open
    ], ASOF)
    t = {r["tenant"]: r for r in L["tenants"]}
    assert [r["tenant"] for r in L["tenants"]] == ["Tenant 1", "Tenant 2", "Tenant 3", "Tenant 4"]
    assert t["Tenant 1"]["ending"] == "failure" and t["Tenant 1"]["successorWasFood"] is True
    assert t["Tenant 2"]["ending"] == "other_exit"
    assert t["Tenant 3"]["ending"] == "open" and t["Tenant 3"]["successorWasFood"] is None
    assert t["Tenant 4"]["ending"] == "open"
    assert L["counts"]["clearFailure"] == 1 and L["counts"]["otherExit"] == 1 and L["counts"]["open"] == 2
    assert L["medianCompletedTenureYears"] == pytest.approx(3.0, abs=0.02)
    assert L["isSecondGenerationSpace"] and L["secondGeneration"]["failuresWithFoodSuccessor"] == 1
    assert "name" not in t["Tenant 1"] and "Secret" not in json.dumps(L)


def test_same_tenant_spells_merge_and_no_successor_when_gap_long():
    L = core.building_lineage([occ(1, "2015-01-01", "2016-01-01", 7), occ(1, "2016-01-01", "2017-01-01", 4),
                               occ(2, "2019-01-01", "2020-01-01", 4)], ASOF)
    assert L["counts"]["foodTenants"] == 2
    assert L["tenants"][0]["tenureYears"] == pytest.approx(2.0, abs=0.01) and L["tenants"][0]["ending"] == "failure"
    assert L["tenants"][0]["successorWasFood"] is False  # next food tenant starts 2 years later
    assert L["churnFlag"] is False  # fewer than 3 tenants


def test_churn_flag():
    occs = [occ(i, f"{2015 + i}-01-01", f"{2015 + i}-10-01", 4) for i in range(1, 4)]
    assert core.building_lineage(occs, ASOF)["churnFlag"] is True


def test_km_hand_computed():
    # 20 spells: 10 ended at 1y, 10 censored at 3y => S(1)=0.5, S(2)=0.5
    r = core.km([1.0] * 10 + [3.0] * 10, [1] * 10 + [0] * 10, horizons=(1, 2))
    assert r["atYears"]["1"]["survival"] == 0.5 and r["atYears"]["2"]["survival"] == 0.5
    assert r["medianYears"] == 1.0


def test_cumulative_failure_competing():
    # 4 spells: failure@1, other@1, censored@3, censored@3 => CIF(2)= 1/4
    assert core.cumulative_failure([1, 1, 3, 3], [1, 2, 0, 0], 2) == pytest.approx(0.25)


def test_survival_context_label_and_unevaluable():
    few = [{"propertyId": i, "years": 0.5, "etype": 1} for i in range(5)]
    r = core.survival_context(few, reps=10)
    assert r["label"] == "exploratory market prior, not a per-site prediction"
    assert r["failureCumulativeIncidence"]["3"] is None and r["tenancyEndKM"]["atYears"]["3"] is None  # not evaluable, not 0


def bld(i, lat, ptype=5, units=None, rooms=None, occ_pct=None, tenants=()):
    return {"id": i, "lat": lat, "lon": 0.0, "ptype": ptype, "units": units, "rooms": rooms, "occ_pct": occ_pct, "tenants": list(tenants)}


def test_presence_hand_computed():
    deg = 0.1 / 69.09  # ~0.1 mile of latitude
    b = [bld(1, deg, tenants=[{"loc": 1, "employees": 100, "industry": 12}, {"loc": 2, "employees": None, "industry": 4}]),
         bld(2, deg * 2, tenants=[{"loc": 1, "employees": 100, "industry": 12}]),    # same location: deduped
         bld(3, deg * 2.2, ptype=11, units=50),
         bld(4, deg * 2.3, ptype=1, rooms=100, occ_pct=50),
         bld(5, deg * 4, ptype=11, units=1000)]  # ~0.4 mi: only in 0.5 radius
    P = pcore.presence(0.0, 0.0, b)["radii"]
    n = P["0.25mi"]
    assert n["day"]["workers"] == 100 and n["day"]["tenantLocations"] == 2 and n["day"]["locationsWithEmployeeCount"] == 1
    assert n["day"]["employeeFillRate"] == 0.5 and n["day"]["byIndustry"] == {"Professional/Scientific/Technical": 100}
    assert n["night"]["residents"]["expected"] == 100 and n["night"]["hotelGuests"]["expected"] == 75
    assert n["night"]["nightPopulation"]["expected"] == 175 and n["dayShare"] == pytest.approx(100 / 275, abs=0.001)
    assert n["shape"] == "mixed"  # day share 0.364, between 0.35 and 0.65
    assert P["0.5mi"]["night"]["apartmentUnits"] == 1050


def test_presence_unknown_not_zero():
    P = pcore.presence(0.0, 0.0, [bld(1, 0.0, tenants=[{"loc": 1, "employees": None, "industry": 4}])])["radii"]["0.25mi"]
    assert P["day"]["workers"] is None and P["night"]["nightPopulation"] is None and P["shape"] == "unknown"
    assert any("foot traffic" in a for a in pcore.assumptions())


@pytest.fixture
def client(tmp_path, monkeypatch):
    L = core.building_lineage([occ(1, "2015-01-01", "2018-01-01", 4, "Secret Cafe")], ASOF, names=True)
    L.update(market="Houston", isCandidate=True)
    pres = pcore.presence(0.0, 0.0, [])
    (tmp_path / "lineage.json").write_text(json.dumps({"7": L}))
    (tmp_path / "presence.json").write_text(json.dumps({"7": pres, "8": pres}))
    (tmp_path / "summary.json").write_text(json.dumps({"marketPrior": {"label": core.MARKET_PRIOR_LABEL}}))
    monkeypatch.setenv("LINEAGE_DIR", str(tmp_path))
    return TestClient(app)


def test_api_routes(client):
    r = client.get("/api/lineage/7").json()
    assert r["foodHistoryInKit"] and "Secret" not in json.dumps(r) and r["anonymized"] is True
    assert client.get("/api/lineage/7?names=true").json()["tenants"][0]["name"] == "Secret Cafe"
    n = client.get("/api/lineage/8").json()
    assert n["foodHistoryInKit"] is False and n["tenants"] == []
    assert client.get("/api/lineage/99").status_code == 404
    assert client.get("/api/lineage/summary").json()["marketPrior"]["label"].startswith("exploratory")
    p = client.get("/api/presence/7").json()
    assert p["radii"]["0.25mi"]["shape"] == "unknown" and p["assumptions"]
    assert client.get("/api/presence/99").status_code == 404


def test_api_unbuilt_is_503(tmp_path, monkeypatch):
    monkeypatch.setenv("LINEAGE_DIR", str(tmp_path))
    assert TestClient(app).get("/api/presence/1").status_code == 503
