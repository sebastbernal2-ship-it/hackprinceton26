"""The Bayou Café demo fixture (services/api/app/demo_sites/bayou_cafe.json) is complete, honestly labelled, and served by every route."""
import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from app import analyses, costs_routes, demo_fixture, horizons_routes, loader, main, picker, total_cost_routes  # noqa: E402
from app.main import app  # noqa: E402
from inspection.schema import validate_finding  # noqa: E402

client = TestClient(app)
LID, TOUR = 8035301, "JAnuRsaVo9M"
FX = demo_fixture.get(LID)
FACTORS = {"property_market", "spatial_interior", "building_kit", "natural_hazards", "restaurant_lineage", "record_triage", "aerial_site",
           "climate_weather", "crime_safety", "traffic_access", "income_demographics", "labor_supply", "schools_education", "rent"}


@pytest.fixture
def world(tmp_path, monkeypatch):
    scan = tmp_path / "scans" / f"assets_{TOUR}" / "walk"
    scan.mkdir(parents=True)
    (scan / "meta.json").write_text(json.dumps({"bbox": [[-4, -4, -0.1], [3, 4, 3.1]], "pieces": []}))
    derived = tmp_path / "derived"
    (derived / "lineage").mkdir(parents=True)
    (derived / "lineage" / "lineage.json").write_text("{}")
    (derived / "lineage" / "presence.json").write_text("{}")
    (derived / "lineage" / "summary.json").write_text(json.dumps({"marketPrior": {"label": "prior"}}))
    for k, v in {"DERIVED_DIR": derived, "TRIAGE_DERIVED_DIR": derived / "triage", "LINEAGE_DIR": derived / "lineage", "STRUCTURE_DIR": derived / "structure",
                 "AERIAL_DIR": derived / "aerial", "SCAN_ASSETS_DIR": tmp_path / "scans", "DEMO_FACTOR_CARDS": derived / "none.csv",
                 "RENT_ARTIFACT_DIR": derived / "rent"}.items():
        monkeypatch.setenv(k, str(v))
    monkeypatch.delenv("INSPECTION_DIR", raising=False)
    pool = [m for m in picker.cafe_candidates() if m.listingId == LID]
    for mod in (loader, main, costs_routes, horizons_routes, total_cost_routes):
        if hasattr(mod, "load_matches"):
            monkeypatch.setattr(mod, "load_matches", lambda *a, **k: [m.model_copy(deep=True) for m in pool])
    monkeypatch.setattr(analyses, "_match", lambda lid: pool[0] if lid == LID else None)
    analyses._BIG.clear()
    return pool[0]


def test_fixture_is_indexed_by_listing_and_tour():
    assert demo_fixture.get(tour=TOUR) is FX and demo_fixture.has(LID) and not demo_fixture.has(1)


