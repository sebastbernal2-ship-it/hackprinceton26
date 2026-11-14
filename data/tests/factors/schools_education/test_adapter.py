import json

from factors.schools_education import adapter

SITE = {"property_id": "T1", "state": "TX", "latitude": 29.76, "longitude": -95.37}
# ~0.5 mi north, ~0.5 mi east, ~2 mi north (outside), closed nearby, no coords
SCHOOLS = [
    {"ncessch": "a", "latitude": 29.7672, "longitude": -95.37, "school_status": 1},
    {"ncessch": "b", "latitude": 29.76, "longitude": -95.3625, "school_status": 3},
    {"ncessch": "c", "latitude": 29.789, "longitude": -95.37, "school_status": 1},
    {"ncessch": "d", "latitude": 29.7601, "longitude": -95.37, "school_status": 2},
    {"ncessch": "e", "latitude": None, "longitude": None, "school_status": 1},
]


def test_haversine_one_degree():
    assert abs(adapter.haversine_miles(0, 0, 1, 0) - 69.09) < 0.1


def test_observations_counts_open_within_radius():
    obs = adapter.observations(SITE, {"year": 2024, "state": "TX", "schools": SCHOOLS})
    assert obs[0]["value"] == "2" and obs[0]["status"] == "derived"
    assert float(obs[1]["value"]) < 0.6
    for o in obs:
        assert set(o) == {"factorId", "status", "value", "unit", "source", "recordId", "asOf", "geography", "limitations"}
        assert all(isinstance(v, str) for v in o.values())


def test_zero_nearby_is_zero_without_nearest():
    far = dict(SITE, latitude=40.0)
    obs = adapter.observations(far, {"year": 2024, "state": "TX", "schools": SCHOOLS})
    assert [o["value"] for o in obs] == ["0"]


def test_unknown_when_state_or_coords_missing():
    assert adapter.observations(dict(SITE, state="NY"), {"year": 2024, "state": "NY", "schools": None})[0]["status"] == "unknown"
    assert adapter.observations({"state": "TX"}, {"year": 2024, "state": "TX", "schools": []})[0]["status"] == "unknown"


def test_fetch_paginates_caches_and_trims(tmp_path):
    calls = []
    pages = {"u1": {"results": [dict(SCHOOLS[0], extra="x")], "next": "u2"}, "u2": {"results": [SCHOOLS[1]], "next": None}}

    def getter(url):
        calls.append(url)
        return pages["u2" if calls[1:] else "u1"]

    raw = adapter.fetch(SITE, cache_dir=tmp_path, getter=getter)
    assert len(raw["schools"]) == 2 and "extra" not in raw["schools"][0]
    again = adapter.fetch(SITE, cache_dir=tmp_path, getter=lambda u: 1 / 0)
    assert again == json.loads(json.dumps(raw))
    assert adapter.fetch(dict(SITE, state="NY"), cache_dir=tmp_path)["schools"] is None
