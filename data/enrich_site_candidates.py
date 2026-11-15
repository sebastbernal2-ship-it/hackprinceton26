#!/usr/bin/env python3
"""Enrich local site shortlist with directly linked listing and occupancy evidence.

Outputs counts/ranges, not tenant or contact names. Direct propertyId links only;
no fuzzy address joins. Missing records mean unknown, not unavailable/vacant.
"""
import csv
import datetime as dt
import json
import pathlib
from collections import Counter, defaultdict

ROOT = pathlib.Path(__file__).resolve().parent.parent
KIT = ROOT / "data/raw/costar/full-kit"
CANDIDATES = ROOT / "data/normalized/costar/restaurant-site-candidates.csv"
OUTPUT = ROOT / "data/normalized/costar/restaurant-site-evidence.csv"


def records(path):
    with path.open(encoding="utf-8") as f:
        for line in f:
            if line.strip():
                yield json.loads(line)


def active_lease_spaces(listings, statuses, pid):
    """Spaces of Active listings for property pid that are not lease-pending.

    Returns (min_sqft_values, max_sqft_values): per-space squareFeetMin (only
    numeric) and squareFeetMax-or-Min-or-0. Status codes resolve through the
    enum; unknown or missing status is never treated as Active.
    """
    mins, maxima = [], []
    for listing in listings:
        if statuses.get(str(listing.get("listingStatus"))) != "Active":
            continue
        for space in (listing.get("forLeaseSummary") or {}).get("spaces", []):
            if space.get("propertyId") and str(space["propertyId"]) != pid:
                continue
            if space.get("isLeasePending"):
                continue
            if isinstance(space.get("squareFeetMin"), (int, float)):
                mins.append(space["squareFeetMin"])
            maxima.append(space.get("squareFeetMax") or space.get("squareFeetMin") or 0)
    return mins, maxima


def main():
    enums = json.loads((KIT / "schemas/enums.json").read_text(encoding="utf-8"))
    statuses = enums["ListingStatus"]
    listing_types = enums["ListingType"]
    industries = enums["IndustryType"]
    listings = defaultdict(list)
    for item in records(KIT / "data/commercial-listing-summary.jsonl"):
        if item.get("propertyId"):
            listings[str(item["propertyId"])].append(item)
    occupancies = defaultdict(list)
    for item in records(KIT / "data/location-occupancy.jsonl"):
        if item.get("propertyId"):
            occupancies[str(item["propertyId"])].append(item)
    tenant_industry = {}
    for item in records(KIT / "data/company-detail.jsonl"):
        tenant_industry[str(item.get("id"))] = (item.get("profile") or {}).get("industryType")

    with CANDIDATES.open(newline="", encoding="utf-8") as f:
        candidates = list(csv.DictReader(f))
    fields = list(candidates[0]) + [
        "listing_record_count", "listing_statuses", "listing_types",
        "explicitly_active_lease_spaces", "active_listed_min_available_sqft",
        "active_listed_max_available_sqft", "occupancy_record_count",
        "occupancy_industry_types", "tenant_details_matched",
        "unique_food_service_tenant_locations", "latest_occupancy_move_in_date",
        "earliest_occupancy_move_in_date", "evidence_as_of",
        "availability_interpretation",
    ]
    as_of = dt.datetime.now(dt.timezone.utc).date().isoformat()
    with OUTPUT.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for row in candidates:
            pid = row["property_id"]
            ls = listings.get(pid, [])
            os_ = occupancies.get(pid, [])
            active_spaces, maxima = active_lease_spaces(ls, statuses, pid)
            moveins = sorted(x.get("moveInDate", "")[:10] for x in os_ if x.get("moveInDate"))
            inds = Counter(industries.get(str(x.get("industryType")), "Unknown") for x in os_)
            tenant_ids = {str(x["tenantLocationId"]) for x in os_ if x.get("tenantLocationId") is not None}
            matched_tenants = {tid for tid in tenant_ids if tid in tenant_industry}
            food_tenants = {tid for tid in matched_tenants if str(tenant_industry[tid]) == "17"}
            row.update({

                "listing_record_count": len(ls),
                "listing_statuses": ";".join(sorted({statuses.get(str(x.get("listingStatus")), "Unknown") for x in ls})),
                "listing_types": ";".join(sorted({listing_types.get(str(x.get("listingType")), "Unknown") for x in ls})),
                "explicitly_active_lease_spaces": len(active_spaces),
                "active_listed_min_available_sqft": sum(active_spaces) if active_spaces else "",
                "active_listed_max_available_sqft": sum(maxima) if maxima else "",
                "occupancy_record_count": len(os_),
                "occupancy_industry_types": ";".join(f"{k}:{v}" for k, v in sorted(inds.items())),
                "tenant_details_matched": len(matched_tenants),
                "unique_food_service_tenant_locations": len(food_tenants),
                "latest_occupancy_move_in_date": max(moveins) if moveins else "",
                "earliest_occupancy_move_in_date": min(moveins) if moveins else "",
                "evidence_as_of": as_of,
                "availability_interpretation": "Directly linked active listings are evidence to verify, not a guarantee of availability; no listing/occupancy records means unknown, not vacant.",
            })
            writer.writerow(row)
    print(f"Wrote {len(candidates)} evidence-enriched candidate rows: {OUTPUT.relative_to(ROOT)}")
    print("Evidence uses direct property-ID joins; vacancy and availability are not inferred from missing records.")


if __name__ == "__main__":
    main()
