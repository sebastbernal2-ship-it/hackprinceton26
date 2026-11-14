import io, json, pathlib
from datetime import date, timedelta
import pytest
from factors.climate_weather import adapter

SITE = {"latitude": "29.734985", "longitude": "-95.426833"}
SCHEMA = json.loads((adapter.ROOT / "contracts/factor-card.schema.json").read_text())


def synthetic(skip_temp=False):
    days = [date(2023, 1, 1) + timedelta(i) for i in range((date(2025, 12, 31) - date(2023, 1, 1)).days + 1)]
    t = [d.isoformat() for d in days]
    return {"latitude": 29.70123, "longitude": -95.42923, "_request": {"lat": 29.7349, "lon": -95.4268, "retrieved": "2026-11-14"},
            "daily": {"time": t,
                      "temperature_2m_mean": [None if skip_temp else 20.0] * len(t),
                      "temperature_2m_max": [36.0 if d.month == 7 and d.day <= 10 else 25.0 for d in days],
                      "temperature_2m_min": [-1.0 if d.month == 1 and d.day <= 3 else 10.0 for d in days],
                      "precipitation_sum": [1.0] * len(t)}}


def test_cards_match_schema_and_values():
    cards = adapter.observations(SITE, synthetic())
    assert len(cards) == 7
    by = {c["recordId"].split(":")[1]: c for c in cards}
    for c in cards:
        assert set(c) == set(SCHEMA["required"])
        assert c["status"] in SCHEMA["properties"]["status"]["enum"]
        assert all(isinstance(v, str) for v in c.values())
        assert "forecast" in c["limitations"]
    assert by["annual_mean_temp"]["value"] == "20.0" and by["annual_mean_temp"]["status"] == "estimated"
    assert by["annual_precip"]["value"] == "365"
    assert by["hot_days_per_year"]["value"] == "10.0"
    assert by["freeze_days_per_year"]["value"] == "3.0"
    assert len(json.loads(by["monthly_precip"]["value"])) == 12
    assert json.loads(by["monthly_precip"]["value"])[0] == 31.0
    assert 3 < float(by["grid_cell_distance"]["value"]) < 5


def test_missing_is_unknown_not_zero():
    cards = adapter.observations(SITE, synthetic(skip_temp=True))
    by = {c["recordId"].split(":")[1]: c for c in cards}
    assert by["annual_mean_temp"]["status"] == "unknown" and by["annual_mean_temp"]["value"] == ""
    assert by["annual_precip"]["status"] == "estimated"
    none = adapter.observations(SITE, None)
    assert all(c["status"] == "unknown" and c["value"] == "" for c in none)


class Resp(io.BytesIO):
    __enter__ = lambda s: s
    def __exit__(s, *a): pass


def test_fetch_retries_then_caches(tmp_path):
    calls = []
    def opener(url, timeout):
        calls.append(timeout)
        if len(calls) < 3:
            raise OSError("boom")
        return Resp(json.dumps(synthetic()).encode())
    raw = adapter.fetch(SITE, cache_dir=tmp_path, opener=opener, sleep=lambda s: None)
    assert len(calls) == 3 and "daily" in raw
    adapter.fetch(SITE, cache_dir=tmp_path, opener=lambda *a, **k: 1 / 0)  # served from cache


def test_fetch_failure_raises(tmp_path):
    def opener(url, timeout):
        raise OSError("down")
    with pytest.raises(RuntimeError):
        adapter.fetch(SITE, cache_dir=tmp_path, opener=opener, sleep=lambda s: None)
