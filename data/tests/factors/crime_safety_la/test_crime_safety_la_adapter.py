import json
import pathlib
import sys
import urllib.error

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[3] / "factors" / "crime_safety_la"))
from factors.crime_safety_la import adapter  # noqa: E402

HERE = pathlib.Path(__file__).resolve().parent
ROWS = json.loads((HERE / "fixture_rows.json").read_text())
SCHEMA = json.loads((HERE.parents[3] / "contracts/factor-card.schema.json").read_text())
LA = {"property_id": "p1", "city": "Los Angeles", "latitude": "34.0500", "longitude": "-118.2500"}
HOU = {"property_id": "p2", "city": "Houston", "latitude": "29.76", "longitude": "-95.37"}


def check_card(card):
    assert set(card) == set(SCHEMA["required"])
    assert card["status"] in SCHEMA["properties"]["status"]["enum"]
    assert all(isinstance(v, str) for v in card.values())


def test_count_site_radius_zero_coords_and_missing_count():
    c = adapter.count_site((34.05, -118.25), ROWS)
    # in radius: 13A x2, 23C x1, 90Z x1, 23C with blank count -> 1. 34.07 (~1.4 mi) and 0,0 excluded.
    assert c == {"incidents": 5, "violent": 2, "property": 2}


def test_observations_cards_match_schema_and_are_derived_counts():
    cards = adapter.observations(LA, {"rows": ROWS, "reason": ""})
    assert [c["unit"].split(" (")[0] for c in cards] == [
        "all NIBRS offenses", "violent-classified offenses", "property-classified offenses"]
    assert [c["value"] for c in cards] == ["5", "2", "2"]
    for c in cards:
        check_card(c)
        assert c["status"] == "derived" and c["asOf"] == "2026-01-01/2026-06-30"
        assert "not a rate" in c["limitations"] and "safety score" in c["limitations"]


def test_no_incidents_is_a_real_zero_but_missing_is_unknown():
    zero = adapter.observations(LA, {"rows": [], "reason": ""})
    assert [c["value"] for c in zero] == ["0", "0", "0"]
    unk = adapter.observations(HOU, adapter.fetch(HOU))
    assert len(unk) == 1 and unk[0]["status"] == "unknown" and unk[0]["value"] == ""
    check_card(unk[0])
    nocoord = adapter.observations({**LA, "latitude": ""}, adapter.fetch({**LA, "latitude": ""}))
    assert nocoord[0]["status"] == "unknown"


def test_where_bounds_are_numerically_ascending():
    w = adapter._where(34.0254, -118.3324)
    assert "hndrdth_lon > '-118.3444' AND hndrdth_lon < '-118.3204'" in w
    assert "hndrdth_lat > '34.0134' AND hndrdth_lat < '34.0374'" in w


class Resp:
    def __init__(self, body):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def read(self):
        return json.dumps(self.body).encode()


def test_fetch_retries_then_caches(tmp_path):
    calls = []

    def opener(req, timeout):
        calls.append(timeout)
        if len(calls) < 3:
            raise urllib.error.URLError("boom")
        return Resp(ROWS)

    raw = adapter.fetch(LA, cache_dir=tmp_path, opener=opener, sleep=lambda s: None)
    assert raw["rows"] == ROWS and len(calls) == 3 and set(calls) == {adapter.TIMEOUT}
    again = adapter.fetch(LA, cache_dir=tmp_path, opener=lambda *a, **k: pytest.fail("cache miss"))
    assert again["rows"] == ROWS


def test_fetch_gives_up_loudly(tmp_path):
    def opener(req, timeout):
        raise TimeoutError("slow")

    with pytest.raises(RuntimeError):
        adapter.fetch(LA, cache_dir=tmp_path, opener=opener, sleep=lambda s: None)


def test_city_monthly_parses_both_series(tmp_path):
    pages = iter([[{"y": "2025", "m": "1", "nibr_code": "13A", "n": "10"}],
                  [{"y": "2024", "m": "12", "n": "7"}]])
    rows = adapter.fetch_city_monthly(cache_dir=tmp_path, opener=lambda r, timeout: Resp(next(pages)),
                                      sleep=lambda s: None)
    assert rows == [
        {"series": "nibrs_offenses", "year": 2025, "month": 1, "code": "13A", "incidents": 10},
        {"series": "legacy_ucr_incidents", "year": 2024, "month": 12, "code": "", "incidents": 7}]
