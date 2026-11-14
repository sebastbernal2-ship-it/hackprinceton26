import json

from conftest import FIXTURES, jsonl
from build_diligence_scores import has_active_listing_status
from enrich_site_candidates import active_lease_spaces

code_to_label = {"1": "Active", "2": "OffMarket"}
label_to_code = {"Active": "1", "OffMarket": "2"}


def test_status_codes_and_labels_normalize():
    assert has_active_listing_status("Active;OffMarket", code_to_label)
    assert has_active_listing_status("1;2", code_to_label)
    assert has_active_listing_status("1;2", label_to_code)
    assert has_active_listing_status("ACTIVE", {})


def test_offmarket_empty_and_unknown_are_not_active():
    assert not has_active_listing_status("OffMarket;Unknown", code_to_label)
    assert not has_active_listing_status("", code_to_label)
    assert not has_active_listing_status(None, code_to_label)


def test_active_lease_spaces_only_active_nonpending_same_property():
    statuses = json.loads((FIXTURES / "enums.json").read_text())["ListingStatus"]
    ls = [x for x in jsonl("listings.jsonl") if x["propertyId"] == 9001]
    mins, maxima = active_lease_spaces(ls, statuses, "9001")
    # Excluded: pending space, space of another property (9999), the OffMarket listing.
    # The space with no propertyId and no min counts only toward the max (600).
    assert mins == [1500]
    assert maxima == [2000, 600]


def test_unknown_status_code_is_never_active():
    statuses = json.loads((FIXTURES / "enums.json").read_text())["ListingStatus"]
    ls = [x for x in jsonl("listings.jsonl") if x["propertyId"] == 9002]
    assert active_lease_spaces(ls, statuses, "9002") == ([], [])
