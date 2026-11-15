#!/usr/bin/env python3
"""Create an explicitly exploratory, human-review queue from local evidence."""
import csv
import pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
src = ROOT / "data/normalized/costar/restaurant-site-evidence.csv"
out = ROOT / "data/normalized/costar/human-review-queue.csv"
with src.open(newline="", encoding="utf-8") as f:
    rows = list(csv.DictReader(f))
# 1,000–6,000 sqft is only a broad review band for hand triage, not a product fit rule.
selected = [r for r in rows if r["active_listed_min_available_sqft"]
    and 1000 <= float(r["active_listed_min_available_sqft"]) <= 6000
    and int(r["accessible_model_count"]) > 0
    and int(r["explicitly_active_lease_spaces"]) > 0]
out.parent.mkdir(parents=True, exist_ok=True)
with out.open("w", newline="", encoding="utf-8") as f:
    fields = ["property_id", "city", "address", "active_listed_min_available_sqft", "gross_building_area_sqft", "accessible_model_count", "listing_statuses", "historic_food_service_tenant_locations", "concept", "review_questions"]
    w = csv.DictWriter(f, fieldnames=fields); w.writeheader()
    for r in selected:
        w.writerow({k:r.get(k,"") for k in fields[:-3]} | {"historic_food_service_tenant_locations":r.get("unique_food_service_tenant_locations", "0"), "concept":"Independent cafe (menu and preparation model unknown)", "review_questions":"Confirm listing current; food-service use/zoning; available suite vs whole building; coffee and food menu; on-site preparation or baking; refrigeration and equipment; electrical service and plumbing; handwashing and warewashing; accessible customer circulation; scan matches suite; source-use permissions. Verify ventilation, fire suppression, gas, and grease requirements only against the selected menu and equipment."})
print(f"{len(selected)} sites in local human-review queue (exploratory 1,000–6,000 sqft band; not a recommendation).")
