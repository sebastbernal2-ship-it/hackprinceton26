import json

import pytest

from app import streams
from app.readiness import evidence_readiness


@pytest.fixture
def held(tmp_path, monkeypatch):
    for k, n in (("STRUCTURE_DIR", "s"), ("LINEAGE_DIR", "l"), ("TRIAGE_DERIVED_DIR", "t"), ("AERIAL_DIR", "a")):
        (tmp_path / n).mkdir()
        monkeypatch.setenv(k, str(tmp_path / n))
    (tmp_path / "s/properties.json").write_text(json.dumps({"7": {"yearBuilt": 1990, "material": "Masonry", "stories": 2,
                                                                  "usgs": {"sdc": "B"}, "fema": {"zone": "X"}}}))
    (tmp_path / "s/climate_fetch.json").write_text(json.dumps({"retrieved": "2026-11-14"}))
    (tmp_path / "l/lineage.json").write_text(json.dumps({"7": {"tenants": [{}, {}]}}))
    (tmp_path / "t/results.json").write_text(json.dumps([{"listingId": "7", "fields": [{"status": "confirmed"}, {"status": "unknown"}]}]))
    (tmp_path / "a/7.json").write_text(json.dumps({"imagery": {"source": "Vexcel", "fetched": "2026-11-14"}}))
    return tmp_path


def test_all_streams_present(held):
    c = {x.factorId: x for x in streams.stream_cards(7)}
    assert set(c) == {"building_kit", "natural_hazards", "restaurant_lineage", "record_triage", "aerial_site", "climate_weather"}
    assert all(x.status in ("observed", "derived") for x in c.values())
    assert evidence_readiness(list(c.values())) == 100


def test_gaps_are_labelled_estimated_demo(held):
    c = {x.factorId: x for x in streams.stream_cards(99)}
    assert set(c) == {"aerial_site", "climate_weather"}
    assert all(x.status == "estimated" and "ESTIMATED DEMO" in x.limitations for x in c.values())
    assert evidence_readiness(list(c.values())) == 0


def test_merge_replaces_unknown_placeholders_only(held):
    from app.models import FactorCard
    mk = lambda fid, st: FactorCard(factorId=fid, status=st, value="", unit="", source="", recordId="", asOf="", geography="", limitations="")
    out = streams.merge(7, [mk("aerial_site", "unknown"), mk("climate_weather", "observed"), mk("crime_safety", "unknown")])
    by = {}
    for x in out:
        by.setdefault(x.factorId, []).append(x.status)
    assert by["aerial_site"] == ["observed"] and by["climate_weather"] == ["observed"] and by["crime_safety"] == ["unknown"]