def test_fixture_is_complete():
    b = FX["buildingKit"]
    for k in ("yearBuilt", "renovatedYear", "material", "buildingClass", "stories", "heightFt", "hasSprinklers", "grossSqFt", "leasableSqFt", "parking"):
        assert b[k] is not None, k
    s = FX["structure"]
    assert s["fema"]["zone"] and s["usgs"]["sdc"] and s["elevationFt"] and s["geotech"] and s["windMphDesign"]
    assert set(FX["climate"]["costDeltas"]) == {"coolingUsdPerYear", "floodInsuranceUsdPerYear"}
    L = FX["lineage"]
    assert 6 <= len(L["tenants"]) <= 8 and all(t["start"] and t["end"] and t["tenureYears"] and t["ending"] for t in L["tenants"])
    assert L["medianCompletedTenureYears"] and L["isSecondGenerationSpace"] is True and isinstance(L["churnFlag"], bool)
    assert any(t["successorWasFood"] for t in L["tenants"])
    P = FX["presence"]
    assert P["radii"]["0.5mi"]["day"]["workers"] and P["radii"]["0.5mi"]["night"]["nightPopulation"]["expected"] and P["footTraffic"]
    assert [f["field"] for f in FX["triage"]["fields"]] == ["clear_height_ft", "floors", "area_sqft", "restroom_count", "kitchen_present", "parking_spaces", "rooftop_units", "loading_docks"]
    assert all(f["costarValue"] is not None and (f["scanValue"] is not None or f["aerialValue"] is not None) and f["note"] for f in FX["triage"]["fields"])
    a = FX["aerial"]
    assert a["roof"]["type"] and a["roof"]["areaSqFt"] and a["imagery"]["capture_date"]
    for k in ("vehicles", "rooftop_units", "parking_stalls", "loading_docks", "roof_area_shape"):
        assert a[k]["expected"] is not None
    fs = FX["inspection"]["findings"]
    assert 12 <= len(fs) <= 14 and all(not validate_finding(f) for f in fs)
    assert {"kitchen_infrastructure", "ceiling_water_damage", "structural", "flooring", "plumbing", "egress_accessibility", "electrical", "hvac", "other"} <= {f["category"] for f in fs}
    assert all(f["fixCostUsd"]["low"] < f["fixCostUsd"]["high"] and f["verifyWith"] and f["evidence"]["ref"] and f["severity"] in ("low", "medium", "high") for f in fs)
    assert {c["metric"] for c in FX["projections"]["cards"]} == {"rent per sq ft growth", "vacancy rate", "foot traffic change", "build-out cost trend"}
    assert all(set(c["rows"]) == {"12 months", "3-5 years", "2030"} and all(lo <= pt <= hi for lo, pt, hi in c["rows"].values()) for c in FX["projections"]["cards"])
    r = FX["rentLease"]
    assert r["askingRentPerSfYear"] and r["structure"] == "NNN" and r["tiAllowancePerSf"] and len(r["comps"]) == 6
    m = FX["market"]
    assert m["demographics"] and m["competition"]["count1mi"] == len(m["competition"]["names"]) and m["traffic"] and m["crime"] and m["transit"]
    lg = FX["legal"]
    assert lg["zoning"]["district"] and lg["permittedUse"]["status"] == "estimated" and lg["priorUse"]["value"] == "cafe"
    assert FX["seats"]["low"] <= FX["seats"]["estimate"] <= FX["seats"]["high"]
    assert FACTORS - {"traffic_access", "schools_education"} <= {c["factorId"] for c in FX["factors"]} and len(FX["factors"]) >= 14


def test_fixture_labels_invented_values_as_demo():
    assert FX["meta"]["label"].startswith("DEMO DATA")
    for c in FX["factors"]:
        assert c["status"] in ("derived", "estimated") and c["value"].startswith("DEMO DATA") or c["status"] == "observed", c["factorId"]
    for f in FX["inspection"]["findings"]:
        assert f["description"].startswith("DEMO DATA") and f["status"] in ("derived", "estimated")
    assert FX["inspection"]["notice"].startswith("DEMO DATA") and FX["lineage"]["note"].startswith("DEMO DATA")
    for sect in ("aerial", "projections", "horizons"):
        assert "DEMO" in json.dumps(FX[sect])
    # only fields copied from the real kit may be observed
    obs = {k for k, v in FX["buildingKit"].items() if isinstance(v, dict) and v.get("status") == "observed"}
    assert obs == {"yearBuilt", "material", "buildingClass", "stories", "grossSqFt", "units"}
    assert all(f["valueStatus"] != "observed" or f["field"] in ("floors", "parking_spaces") for f in FX["triage"]["fields"])


def test_evidence_readiness_is_consistent_and_high(world):
    m = picker.cafe_candidates()[2] if picker.cafe_candidates()[2].listingId == LID else next(x for x in picker.cafe_candidates() if x.listingId == LID)
    assert FACTORS <= {c.factorId for c in m.factors} and len(m.factors) >= 14
    assert m.evidenceReadiness == demo_fixture.readiness(m.factors) >= 85
    assert m.rentPerSquareFootYear == 30.0 and m.squareFeet == m.spaceSquareFeet == 1300 and m.spaceSource == "scan-estimate"
    assert picker.is_cafe_scan(m)


def test_demo_factors_route_serves_the_fixture(world):
    cards = client.get(f"/api/demo/{TOUR}/factors").json()
    assert FACTORS <= {c["factorId"] for c in cards}
    assert not [c for c in cards if c["status"] == "unknown"]
    assert client.get(f"/api/demo-site/{LID}").json()["meta"]["tourId"] == TOUR and client.get("/api/demo-site/1").status_code == 404


