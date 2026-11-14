import importlib.util, json, pathlib
import pytest

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("nh_adapter", HERE.parents[2] / "factors/natural_hazards/adapter.py")
nh = importlib.util.module_from_spec(spec); spec.loader.exec_module(nh)

SITE = {"property_id": "1", "city": "Houston", "state": "TX", "latitude": "29.7604", "longitude": "-95.3698"}
REQUIRED = ["factorId", "status", "value", "unit", "source", "recordId", "asOf", "geography", "limitations"]
SCHEMA = json.loads((HERE.parents[3] / "contracts/factor-card.schema.json").read_text())


def fx(name):
    return json.loads((HERE / "fixtures" / name).read_text())


def raw(name):
    return {"retrieved": "2026-01-01", "response": fx(name)}


def test_required_fields_match_schema():
    assert sorted(REQUIRED) == sorted(SCHEMA["required"])
    for n in ["nfhl_zone_ae.json", "nfhl_zone_x.json", "nfhl_empty.json"]:
        for o in nh.observations(SITE, raw(n)):
            assert set(REQUIRED) <= set(o) and all(isinstance(o[k], str) for k in REQUIRED)
            assert o["status"] in SCHEMA["properties"]["status"]["enum"]


def test_sfha_zone_observed_without_bfe_sentinel():
    [o] = nh.observations(SITE, raw("nfhl_zone_ae.json"))
    assert o["status"] == "observed" and o["value"].startswith("AE (FLOODWAY)")
    assert "special flood hazard area: yes" in o["value"] and "BFE" not in o["value"]
    assert o["recordId"] == "48201C/48201C_999" and o["asOf"] == "2026-01-01"


def test_minimal_hazard_is_observed_not_safe():
    [o] = nh.observations(SITE, raw("nfhl_zone_x.json"))
    assert o["status"] == "observed" and "special flood hazard area: no" in o["value"]
    assert "not a safety" in o["limitations"]


def test_no_polygon_is_unknown_with_empty_value():
    [o] = nh.observations(SITE, raw("nfhl_empty.json"))
    assert o["status"] == "unknown" and o["value"] == "" and "not evidence of no hazard" in o["limitations"]


class Resp:
    def __init__(self, body): self.b = body
    def __enter__(self): return self
    def __exit__(self, *a): pass
    def read(self): return self.b


def test_fetch_retries_then_caches(tmp_path):
    calls = []
    def opener(req, timeout):
        calls.append(timeout)
        if len(calls) < 3:
            raise OSError("boom")
        return Resp(json.dumps(fx("nfhl_zone_x.json")).encode())
    r = nh.fetch(SITE, cache_dir=tmp_path, opener=opener, sleep=lambda s: None)
    assert len(calls) == 3 and r["response"]["features"]
    nh.fetch(SITE, cache_dir=tmp_path, opener=lambda *a, **k: pytest.fail("cache miss"))


def test_fetch_failure_and_service_error_raise(tmp_path):
    with pytest.raises(RuntimeError):
        nh.fetch(SITE, cache_dir=tmp_path, retries=2, sleep=lambda s: None, opener=lambda r, timeout: Resp(b'{"error":{"code":500}}'))
