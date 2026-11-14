"""Regression checks for source listing-status normalization."""
from build_diligence_scores import has_active_listing_status


code_to_label = {"1": "Active", "2": "OffMarket"}
label_to_code = {"Active": "1", "OffMarket": "2"}

assert has_active_listing_status("Active;OffMarket", code_to_label)
assert has_active_listing_status("1;2", code_to_label)
assert has_active_listing_status("1;2", label_to_code)
assert has_active_listing_status("ACTIVE", {})
assert not has_active_listing_status("OffMarket;Unknown", code_to_label)
assert not has_active_listing_status("", code_to_label)
print("PASS: listing status codes and display labels normalize without treating OffMarket as Active.")
