from datetime import date

import pytest

from forecasting.peers import neighbourhood as N

SITE = {"lat": 29.7, "lon": -95.5, "market": "Houston", "concept": "cafe"}
M = 1 / 69.0  # one mile of latitude in degrees (approx)


def food(i, miles, kind="cafe_coffee", etype=0, years=4.0, bearing_north=True):
    return {"id": f"P-{i}", "propertyId": i, "lat": 29.7 + miles * M, "lon": -95.5, "market": "Houston", "kind": kind, "etype": etype, "years": years,
            "start": date(2020, 1, 1), "end": None, "demo": False}


def other(i, miles, industry=6, years=5.0, etype=0, employees=20):
    return {"id": f"B-{i}", "propertyId": 500 + i, "lat": 29.7 + miles * M, "lon": -95.5, "market": "Houston", "industry": industry, "etype": etype,
            "years": years, "employees": employees}


STREET = [other(i, 0.1 + 0.05 * i) for i in range(8)]  # eight successful retailers within half a mile


def test_penalty_decays_with_distance_and_region_is_free():
    k = N.CONFIG["penalty_knots_m"]
    assert N.interp(k, 0) == 1.0 and N.interp(k, 150) == 1.0
    assert N.interp(k, 300) < 1.0 and N.interp(k, 600) < N.interp(k, 300)
    assert N.interp(k, 805 * 2) == 0.0 and N.interp(k, 4000) == 0.0  # beyond 1 mile: no penalty


def test_adjacent_direct_competitor_is_flagged_and_penalised_region_one_is_not():
    adj = N.score(SITE, [food(1, 0.0)], STREET)           # same building / next door
    far = N.score(SITE, [food(1, 2.0)], STREET)           # two miles away: the region
    assert adj["adjacentCompetitor"] is True and far["adjacentCompetitor"] is False
    assert any(w["code"] == "adjacent_competitor" for w in adj["warnings"]) and not far["warnings"] or all(w["code"] != "adjacent_competitor" for w in far["warnings"])
    assert adj["components"]["competitionPressure"] > 0.5 and far["components"]["competitionPressure"] == 0.0
    assert adj["index"] < far["index"] - 10
    none = N.score(SITE, [], STREET)
    assert far["index"] >= none["index"]  # a surviving competitor in the region adds validation, never subtracts


def test_region_competitor_validates_only_when_it_has_survived():
    old = N.score(SITE, [food(1, 1.5, years=5)], STREET)
    young = N.score(SITE, [food(1, 1.5, years=0.5)], STREET)
    assert old["components"]["validation"] > young["components"]["validation"] == 0.0
    assert any(d["name"].startswith("Market validation") and d["points"] > 0 for d in old["drivers"])


def test_closed_competitor_does_not_compete_and_complement_is_not_a_competitor():
    closed = N.score(SITE, [food(1, 0.0, etype=1, years=1.0)], STREET)
    bar = N.score(SITE, [food(1, 0.0, kind="bar")], STREET)
    assert closed["adjacentCompetitor"] is False and bar["adjacentCompetitor"] is False
    assert bar["components"]["competitionPressure"] == 0.0


def test_partial_substitute_counts_at_half():
    d = N.score(SITE, [food(1, 0.0, kind="cafe_coffee")], STREET)["components"]["competitionPressure"]
    p = N.score(SITE, [food(1, 0.0, kind="dessert_drink")], STREET)["components"]["competitionPressure"]
    assert 0 < p < d


def test_agglomeration_rewards_successful_non_competing_neighbours():
    rich = N.score(SITE, [], STREET)
    poor = N.score(SITE, [], STREET[:1])
    failed = N.score(SITE, [], [other(i, 0.1 + 0.05 * i, etype=1, years=0.8) for i in range(8)])
    assert rich["components"]["agglomeration"] > poor["components"]["agglomeration"] > failed["components"]["agglomeration"]
    assert rich["bands"]["0.5mi"]["successfulNonCompeting"] == 8


def test_unknown_is_not_negative_index_none_without_coverage():
    r = N.score(SITE, [food(1, 2.5)], [])  # nothing within 1 mile in the kit
    assert r["index"] is None and r["adjacentCompetitor"] is False
    assert any(w["code"] == "thin_coverage" for w in r["warnings"])


def test_drivers_sum_to_the_index_above_neutral():
    r = N.score(SITE, [food(1, 0.0), food(2, 1.5, years=6)], STREET)
    assert r["index"] == pytest.approx(50 + sum(d["points"] for d in r["drivers"]), abs=0.5)


def test_other_market_is_ignored():
    f = food(1, 0.0)
    f["market"] = "Los Angeles"
    assert N.score(SITE, [f], STREET)["adjacentCompetitor"] is False


def test_sensitivity_and_config_view():
    s = N.sensitivity(SITE, [food(1, 0.3)], STREET)
    assert len(s["variants"]) >= 6 and s["range"][0] <= s["base"] <= s["range"][1] or s["range"][0] <= s["range"][1]
    assert N.score(SITE, [food(1, 0.3)], STREET)["config"]["adjacent_m"] == 150.0
    # moving the adjacency threshold from 150 m to 600 m flips the warning for a competitor 0.2 mi (322 m) away
    base = N.score(SITE, [food(1, 0.2)], STREET)
    wide = N.score(SITE, [food(1, 0.2)], STREET, {**N.CONFIG, "adjacent_m": 600.0})
    assert base["adjacentCompetitor"] is False and wide["adjacentCompetitor"] is True


def test_adjacency_check_and_wilson():
    lo, hi = N.wilson(5, 20)
    assert 0.1 < lo < 0.25 < hi < 0.5
    a = {**food(1, 0.0, years=3.0), "start": date(2018, 1, 1), "end": None}
    b = {**food(2, 0.0, etype=1, years=1.0), "start": date(2019, 1, 1), "end": date(2020, 1, 1)}  # started next to an open same-kind peer, closed in 1 y
    c = {**food(3, 2.0, years=4.0), "start": date(2019, 1, 1), "end": None}
    r = N.adjacency_check([a, b, c])
    assert r["withAdjacentSameKind"]["n"] == 1 and r["withAdjacentSameKind"]["closed2y"] == 1
