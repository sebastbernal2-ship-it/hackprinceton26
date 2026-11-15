import json
from datetime import date

import pytest

from forecasting.peers import build, data, fit
from synth_kit import write_kit

ASOF = data.ASOF


@pytest.fixture(scope="module")
def kit(tmp_path_factory):
    return write_kit(tmp_path_factory.mktemp("kit"))


def test_load_kit_spells_and_anonymisation(kit):
    k = data.load_kit(kit)
    assert 150 < len(k["food"]) <= 170 and 35 < len(k["others"]) <= 40
    s = k["food"][0]
    assert s["id"].startswith("P-") and "name" not in s and s["etype"] in (0, 1, 2) and s["years"] > 0
    assert {"cafe_coffee", "bakery", "bar"} <= {x["kind"] for x in k["food"]}
    pool = data.peer_pool(k["food"])
    assert all(p["kind"] != "non_restaurant" and p["start"].year >= 2012 for p in pool) and len(pool) < len(k["food"])  # 'Zzz Holdings' is dropped
    assert all(x["etype"] == 0 for x in k["others"])  # the synthetic non-food tenants are open


def test_evaluation_runs_and_reports_honestly(kit):
    pool = data.peer_pool(data.load_kit(kit)["food"])
    best, ev = fit.run_evaluation(pool, n_configs=6, reps=30)
    assert ev["heldOut"]["window"] == list(fit.TEST_YEARS) or tuple(ev["heldOut"]["window"]) == fit.TEST_YEARS
    assert set(ev["verdict"]) == {"closure2y", "ended2y"} and "conclusion" in ev["verdict"]["closure2y"]
    for name in ("spatialOnly", "kindOnly", "selectedExcludingOwnBuilding", "selectedExcludingPeersWithin1mi", "selectedHindsightNotAsOf"):
        assert name in ev["heldOut"]["ablations"]
    assert "outcomePermutation" in ev["leakage"] and len(ev["kCurve"]) == 6
    assert best.h_miles < 1e5  # a located model is always selected


def test_build_all_is_idempotent_and_handles_every_site_type(kit, tmp_path):
    scans = tmp_path / "scans.json"
    scans.write_text(json.dumps({"scans": [{"listingId": 1003, "city": "Houston, TX", "name": "x"}, {"listingId": -2, "city": "Houston, TX", "name": "y"}, {"listingId": 7777, "city": "Houston, TX", "name": "z"}]}))
    cand = tmp_path / "cand.csv"
    cand.write_text("property_id,latitude,longitude,city\n1005,29.71,-95.5,Houston\n1008,,,Houston\n")
    fx = [{"meta": {"listingId": 7777, "coordinates": {"lat": 29.705, "lon": -95.5, "source": "demo"}},
           "peers": {"spells": [{"id": "DEMO-1", "propertyId": -1, "lat": 29.706, "lon": -95.5, "market": "Houston", "kind": "cafe_coffee", "start": "2019-01-01", "end": None,
                                 "etype": 0, "years": 7.8}]}}]
    out = tmp_path / "out"
    rows = build.build_all(kit, out, cand, scans, fx, n_configs=4, reps=20)
    first = {p.name: p.read_bytes() for p in (out / "results").iterdir()}
    again = build.build_all(kit, out, cand, scans, fx, n_configs=4, reps=20)
    assert {p.name: p.read_bytes() for p in (out / "results").iterdir()} == first and rows == again  # same inputs, same files
    assert {r["id"] for r in rows} == {1005, 1008, 1003, -2, 7777}
    no_coords = json.loads((out / "results" / "-2.json").read_text())
    assert no_coords["knn"]["mode"] == "market_prior_only" and no_coords["neighbourhood"] is None
    res = json.loads((out / "results" / "1005.json").read_text())
    assert res["knn"]["neighbours"] and all("name" not in n for n in res["knn"]["neighbours"]) and res["demo"] is False
    assert res["knn"]["evaluation"]["plainly"]
    demo = json.loads((out / "results" / "7777.json").read_text())
    assert demo["demo"] is True and demo["knn"]["status"] == "demo" and any(n["demo"] for n in demo["knn"]["neighbours"]) and demo["demoNote"].startswith("DEMO DATA")
