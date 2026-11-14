import json, pathlib
import pytest
from factors.traffic_access import adapter as A

FX = pathlib.Path(__file__).parent
REQUIRED = {"factorId", "status", "value", "unit", "source", "recordId", "asOf", "geography", "limitations"}
SCHEMA = json.loads((pathlib.Path(__file__).resolve().parents[4] / "contracts/factor-card.schema.json").read_text())
HOU = {"property_id": "1", "state": "TX", "latitude": "29.7350", "longitude": "-95.4268"}
LA = {"property_id": "2", "state": "CA", "latitude": "34.0400", "longitude": "-118.3000"}


def load(name):
    return json.loads((FX / name).read_text())


def check_schema(rows):
    assert rows
    for r in rows:
        assert set(r) == REQUIRED == set(SCHEMA["required"])
        assert r["factorId"] == "traffic_access"
        assert r["status"] in SCHEMA["properties"]["status"]["enum"]
        assert all(isinstance(r[k], str) for k in REQUIRED)
        if r["status"] == "unknown":
            assert r["value"] == ""


def test_txdot_nearest_with_aadt_and_history():
    rows = A.observations(HOU, {"provider": "txdot", "retrieved_at": "2026-01-01", "features": load("txdot_features.json")})
    check_schema(rows)
    aadt, dist, hist = rows
    assert aadt["recordId"] == "SYN-NEAR" and aadt["value"] == "36000" and aadt["status"] == "observed"
    assert dist["status"] == "derived" and 100 < int(dist["value"]) < 120
    assert json.loads(hist["value"]) == {"2025": 36000, "2024": 34000, "2022": 30000}  # gap stays a gap


def test_txdot_none_in_range_is_unknown_not_zero():
    rows = A.observations(HOU, {"provider": "txdot", "retrieved_at": "x", "features": []})
    check_schema(rows)
    assert len(rows) == 1 and rows[0]["status"] == "unknown" and rows[0]["value"] == ""


def test_caltrans_sides_and_blank_not_zero():
    rows = A.observations(LA, {"provider": "caltrans", "retrieved_at": "x", "features": load("caltrans_features.json")})
    check_schema(rows)
    values = {r["recordId"]: r["value"] for r in rows if r["status"] == "observed"}
    assert values == {"LA-010-PMR11.391-back": "286000"}  # blank ahead omitted; no-AADT point skipped
    assert rows[0]["asOf"] == "2024"


def test_unknown_state():
    rows = A.observations({"state": "NY", "latitude": "1", "longitude": "1"}, A.fetch({"state": "NY"}))
    check_schema(rows)
    assert rows[0]["status"] == "unknown"


def test_fetch_caches_and_retries(tmp_path):
    calls = []
    def fetcher(url, params):
        calls.append(url)
        return {"features": load("txdot_features.json")}
    r1 = A.fetch(HOU, cache_dir=tmp_path, fetcher=fetcher)
    r2 = A.fetch(HOU, cache_dir=tmp_path, fetcher=fetcher)
    assert r1 == r2 and len(calls) == 1 and r1["provider"] == "txdot"


def test_get_json_retries_then_raises(monkeypatch):
    n = []
    def boom(*a, **k):
        n.append(1)
        raise OSError("down")
    monkeypatch.setattr(A.urllib.request, "urlopen", boom)
    with pytest.raises(RuntimeError):
        A._get_json("http://x", {}, retries=3, sleep=lambda s: None)
    assert len(n) == 3
