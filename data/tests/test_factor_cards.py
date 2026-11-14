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


def adapter_card(pid, status="derived", value="12", **kw):
    c = {"propertyId": pid, "factorId": "schools_education", "status": status, "value": value, "unit": "schools",
         "source": "synthetic", "recordId": "r1", "asOf": "2026-01-01", "geography": "1 mi", "limitations": "synthetic limits"}
    c.update(kw)
    return c


def build_with(obs):
    with (FIXTURES / "factors.csv").open(newline="") as f:
        factors = list(csv.DictReader(f))
    sites = [{"property_id": "S1", "city": "Houston"}, {"property_id": "S2", "city": "Los Angeles"}]
    return bfc.build_cards(factors, sites, {}, {}, {}, obs)


def test_adapter_observations_replace_unknown_only_for_their_site():
    rows = build_with({("S1", "schools_education"): [adapter_card("S1"), adapter_card("S1", value="0.4", recordId="r2")]})
    s1 = [r for r in rows if r["property_id"] == "S1" and r["factor_id"] == "schools_education"]
    assert [r["value"] for r in s1] == ["12", "0.4"] and all(r["status"] == "derived" and r["source"] == "synthetic" for r in s1)
    assert s1[0]["interpretation"] == "synthetic limits"
    s2 = pick(rows, "S2", "schools_education")
    assert s2["status"] == "unknown" and s2["value"] == "" and s2["unknown_reason"]


def test_adapter_unknown_stays_blank_and_has_reason():
    rows = build_with({("S1", "schools_education"): [adapter_card("S1", status="unknown", value="")]})
    r = pick(rows, "S1", "schools_education")
    assert r["status"] == "unknown" and r["value"] == "" and r["unknown_reason"]


def test_loader_ignores_missing_file_and_invalid_cards(tmp_path):
    import json
    with (FIXTURES / "factors.csv").open(newline="") as f:
        factors = list(csv.DictReader(f))
    assert bfc.load_adapter_observations(factors, tmp_path) == {}
    d = tmp_path / "schools_education"
    d.mkdir()
    good = adapter_card("S1")
    bad = [adapter_card("S1", status="maybe"), adapter_card("S1", status="unknown", value="0"),
           {k: v for k, v in adapter_card("S1").items() if k != "source"}, {**adapter_card("S1"), "propertyId": ""}]
    (d / "observations.json").write_text(json.dumps([good] + bad))
    assert bfc.load_adapter_observations(factors, tmp_path) == {("S1", "schools_education"): [good]}
    (d / "observations.json").write_text("not json")
    assert bfc.load_adapter_observations(factors, tmp_path) == {}


def test_crime_adapter_fills_only_when_no_houston_aggregate():
    c = adapter_card("S2", factorId="crime_safety_la")
    rows = build_with({("S2", "crime_safety"): [c]})
    assert pick(rows, "S2", "crime_safety")["value"] == "12"
    assert pick(rows, "S1", "crime_safety")["status"] == "unknown"
