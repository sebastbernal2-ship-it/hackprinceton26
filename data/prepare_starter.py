#!/usr/bin/env python3
"""Normalize CoStar starter CSVs without discarding source fields/provenance.

Usage: python3 data/prepare_starter.py [starter-directory]
Outputs are written below ignored data/normalized/costar/.
"""
import csv
import datetime as dt
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data/raw/costar/marketplace-starter"
DEST = ROOT / "data/normalized/costar"


def normalize_city(value):
    value = value.strip()
    known = {"houston": "Houston", "los angeles": "Los Angeles"}
    return known.get(value.casefold(), value)


def process(filename, key_field):
    src = SOURCE / filename
    out = DEST / filename
    with src.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        fields = list(reader.fieldnames or [])
        if key_field not in fields or "City" not in fields:
            raise ValueError(f"Unexpected CSV schema: {src}")
        rows = list(reader)
    if not rows:
        raise ValueError(f"No data rows: {src}")
    DEST.mkdir(parents=True, exist_ok=True)
    additions = ["site_id", "city_normalized", "source_file", "source_row", "normalization_version"]
    with out.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields + additions)
        writer.writeheader()
        for i, row in enumerate(rows, 2):
            record_id = row[key_field].strip()
            row.update({
                "site_id": f"site-costar-{record_id}" if record_id else "",
                "city_normalized": normalize_city(row["City"]),
                "source_file": filename,
                "source_row": i,
                "normalization_version": "1",
            })
            writer.writerow(row)
    print(f"{filename}: {len(rows)} rows -> {out.relative_to(ROOT)}")


if __name__ == "__main__":
    process("commercial-properties.csv", "PropertyId")
    process("residential-listings.csv", "ListingId")
