import csv

from conftest import FIXTURES
import build_factor_cards as bfc

STATUSES = {"observed", "derived", "estimated", "unknown"}


def cards():
    with (FIXTURES / "factors.csv").open(newline="") as f:
        factors = list(csv.DictReader(f))
    sites = [{"property_id": "S1", "city": "Houston"}, {"property_id": "S2", "city": "Los Angeles"},
             {"property_id": "S3", "city": "Houston"}]
    evidence = {"S1": {"listing_statuses": "Active;OffMarket", "evidence_as_of": "2026-05-01"}}
    operator = {"S1": {"matterport_model_ids": "mA;mB", "evidence_as_of": "2026-05-02"}}
    context = {"S1": {"reported_incidents_0_5mi": "7", "crime_source_date_start": "2026-01-01",
                      "crime_source_date_end": "2026-06-30"},
               "S3": {"reported_incidents_0_5mi": "0"}}
    return bfc.build_cards(factors, sites, evidence, operator, context)


def pick(rows, pid, fid):
    return next(r for r in rows if r["property_id"] == pid and r["factor_id"] == fid)


def test_one_unique_card_per_site_and_factor():
    rows = cards()
    assert len(rows) == 3 * 15
    assert len({(r["site_id"], r["factor_id"]) for r in rows}) == len(rows)
    assert all(r["status"] in STATUSES for r in rows)


def test_unknown_cards_have_no_value_and_a_reason():
    for r in cards():
        if r["status"] == "unknown":
            assert r["value"] == "" and r["unknown_reason"]
        else:
            assert r["unknown_reason"] == ""


def test_missing_evidence_is_unknown_not_negative():
    rows = cards()
    assert pick(rows, "S2", "property_market")["status"] == "unknown"
    assert pick(rows, "S2", "spatial_interior")["status"] == "unknown"
    assert pick(rows, "S2", "crime_safety")["status"] == "unknown"
    assert pick(rows, "S2", "crime_safety")["value"] == ""


def test_observed_cards_carry_value_and_source_date():
    rows = cards()
    m = pick(rows, "S1", "property_market")
    assert (m["status"], m["value"], m["retrieved_or_observed_date"]) == ("observed", "Active;OffMarket", "2026-05-01")
    assert "no current availability claim" in m["uncertainty"].lower()
    s = pick(rows, "S1", "spatial_interior")
    assert s["status"] == "observed" and "suite identity unresolved" in s["geography"].lower()
    assert "does not verify marketed suite identity" in s["uncertainty"].lower()


def test_crime_zero_is_observed_zero_and_window_requires_both_dates():
    rows = cards()
    c1 = pick(rows, "S1", "crime_safety")
    assert (c1["status"], c1["value"], c1["time_window"]) == ("observed", "7", "2026-01-01 to 2026-06-30")
    c3 = pick(rows, "S3", "crime_safety")
    assert (c3["status"], c3["value"], c3["time_window"]) == ("observed", "0", "")


def test_operator_preferences_and_other_factors_always_unknown():
    for r in cards():
        if r["factor_id"] != "property_market" and r["factor_id"] not in {"spatial_interior", "crime_safety"}:
            assert r["status"] == "unknown"
    assert pick(cards(), "S1", "schools_education")["unknown_reason"] == "Blocked on source"


def test_helpers():
    assert bfc.evidence_as_of({"evidence_as_of": "2026-05-01", "source_as_of_date": "2026-06-01"}) == "2026-05-01"
    assert bfc.evidence_as_of({"source_as_of_date": "2026-06-01"}) == ""
    assert bfc.crime_time_window({"crime_source_date_start": "2026-01-01"}) == ""
