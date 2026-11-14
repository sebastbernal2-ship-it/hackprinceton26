import json
import pathlib

from factors.labor_supply import adapter

FIX = pathlib.Path(__file__).parent / "fixtures" / "houston_trimmed.json"
REQUIRED = {"factorId", "status", "value", "unit", "source", "recordId", "asOf", "geography", "limitations"}
HOU = {"city": "Houston", "state": "TX", "latitude": "29.7", "longitude": "-95.4"}
LA = {"city": "Los Angeles", "state": "CA"}


def raw():
    return json.loads(FIX.read_text())


def test_observations_match_contract_and_missing_is_unknown():
    obs = adapter.observations(HOU, raw())
    assert len(obs) == 13  # 4 roles x 3 datatypes + 1 CES series
    schema = json.loads((pathlib.Path(__file__).parents[4] / "contracts" / "factor-card.schema.json").read_text())
    for o in obs:
        assert set(o) == REQUIRED == set(schema["required"])
        assert o["status"] in schema["properties"]["status"]["enum"]
        assert all(isinstance(v, str) and v for v in o.values())
    by = {o["recordId"]: o for o in obs}
    assert by["OEUM002642000000035302303"]["value"] == "13.29" and by["OEUM002642000000035302303"]["asOf"] == "2025-05"
    assert by["SMU48264207072200001"]["asOf"].startswith("2026-")
    # series absent from raw -> unknown, never zero
    assert by["OEUM002642000000035201403"]["status"] == "unknown"
    assert by["OEUM002642000000035201403"]["value"] == "unknown"


def test_null_marker_is_dropped_from_series():
    ts = adapter.timeseries(raw(), "SMU48264207072200001")
    assert len(ts) == 2 and all(v is not None for _, _, v in ts)


def test_unmapped_site_is_unknown():
    obs = adapter.observations({"city": "Austin", "state": "TX"}, adapter.fetch({"city": "Austin", "state": "TX"}))
    assert len(obs) == 1 and obs[0]["status"] == "unknown"


def test_series_ids_la():
    oews, ces = adapter.series_ids(adapter.metro_for(LA))
    assert ces == ["SMU06310807072200001"] and "OEUM003108000000035302303" in oews and len(oews) == 12


def test_fetch_caches_and_merges(tmp_path):
    calls = []

    def post(ids, start, end):
        calls.append((len(ids), start, end))
        return {"Results": {"series": [{"seriesID": ids[0], "data": [
            {"year": str(start), "period": "M01", "value": "1.5"}]}]}}

    r1 = adapter.fetch(HOU, cache_dir=tmp_path, post=post)
    n = len(calls)
    r2 = adapter.fetch(HOU, cache_dir=tmp_path, post=post)
    assert n == len(adapter.OEWS_WINDOWS) + len(adapter.CES_WINDOWS) and len(calls) == n and r1 == r2
    assert len(r1["series"]["SMU48264207072200001"]) == len(adapter.CES_WINDOWS)


def test_post_retries_then_raises(monkeypatch):
    import urllib.request
    monkeypatch.setattr(adapter.time, "sleep", lambda s: None)
    monkeypatch.setattr(urllib.request, "urlopen", lambda *a, **k: (_ for _ in ()).throw(OSError("down")))
    try:
        adapter._post(["x"], 2020, 2021, retries=2)
    except RuntimeError as e:
        assert "2 attempts" in str(e)
    else:
        raise AssertionError