def test_structure_and_scenarios_routes(world):
    s = client.get(f"/api/structure/{LID}").json()
    assert s["kit"]["yearBuilt"] == 1972 and s["kit"]["hasSprinklers"] is True and s["kit"]["heightFt"] == 28
    assert s["hazards"]["fema"]["zone"] and s["hazards"]["usgs"]["sdc"] and s["hazards"]["elevationFt"] and s["demo"] is True
    assert s["screening"]["tier"] and set(s["screening"]["tierByLens"]) >= {"seismic", "flood", "geotechnical"}
    assert s["hazards"]["subsidence"].startswith("DEMO DATA")
    r = client.get(f"/api/structure/{LID}/scenarios")
    assert r.status_code == 200
    d = r.json()
    assert d["demoClimate"]["costDeltas"]["coolingUsdPerYear"]["High"]["2070"] == 3000


def test_lineage_presence_triage_aerial_routes(world):
    lin = client.get(f"/api/lineage/{LID}").json()
    assert lin["foodHistoryInKit"] and len(lin["tenants"]) >= 6 and lin["demo"] is True and lin["anonymized"] and "name" not in lin["tenants"][0]
    assert "name" in client.get(f"/api/lineage/{LID}?names=true").json()["tenants"][0]
    assert lin["marketPrior"]["label"] == "prior" and lin["isSecondGenerationSpace"] is True
    pres = client.get(f"/api/presence/{LID}").json()
    assert pres["radii"]["0.5mi"]["day"]["workers"] and pres["footTraffic"]["status"] == "estimated"
    tri = client.get(f"/api/triage/property/{LID}").json()
    assert len(tri["fields"]) == 8 and all(f["costarValue"] is not None for f in tri["fields"]) and tri["demoNote"].startswith("DEMO DATA")
    assert all(f["valueStatus"] in ("observed", "derived", "estimated") for f in tri["fields"])
    aer = client.get(f"/api/aerial/{LID}").json()
    assert aer["roof"]["type"] and aer["rooftop_units"]["expected"] == 6 and aer["imagery"]["capture_date"]


def test_inspection_projection_horizon_rent_routes(world):
    ins = client.get(f"/api/property/{LID}/inspection").json()
    assert ins["mode"] == "demo" and 12 <= len(ins["findings"]) <= 14 and all(f["costLineItemIds"] is not None for f in ins["findings"])
    pr = client.get(f"/api/property/{LID}/projections").json()
    assert len(pr["projections"]) == 12 and all(c["status"] == "estimated" and c["method"].startswith("DEMO ESTIMATE") for c in pr["projections"])
    hz = client.get(f"/api/horizons/{LID}").json()
    assert len(hz["demoForecasts"]) == 12
    rent = next(r for r in hz["rows"] if r["key"] == "rent_level")
    assert rent["cells"]["12m"]["state"] == "estimated" and rent["cells"]["2030"]["cards"][0]["point"] == 35.5
    rr = client.get(f"/api/rent/{LID}").json()
    assert rr["card"]["status"] == "estimated" and rr["card"]["point"] == 30.0 and len(rr["lease"]["comps"]) == 6


def test_costs_total_cost_and_layout_cost_work(world):
    c = client.get(f"/api/property/{LID}/costs").json()
    repairs = [x for x in c["lines"] if x["itemId"].startswith("repair:") and x["itemId"] not in ("repair:other", "repair:layout_inefficiency")]
    assert repairs and all(x["status"] != "unknown" and x["expected"] for x in repairs)
    t = client.get(f"/api/property/{LID}/total-cost").json()
    assert t["totalStatus"] == "complete"
    assert t["rentChosen"]["id"] == "listing" and t["rentChosen"]["status"] == "estimated" and t["rentChosen"]["rate"] == 30.0
    assert t["total"]["low"] and t["total"]["high"]
    lc = client.post("/api/layout-cost", json={"items": [{"assetId": "espresso_machine_2group", "quantity": 1}], "sqft": FX["buildingKit"]["leasableSqFt"]["value"]})
    assert lc.status_code == 200 and lc.json()["fitout"]["squareFeet"] == 1300 and lc.json()["lines"]
