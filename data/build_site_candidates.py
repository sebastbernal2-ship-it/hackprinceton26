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


def main():
    enums = json.loads((KIT / "schemas/enums.json").read_text())
    types = enums["PropertyType"]
    names = {name.casefold(): name for name in types.values()}
    include = {names["generalretail"], names["mixeduse"]}
    models_by_property = {}
    with STARTER.open(newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            mid = row["MatterportModelId"].strip()
            if mid:
                models_by_property.setdefault(row["PropertyId"], set()).add(mid)
    accessible = set()
    if ACCESS.exists():
        with ACCESS.open() as f:
            for line in f:
                try:
                    r = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if r.get("http_status") == 200 and r.get("result"):
                    accessible.add(r["model_id"])

    fields = ["property_id", "property_type", "property_subtype_code", "address", "city", "state", "postal_code", "latitude", "longitude", "gross_building_area_sqft", "rentable_area_sqft", "retail_gla_sqft", "has_sprinklers", "matched_model_count", "accessible_model_count", "candidate_basis"]
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with (KIT / "data/commercial-property.jsonl").open() as source, OUTPUT.open("w", newline="", encoding="utf-8") as dest:
        writer = csv.DictWriter(dest, fieldnames=fields)
        writer.writeheader()
        for line in source:
            p = json.loads(line)
            ptype = types.get(str(p.get("propertyType")), "Unknown")
            if ptype not in include:
                continue
            address = p.get("primaryAddress") or {}
            ids = models_by_property.get(str(p.get("id")), set())
            retail = p.get("propertyRetail") or {}
            writer.writerow({
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
            })
            count += 1
    print(f"Wrote {count} retail/mixed-use investigation candidates to {OUTPUT.relative_to(ROOT)}")
    print(f"Matterport access checked: {len(accessible)} distinct model IDs; candidate counts distinguish linked from accessible scans")


if __name__ == "__main__":
    main()
