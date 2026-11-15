import copy

from fastapi.testclient import TestClient

from app.main import app
from forecasting.horizons import build

client = TestClient(app)
LA = {"city": "Los Angeles", "state": "CA", "elevationFt": 300, "fema": {"zone": "X"}, "retrieved": "2026-11-14"}
HOU = {"city": "Houston", "state": "TX"}
VAL = [{"name": "holdout_mase", "value": 0.8, "threshold": 1.0, "passed": True}]


def fitted(geo, metric="LAPD reported crime incidents, monthly count", horizon="12 months ahead (2027-10)", passed=True):
    v = [dict(VAL[0], passed=passed)]
    return {"kind": "fitted", "status": "estimated", "metric": metric, "horizon": horizon, "scenario": "status quo", "point": 5.0, "lower": 4.0,
            "upper": 6.0, "unit": "x", "method": "ETS, rolling origin; scenario/estimate", "trainingWindow": {"start": "2015-01", "end": "2026-06", "geography": geo},
            "citation": {"source": "s", "recordId": "r", "asOf": "2026-11-14", "geography": geo, "limitations": "l"}, "validation": v}


def art(cards, gate_failed=None):
    return {"present": True, "cards": cards, "gate_failed": gate_failed}


def cellof(t, row, col):
    return next(r for r in t["rows"] if r["key"] == row)["cells"][col]


def test_all_pending_or_cannot_without_artifacts():
    t = build.build_table(LA)
    assert len(t["rows"]) == 11 and t["columns"] == build.COLUMNS
    assert set(t["counts"]) <= {"cannot_say", "pending", "observed", "published"}
    assert cellof(t, "crime_context", "12m")["state"] == "pending"


def test_fitted_card_in_matching_city_only():
    cards = [fitted("City of Los Angeles (LAPD)")]
    assert cellof(build.build_table(LA, arts={"series": art(cards)}), "crime_context", "12m")["state"] == "fitted"
    t = build.build_table(HOU, arts={"series": art(cards)})
    assert cellof(t, "crime_context", "12m")["state"] == "cannot_say"  # never a cross-city fill


def test_mixed_city_geography_rejected():
    c = fitted("Los Angeles and Houston")
    assert cellof(build.build_table(LA, arts={"series": art([c])}), "crime_context", "12m")["state"] == "cannot_say"


def test_failed_validation_is_hidden_and_not_filled():
    c = fitted("City of Los Angeles (LAPD)", passed=False)
    x = cellof(build.build_table(LA, arts={"series": art([c])}), "crime_context", "12m")
    assert x["state"] == "cannot_say" and "failed validation" in x["reason"]


def test_ambiguous_multiple_cards_refused():
    cs = [fitted("Harris County TX, Houston station 1", metric="AADT at station 1", horizon="1 year ahead (2027)") for _ in range(2)]
    assert cellof(build.build_table(HOU, arts={"series": art(cs)}), "traffic_trend", "12m")["state"] == "cannot_say"


def test_gate_failed_artifact_emits_nothing():
    x = cellof(build.build_table(LA, ptype="GeneralRetail", arts={"survival": art([], "gate failed on held-out split: c-index")}), "tenancy_survival", "3_5y")
    assert x["state"] == "cannot_say" and "gate failed" in x["reason"]


def test_survival_segment_and_bucket():
    def sv(h): return fitted("Los Angeles", metric="Share of tenancies in retail space ending", horizon=f"{h} year(s) from tenancy start")
    t = build.build_table(LA, ptype="GeneralRetail", arts={"survival": art([sv(1), sv(3), sv(5)])})
    assert len(cellof(t, "tenancy_survival", "3_5y")["cards"]) == 2 and len(cellof(t, "tenancy_survival", "12m")["cards"]) == 1
    t2 = build.build_table(LA, ptype="Office", arts={"survival": art([sv(1)])})
    assert cellof(t2, "tenancy_survival", "12m")["state"] == "cannot_say"


def test_population_published_respects_state_and_horizon():
    src = {"sources": [
        {"kind": "population projection", "geography": "California and counties", "horizon": "2020-2070", "title": "CA", "publisher": "DOF", "url": "u", "retrieved": "2026-11-14", "limitations": "l"},
        {"kind": "population projection", "geography": "Texas and counties", "horizon": "2020-2060", "title": "TX", "publisher": "TDC", "url": "u2", "retrieved": "2026-11-14", "limitations": "l"}]}
    la, hou = build.build_table(LA, published=src), build.build_table(HOU, published=src)
    assert cellof(la, "population_trend", "2070")["state"] == "published"
    assert cellof(hou, "population_trend", "2050")["state"] == "published" and cellof(hou, "population_trend", "2070")["state"] == "cannot_say"
    assert cellof(la, "population_trend", "2050")["cards"][0]["citation"]["asOf"] == "2026-11-14"


def test_scenarios_la_only_and_heat_days_cannot_say():
    fetch = {"retrieved": "2026-11-14", "noaaSlr": {"los_angeles": {"url": "http://noaa", "rows": [
        {"projectionYear": 2050, "scenario": "Intermediate", "projectionCiLow": 10, "projectionRsl": 20, "projectionCiHigh": 30}]}}}
    t = build.build_table(LA, fetch=fetch)
    assert cellof(t, "sea_level_flood", "2050")["state"] == "published" and cellof(t, "sea_level_flood", "2030")["state"] == "cannot_say"
    assert cellof(t, "heat_days", "2050")["state"] == "cannot_say"
    assert cellof(build.build_table(HOU, fetch=fetch), "sea_level_flood", "2050")["state"] == "cannot_say"
    assert cellof(t, "sea_level_flood", "now")["observed"]["femaZone"] == "X"


def test_unfittable_published_card_without_asof_dropped():
    c = copy.deepcopy(fitted("City of Los Angeles (LAPD)"))
    c["kind"] = "published"; c["trainingWindow"] = None; c["validation"] = []; c["citation"]["asOf"] = ""
    assert cellof(build.build_table(LA, arts={"series": art([c])}), "crime_context", "12m")["state"] == "cannot_say"


def test_route(tmp_path, monkeypatch):
    import json
    (tmp_path / "properties.json").write_text(json.dumps({"7": LA}))
    monkeypatch.setenv("STRUCTURE_DIR", str(tmp_path))
    monkeypatch.setenv("HORIZONS_SERIES_DIR", str(tmp_path / "none"))
    monkeypatch.setenv("HORIZONS_FACTORS", str(tmp_path / "none.csv"))
    r = client.get("/api/horizons/7")
    assert r.status_code == 200 and r.json()["listingId"] == 7 and len(r.json()["rows"]) == 11
    assert client.get("/api/horizons/8").status_code == 404
