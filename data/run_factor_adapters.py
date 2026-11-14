#!/usr/bin/env python3
"""Run factor adapters over the local site file and write data/derived/<adapter>/observations.json.

Each card gets `propertyId` so build_factor_cards.py can join it. A site whose fetch raises is
skipped and counted; it stays unknown downstream. Network adapters need their sources reachable.
Usage: run_factor_adapters.py [adapter ...]   (default: all except crime_safety_la, which has its own main)
"""
import csv, importlib, json, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "data"))
SITES = ROOT / "data/normalized/costar/restaurant-site-candidates.csv"
ADAPTERS = ["climate_weather", "income_demographics", "labor_supply", "natural_hazards",
            "schools_education", "signage_visibility", "traffic_access"]


def run(module, sites, outdir):
    cards, failures = [], 0
    for s in sites:
        try:
            obs = module.observations(s, module.fetch(s))
        except Exception:
            failures += 1
            continue
        cards += [{**c, "propertyId": str(s.get("property_id", ""))} for c in obs]
    outdir = pathlib.Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    (outdir / "observations.json").write_text(json.dumps(cards))
    return len(cards), failures


def main(names):
    with SITES.open(newline="", encoding="utf-8") as f:
        sites = list(csv.DictReader(f))
    for name in names or ADAPTERS:
        module = importlib.import_module(f"factors.{name}.adapter")
        n, bad = run(module, sites, ROOT / "data/derived" / name)
        print(f"{name}: sites={len(sites)} cards={n} fetch_failures={bad}")


if __name__ == "__main__":
    main(sys.argv[1:])
