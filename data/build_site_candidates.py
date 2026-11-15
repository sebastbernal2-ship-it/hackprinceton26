#!/usr/bin/env python3
"""Join CoStar commercial records to Matterport IDs and shortlist asset classes.

This is an investigative shortlist, not a claim that a space is restaurant-ready.
Outputs remain local/ignored because they include property addresses and identifiers.
"""
import csv
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
KIT = ROOT / "data/raw/costar/full-kit"
STARTER = ROOT / "data/raw/costar/marketplace-starter/commercial-properties.csv"
ACCESS = ROOT / "data/normalized/matterport/model-access-checks.jsonl"
OUTPUT = ROOT / "data/normalized/costar/restaurant-site-candidates.csv"


FIELDS = ["property_id", "property_type", "property_subtype_code", "address", "city", "state", "postal_code", "latitude", "longitude", "gross_building_area_sqft", "rentable_area_sqft", "retail_gla_sqft", "has_sprinklers", "matched_model_count", "accessible_model_count", "candidate_basis"]


def models_by_property_from_rows(rows):
    """Map starter PropertyId -> set of non-blank Matterport model IDs (direct ID join only)."""
    out = {}
    for row in rows:
        mid = row["MatterportModelId"].strip()
        if mid:
            out.setdefault(row["PropertyId"], set()).add(mid)
    return out


def accessible_models(lines):
    """Model IDs whose lookup returned HTTP 200 with a result; bad JSON lines are skipped."""
    accessible = set()
    for line in lines:
        try:
            r = json.loads(line)
        except json.JSONDecodeError:
            continue
        if r.get("http_status") == 200 and r.get("result"):
            accessible.add(r["model_id"])
    return accessible


def candidate_row(p, types, include, models_by_property, accessible):
    """Return the candidate CSV row for a property record, or None if its type is excluded."""
    ptype = types.get(str(p.get("propertyType")), "Unknown")
    if ptype not in include:
        return None
    address = p.get("primaryAddress") or {}
    ids = models_by_property.get(str(p.get("id")), set())
    retail = p.get("propertyRetail") or {}
    return {
        "property_id": p.get("id"), "property_type": ptype,
        "property_subtype_code": p.get("propertySubtype"),
        "address": " ".join(str(address.get(k) or "").strip() for k in ("streetNumber", "streetName", "streetType")).strip(),
        "city": address.get("city"), "state": address.get("state"), "postal_code": address.get("postcode"),
        "latitude": address.get("latitude"), "longitude": address.get("longitude"),
        "gross_building_area_sqft": p.get("grossBuildingAreaSquareFeet"),
        "rentable_area_sqft": p.get("rentableBuildingAreaSquareFeet"),
        "retail_gla_sqft": retail.get("grossLeasableAreaSquareFeet"),
        "has_sprinklers": p.get("hasSprinklers"),
        "matched_model_count": len(ids),
        "accessible_model_count": sum(mid in accessible for mid in ids),
        "candidate_basis": "CoStar GeneralRetail or MixedUse; verify use/availability and kitchen suitability independently",
    }


def main():
    enums = json.loads((KIT / "schemas/enums.json").read_text(encoding="utf-8"))
    types = enums["PropertyType"]
    names = {name.casefold(): name for name in types.values()}
    include = {names["generalretail"], names["mixeduse"]}
    with STARTER.open(newline="", encoding="utf-8-sig") as f:
        models_by_property = models_by_property_from_rows(csv.DictReader(f))
    accessible = set()
    if ACCESS.exists():
        with ACCESS.open(encoding="utf-8") as f:
            accessible = accessible_models(f)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with (KIT / "data/commercial-property.jsonl").open(encoding="utf-8") as source, OUTPUT.open("w", newline="", encoding="utf-8") as dest:
        writer = csv.DictWriter(dest, fieldnames=FIELDS)
        writer.writeheader()
        for line in source:
            row = candidate_row(json.loads(line), types, include, models_by_property, accessible)
            if row is not None:
                writer.writerow(row)
                count += 1
    print(f"Wrote {count} retail/mixed-use investigation candidates to {OUTPUT.relative_to(ROOT)}")
    print(f"Matterport access checked: {len(accessible)} distinct model IDs; candidate counts distinguish linked from accessible scans")


if __name__ == "__main__":
    main()
