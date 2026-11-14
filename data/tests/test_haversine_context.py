import collections

import pytest

import build_local_context as ctx

HOUSTON = (29.7600, -95.3700)


def north(miles):
    """Point `miles` due north of HOUSTON (1 degree latitude ~ 69.09 mi on the R=3958.8 sphere)."""
    return (HOUSTON[0] + miles / 69.0933, HOUSTON[1])


def test_miles_known_values():
    assert ctx.miles(HOUSTON, HOUSTON) == 0
    assert ctx.miles(HOUSTON, north(1.0)) == pytest.approx(1.0, abs=0.01)
    assert ctx.miles((0, 0), (0, 1)) == pytest.approx(69.09, abs=0.05)
    assert ctx.miles(HOUSTON, north(0.3)) == ctx.miles(north(0.3), HOUSTON)


def test_half_mile_boundary():
    near = collections.defaultdict(collections.Counter)
    ctx.count_nearby({"s": HOUSTON}, north(0.45), "13A", 1, near)
    ctx.count_nearby({"s": HOUSTON}, north(0.55), "13A", 1, near)
    assert near["s"]["incidents"] == 1


def test_offense_count_weighting_and_buckets():
    near = collections.defaultdict(collections.Counter)
    sites = {"s": HOUSTON}
    ctx.count_nearby(sites, north(0.1), "13A", 3, near)   # violent, weight 3
    ctx.count_nearby(sites, north(0.1), "23H", 2, near)   # property, weight 2
    ctx.count_nearby(sites, north(0.1), "90Z", 1, near)   # unclassified: only totals
    c = near["s"]
    assert (c["incidents"], c["geocoded_incidents"], c["violent"], c["property"]) == (6, 6, 3, 2)


def test_each_site_counted_independently_and_far_site_gets_no_counter():
    near = collections.defaultdict(collections.Counter)
    sites = {"a": HOUSTON, "b": north(0.8), "far": north(5)}
    ctx.count_nearby(sites, north(0.4), "13A", 1, near)
    assert near["a"]["incidents"] == 1 and near["b"]["incidents"] == 1
    assert "far" not in near


def test_peers_within_one_mile_excludes_self_and_unlocated():
    props = [{"id": "a", "lat": HOUSTON[0], "lon": HOUSTON[1]},
             {"id": "b", "lat": north(0.9)[0], "lon": HOUSTON[1]},
             {"id": "c", "lat": north(1.1)[0], "lon": HOUSTON[1]}]
    assert [p["id"] for p in ctx.peers_within(HOUSTON, "a", props)] == ["b"]
    assert ctx.peers_within(None, "a", props) == []


def test_zero_vs_unknown_incident_counts():
    near = collections.defaultdict(collections.Counter)
    # police data loaded, located Houston site, no incidents nearby: real zero
    assert ctx.site_count(near, {"s": HOUSTON}, True, "s")["incidents"] == 0
    # police file missing, or site not located: unknown (blank), never zero
    assert ctx.site_count(near, {"s": HOUSTON}, False, "s") == {}
    assert ctx.site_count(near, {}, True, "s") == {}
