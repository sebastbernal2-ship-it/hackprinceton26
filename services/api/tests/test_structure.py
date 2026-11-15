import json

import pytest
from fastapi.testclient import TestClient

from app.main import app
from structure import expansion, scenarios, screening

client = TestClient(app)

LA = {"city": "Los Angeles", "state": "CA", "yearBuilt": 1925, "material": "Masonry", "stories": 2, "grossSqFt": 9000,
      "fema": {"zone": "X"}, "usgs": {"sdc": "D", "sds": 1.5, "sd1": 1.1, "pgam": 0.8}, "elevationFt": 300.0}
HOU = {"city": "Houston", "state": "TX", "yearBuilt": 1960, "material": None, "stories": 1, "grossSqFt": 4000,
       "fema": {"zone": "AE", "bfeFt": 40}, "usgs": {"sdc": "B"}, "elevationFt": 47.0}


def plan():
    sq = lambda x0, y0, x1, y1: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
    return {"rooms": [{"id": "a", "floor": "f", "label": "Dining", "polygon": sq(0, 0, 5, 4), "area_m2": 20},
                      {"id": "b", "floor": "f", "label": "Suite B", "polygon": sq(5, 0, 9, 4), "area_m2": 16},
                      {"id": "c", "floor": "f", "label": "Suite C", "polygon": sq(0, 4, 5, 7), "area_m2": 15},
                      {"id": "d", "floor": "f", "label": "Far", "polygon": sq(20, 20, 25, 25), "area_m2": 25}],
            "walls": [{"a": [5, 0], "b": [5, 4], "thickness": 0.30, "physical": True},
                      {"a": [0, 4], "b": [5, 4], "thickness": 0.10, "physical": True}]}


def test_screening_la_urm_elevated_with_thresholds():
    s = screening.screen(LA)
    ids = {f["id"] for f in s["flags"]}
    assert {"usgs_sdc", "la_urm", "fema_zone"} <= ids and s["tier"] == "elevated"
    urm = next(f for f in s["flags"] if f["id"] == "la_urm")
    assert urm["threshold"]["value"] == 1934 and urm["threshold"]["source"] == "assumption"
    assert "NOT an engineering assessment" in s["notice"]


def test_screening_unknown_material_not_guessed():
    s = screening.screen({**LA, "material": None})
    era = next(f for f in s["flags"] if f["id"] == "la_era")
    assert era["severity"] is None and "unknown" in era["text"]
    assert "material" in s["unknowns"]


def test_screening_houston_flood_and_clay():
    s = screening.screen(HOU)
    assert s["tierByLens"]["flood"] == "elevated" and any(f["id"] == "hou_clay" and f["status"] == "assumption" for f in s["flags"])
    assert screening.screen({"city": "Springfield", "state": "ZZ"})["tier"] == "unknown"


FETCH = {"retrieved": "2026-11-14", "noaaSlr": {"galveston": {"url": "u", "rows": [
    {"projectionYear": 2050, "scenario": "High", "projectionRsl": 60.96, "projectionCiLow": 40.0, "projectionCiHigh": 91.44}]}},
    "calAdapt": {}}
for m in ("A", "B"):
    FETCH["calAdapt"][f"tasmax_year_{m}_historical"] = {"url": "h", "index": [f"{y}-12-31T00:00:00Z" for y in range(1950, 2006)], "data": [290.0] * 56}
    for sc, d in (("rcp45", 1.0), ("rcp85", 2.0)):
        FETCH["calAdapt"][f"tasmax_year_{m}_{sc}"] = {"url": f"f{m}{sc}", "index": [f"{y}-12-31T00:00:00Z" for y in range(2006, 2100)],
                                                      "data": [290.0 + d * (1 if m == "A" else 2)] * 94}


def test_scenario_table_hand_computed_and_unsourced():
    t = scenarios.table(FETCH, "LA")
    r = next(x for x in t["rows"] if x["scenario"].endswith("RCP8.5") and x["horizon"] == 2050)
    assert (r["low"], r["value"], r["high"]) == (2.0, 3.0, 4.0) and r["unit"] == "degC"
    assert any(n["result"] == "no sourced projection" for n in t["noSourced"])
    h = scenarios.table(FETCH, "HOU")
    assert not [x for x in h["rows"] if x["unit"] == "degC"]
    assert any("Houston" in n["metric"] and n["result"] == "no sourced projection" for n in h["noSourced"])
    assert scenarios.table(None, None)["rows"] == []


def test_exposure_headroom_and_unknown_elevation():
    e = scenarios.exposure(HOU, FETCH, "HOU")["horizons"]
    h50 = next(x for x in e if x["horizon"] == 2050)
    assert h50["seaLevel"]["headroomFt"] == pytest.approx(47.0 - 91.44 / 30.48, abs=0.1)
    assert h50["heat"] == "no sourced projection" and h50["wind"] == "no sourced projection"
    h30 = next(x for x in scenarios.exposure({**HOU, "elevationFt": None}, FETCH, "HOU")["horizons"] if x["horizon"] == 2050)
    assert h30["seaLevel"]["headroomFt"] is None


