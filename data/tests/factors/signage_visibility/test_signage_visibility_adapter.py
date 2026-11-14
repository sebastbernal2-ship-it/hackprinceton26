import json
import pathlib
import urllib.error

import pytest

from factors.signage_visibility import adapter as A

REQUIRED = {"factorId", "status", "value", "unit", "source", "recordId", "asOf", "geography", "limitations"}
STATUS = {"observed", "derived", "estimated", "unknown"}


def seg(ft, primary=False, dist=None):
    return {"streetName": "X St", "frontageInFeet": ft, "isPrimaryFrontage": primary,
            "footprint": {"distanceFeet": dist} if dist is not None else None}


@pytest.fixture
def costar(tmp_path):
    recs = [
        {"id": 1, "propertyRetail": {"frontage": [seg(120.0, True), seg(40.0)]}},   # LA primary
        {"id": 2, "propertyRetail": {"frontage": [seg(30.0)]}},                    # LA short single
        {"id": 3, "propertyRetail": {"frontage": [seg(50.0), seg(60.0)]}},         # ambiguous
        {"id": 4, "propertyRetail": {"frontage": []}},                             # empty
        {"id": 5, "propertyRetail": {"frontage": [seg(None, True, dist=77)]}},     # fallback field
        {"id": 6, "propertyRetail": None},
    ]
    p = tmp_path / "cp.jsonl"
    p.write_text("\n".join(json.dumps(r) for r in recs))
    return p


def site(pid, city="Los Angeles", state="CA"):
    return {"property_id": str(pid), "city": city, "state": state, "latitude": "34.0", "longitude": "-118.2"}


def ok_get(url, timeout):
    return 200, "application/pdf", b"%PDF"


def run(pid, costar, tmp_path, city="Los Angeles", get=ok_get):
    s = site(pid, city, "CA" if city == "Los Angeles" else "TX")
    raw = A.fetch(s, costar_path=costar, cache_dir=tmp_path / "c", http_get=get)
    return s, raw, A.observations(s, raw)


def by_unit(obs, unit):
    return [o for o in obs if o["unit"].startswith(unit)][0]


def test_schema_shape_all_cases(costar, tmp_path):
    for pid in (1, 2, 3, 4, 5, 6, 99):
        for city in ("Los Angeles", "Houston"):
            _, _, obs = run(pid, costar, tmp_path, city)
            assert obs
            for o in obs:
                assert set(o) == REQUIRED and o["status"] in STATUS
                assert all(isinstance(v, str) and v for v in o.values())
                if o["status"] == "unknown":
                    assert o["value"] == "unknown"


def test_la_derived_from_primary(costar, tmp_path):
    _, _, obs = run(1, costar, tmp_path)
    assert by_unit(obs, "ft")["value"] == "120" and by_unit(obs, "ft")["status"] == "observed"
    assert by_unit(obs, "sq ft combined")["value"] == "480"
    pe = by_unit(obs, "projecting")
    assert "ceiling 205 sq ft" in pe["value"]  # 25 + 1.5*120


def test_la_projecting_cap_300(costar, tmp_path):
    assert A.pick_frontage([seg(500.0, True)]) == (500.0, "primary-flagged segment (frontageInFeet)")
    s = site(1)
    obs = A.observations(s, {"costarRecordFound": True, "frontage": [seg(500.0, True)]})
    assert "ceiling 300 sq ft" in by_unit(obs, "projecting")["value"]


def test_la_short_frontage_not_eligible(costar, tmp_path):
    _, _, obs = run(2, costar, tmp_path)
    assert "not permitted" in by_unit(obs, "projecting")["value"]
    assert by_unit(obs, "sq ft combined")["value"] == "120"


def test_ambiguous_and_missing_are_unknown(costar, tmp_path):
    for pid in (3, 4, 6, 99):
        _, raw, obs = run(pid, costar, tmp_path)
        assert by_unit(obs, "ft")["status"] == "unknown"
        assert by_unit(obs, "sq ft")["status"] == "unknown"
    assert run(99, costar, tmp_path)[1]["costarRecordFound"] is False


def test_fallback_to_footprint_distance(costar, tmp_path):
    _, _, obs = run(5, costar, tmp_path)
    assert by_unit(obs, "ft")["value"] == "77"
    assert "footprint.distanceFeet" in by_unit(obs, "ft")["limitations"]


def test_houston_never_derives_area_from_frontage(costar, tmp_path):
    _, _, obs = run(1, costar, tmp_path, "Houston")
    assert by_unit(obs, "sq ft")["status"] == "unknown"
    assert not any(o["status"] == "derived" for o in obs)
    assert by_unit(obs, "sightline")["status"] == "unknown"


def test_unknown_city(costar, tmp_path):
    s = site(1, "Austin", "TX")
    raw = A.fetch(s, costar_path=costar, cache_dir=tmp_path / "c", http_get=ok_get)
    assert raw["sourceChecks"] == []
    assert any(o["unit"] == "sign rules" for o in A.observations(s, raw))


def test_source_check_cache_and_retry(costar, tmp_path, monkeypatch):
    calls = []

    def flaky(url, timeout):
        calls.append(url)
        if len(calls) == 1:
            raise urllib.error.URLError("boom")
        return 200, "text/html", b"x"

    s = site(1)
    monkeypatch.setattr(A.time, "sleep", lambda *_: None)
    raw = A.fetch(s, costar_path=costar, cache_dir=tmp_path / "c", http_get=flaky, now=1000.0)
    assert [c["status"] for c in raw["sourceChecks"]] == [200] * len(raw["sourceChecks"])
    n = len(calls)
    A.fetch(s, costar_path=costar, cache_dir=tmp_path / "c", http_get=flaky, now=1001.0)
    assert len(calls) == n  # served from cache
    A.fetch(s, costar_path=costar, cache_dir=tmp_path / "c", http_get=flaky, now=1000.0 + A.SOURCE_TTL_S + 1)
    assert len(calls) == n + len(raw["sourceChecks"])  # expired: each source refetched once


def test_http_403_recorded_not_retried(costar, tmp_path):
    calls = []

    def blocked(url, timeout):
        calls.append(1)
        raise urllib.error.HTTPError(url, 403, "Forbidden", {}, None)

    raw = A.fetch(site(1), costar_path=costar, cache_dir=tmp_path / "c", http_get=blocked)
    assert all(c["status"] == 403 for c in raw["sourceChecks"])
    assert len(calls) == len(raw["sourceChecks"])


def test_rules_json_cited():
    for city, c in A.RULES["cities"].items():
        assert c["primarySource"]["url"].startswith("https://")
        for r in c["rules"]:
            assert r["id"] and r["section"] and r["summary"]
