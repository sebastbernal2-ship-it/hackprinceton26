import importlib.util
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "income_adapter", HERE.parents[2] / "factors" / "income_demographics" / "adapter.py")
ad = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ad)
SCHEMA = json.loads((HERE.parents[3] / "contracts" / "factor-card.schema.json").read_text())
HEAD = ["NAME", "B19013_001E", "B19013_001M", "B01003_001E", "B01003_001M", "B01002_001E", "B01002_001M",
        "state", "county", "tract"]
ROWS = [HEAD,
        ["Census Tract 1; Harris County; Texas", "67344", "11901", "5359", "665", "42.6", "5.7", "48", "201", "000100"],
        ["Census Tract 2; Harris County; Texas", "-666666666", "-222222222", "0", "12", "-666666666", "-222222222", "48", "201", "000200"],
        ["Census Tract 3; Los Angeles County; California", "250001", "-333333333", "3094", "452", "51.4", "3.2", "06", "037", "000300"]]
SITE = {"property_id": "S1", "latitude": "29.7", "longitude": "-95.4"}


def acs_dir(tmp_path):
    for st in ("48", "06"):
        rows = [ROWS[0]] + [r for r in ROWS[1:] if r[7] == st]
        (tmp_path / ("acs5_2023_tracts_state%s.json" % st)).write_text(json.dumps(rows))
    return tmp_path


def raw_for(geoid, tmp_path):
    idx = ad.load_acs(geoid[:2], acs_dir(tmp_path))
    return {"tract": {"geoid": geoid}, "acs": idx.get(geoid)}


def check_schema(obs):
    for o in obs:
        assert set(o) == set(SCHEMA["required"])
        assert all(isinstance(v, str) for v in o.values())
        assert o["status"] in SCHEMA["properties"]["status"]["enum"]
        assert o["factorId"] == "income_demographics"


def test_normal_row_has_margins(tmp_path):
    obs = ad.observations(SITE, raw_for("48201000100", tmp_path))
    check_schema(obs)
    assert [o["status"] for o in obs] == ["estimated"] * 3
    assert obs[0]["value"] == "67344 (90% margin of error +/-11901)"
    assert obs[2]["value"].startswith("42.6")


def test_sentinels_are_unknown_not_zero(tmp_path):
    obs = ad.observations(SITE, raw_for("48201000200", tmp_path))
    check_schema(obs)
    assert [o["status"] for o in obs] == ["unknown", "estimated", "unknown"]
    assert obs[0]["value"] == ""
    assert obs[1]["value"].startswith("0 ")  # genuine zero estimate stays observed-as-estimate


def test_topcode_and_missing_moe(tmp_path):
    obs = ad.observations(SITE, raw_for("06037000300", tmp_path))
    assert obs[0]["status"] == "estimated" and "Top-coded" in obs[0]["limitations"]
    assert "Margin of error not available" in obs[0]["limitations"]


def test_unmatched_and_geocoder_failure(tmp_path):
    check_schema(ad.observations(SITE, {"tract": {"error": "geocoder failed: URLError"}, "acs": None}))
    obs = ad.observations(SITE, raw_for("48201999999", tmp_path))
    assert {o["status"] for o in obs} == {"unknown"}
    assert "not in local ACS" in obs[0]["limitations"]


def test_fetch_uses_cache_without_network(tmp_path, monkeypatch):
    cache = tmp_path / "cache"
    cache.mkdir()
    (cache / ad._cache_path(SITE).name).write_text(json.dumps({"geoid": "48201000100", "name": "x"}))
    monkeypatch.setattr(ad, "_http_json", lambda u: (_ for _ in ()).throw(AssertionError("network")))
    raw = ad.fetch(SITE, cache_dir=cache, acs_dir=acs_dir(tmp_path))
    assert raw["acs"]["B19013_001E"] == "67344"


def test_geocoder_parse_and_failure(tmp_path, monkeypatch):
    resp = json.loads((HERE / "fixtures" / "geocoder_response.json").read_text())
    monkeypatch.setattr(ad, "_http_json", lambda u: resp)
    assert ad.geocode_tract(SITE, tmp_path)["geoid"] == "48201411503"
    assert list(tmp_path.glob("*.json"))
    def boom(u):
        raise OSError("down")
    monkeypatch.setattr(ad, "_http_json", boom)
    s2 = {"latitude": "1", "longitude": "2"}
    assert "error" in ad.geocode_tract(s2, tmp_path)