def test_adjacency_hints_and_candidates():
    g = expansion.adjacency(plan())
    e = {(x["a"], x["b"]): x for x in g["edges"]}
    assert e[("a", "b")]["sharedWallLengthM"] == 4.0 and e[("a", "b")]["hint"] == "thick"
    assert e[("a", "c")]["hint"] == "thin" and ("a", "d") not in e
    c = expansion.candidates(plan(), ["a"])
    assert [x["roomId"] for x in c["candidates"]] == ["b", "c"]  # sorted by area gained
    assert c["candidates"][0]["areaSqFtGained"] == pytest.approx(16 * 10.7639, abs=0.1)
    assert "engineer" in c["candidates"][0]["openingDifficultyHint"]
    assert expansion.candidates(plan(), ["zzz"])["unknownBaseRoomIds"] == ["zzz"]


def test_timeline_unknown_not_zero():
    from planning import financials
    t = expansion.timeline(financials.all_lines("Houston", "TX", {}), expansion.candidates(plan(), ["a"]))
    ph = {p["phase"]: p for p in t["phases"]}
    assert ph["seating"]["capex"]["expected"] is None and ph["expand"]["capex"]["expected"] is None
    assert ph["open"]["capex"]["expected"] > 0 and ph["second_line"]["capex"]["expected"] > 0
    assert t["cumulativeStatus"].startswith("partial") and all(p["verifyWithEngineer"] for p in t["phases"])
    assert ph["expand"]["expansionCandidate"]["roomId"] == "b"


def test_routes(tmp_path, monkeypatch):
    (tmp_path / "properties.json").write_text(json.dumps({"7": LA, "8": HOU}))
    (tmp_path / "climate_fetch.json").write_text(json.dumps(FETCH))
    monkeypatch.setenv("STRUCTURE_DIR", str(tmp_path))
    r = client.get("/api/structure/7").json()
    assert r["screening"]["tier"] == "elevated" and r["fillRates"]["n"] == 2
    assert client.get("/api/structure/999").status_code == 404
    s = client.get("/api/structure/7/scenarios").json()
    assert s["label"] == "scenario analysis, not a forecast" and s["exposure"]["horizons"][0]["horizon"] == 2030
    x = client.post("/api/structure/expansion", json={"listingId": 8, "plan": plan(), "baseRoomIds": ["a"]}).json()
    assert x["expansion"]["candidates"] and x["timeline"]["phases"][0]["capex"]["expected"] > 0
    assert client.post("/api/structure/expansion", json={"plan": {}, "baseRoomIds": ["a"]}).status_code == 422


def test_routes_no_snapshot(tmp_path, monkeypatch):
    monkeypatch.setenv("STRUCTURE_DIR", str(tmp_path))
    assert client.get("/api/structure/7").status_code == 503  # snapshot not built, not "listing unknown"
    assert client.get("/api/structure/7/scenarios").status_code == 503


def test_expansion_without_snapshot_still_runs_with_unknown_signals(tmp_path, monkeypatch):
    """The sample-plan simulator must not die because the per-property snapshot is missing or lacks this listing."""
    monkeypatch.setenv("STRUCTURE_DIR", str(tmp_path))
    body = {"listingId": 7, "plan": plan(), "baseRoomIds": ["a"]}
    assert client.post("/api/structure/expansion", json=body).status_code == 200
    (tmp_path / "properties.json").write_text(json.dumps({"8": HOU}))
    assert client.post("/api/structure/expansion", json=body).status_code == 200


def _slr_fetch():
    rows = [{"projectionYear": h, "scenario": s, "projectionRsl": cm, "projectionCiLow": cm - 5, "projectionCiHigh": cm + 5}
            for s, base in (("Low", 20.0), ("Intermediate", 40.0), ("High", 60.0)) for h, cm in ((2030, base), (2050, base * 2), (2070, base * 3))]
    return {"retrieved": "r", "noaaSlr": {"galveston": {"url": "u", "rows": rows}}, "calAdapt": {}}


def test_climate_metrics_move_with_scenario_and_horizon_and_are_deterministic():
    m = scenarios.metrics(8, HOU, _slr_fetch(), "HOU")
    assert m["scenarios"] == ["Low", "Intermediate", "High"] and m["horizons"] == [2030, 2050, 2070]
    by = {x["id"]: x for x in m["metrics"]}
    assert by["slr"]["kind"] == "sourced" and by["days"]["kind"] == "demo"
    for k in ("slr", "days", "depth", "cool", "ins"):
        s = by[k]["series"]
        assert s["Low"]["2030"] < s["High"]["2070"]  # monotone across scenario and horizon
        assert s["Low"]["2030"] <= s["Low"]["2070"] and s["Low"]["2070"] <= s["High"]["2070"]
    assert by["slr"]["series"]["High"]["2050"] == 120.0
    assert scenarios.metrics(8, HOU, _slr_fetch(), "HOU") == m


def test_climate_metrics_empty_without_sourced_path():
    assert scenarios.metrics(1, HOU, None, None)["metrics"] == []
    assert scenarios.metrics(1, HOU, FETCH, "HOU")["metrics"] == []  # FETCH lacks Low/Intermediate: not invented
