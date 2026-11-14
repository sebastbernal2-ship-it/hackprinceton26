import csv
import json

from conftest import FIXTURES, jsonl
import build_site_candidates as bsc

ENUMS = json.loads((FIXTURES / "enums.json").read_text())
TYPES = ENUMS["PropertyType"]
INCLUDE = {"GeneralRetail", "MixedUse"}


def models():
    with (FIXTURES / "starter.csv").open(newline="") as f:
        return bsc.models_by_property_from_rows(csv.DictReader(f))


def test_blank_model_ids_are_not_joined():
    m = models()
    assert m == {"9001": {"mA", "mB"}, "9003": {"mC"}}
    assert "9002" not in m


def test_accessible_requires_200_and_result_and_skips_bad_lines():
    acc = bsc.accessible_models((FIXTURES / "access.txt").read_text().splitlines())
    assert acc == {"mA"}  # mB: 200 but no result; mC: 404


def test_candidate_rows_join_and_filter():
    m = models()
    acc = {"mA"}
    rows = [bsc.candidate_row(p, TYPES, INCLUDE, m, acc) for p in jsonl("properties.jsonl")]
    assert [r is not None for r in rows] == [True, True, False, False]
    r = rows[0]
    assert r["address"] == "100 Example St"
    assert (r["matched_model_count"], r["accessible_model_count"]) == (2, 1)
    assert r["retail_gla_sqft"] == 4000 and r["has_sprinklers"] is True
    # No models linked: zero counts, not missing; absent fields stay None (unknown), not 0.
    r2 = rows[1]
    assert (r2["matched_model_count"], r2["accessible_model_count"]) == (0, 0)
    assert r2["gross_building_area_sqft"] is None and r2["has_sprinklers"] is None
    assert set(r) == set(bsc.FIELDS)


def test_unknown_property_type_is_excluded_not_guessed():
    assert bsc.candidate_row({"id": 1, "propertyType": 99}, TYPES, INCLUDE, {}, set()) is None
