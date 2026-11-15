#!/usr/bin/env python3
"""Evidence cards for the demo scans (the "cafes" shortcut), which are not restaurant candidates and so are not in
data/run_factor_adapters.py's site list. Reuses the same adapters and card builder unchanged:

  sites      the demo models' location from models_index.csv (lat/lon from the Matterport model)
  adapters   run into data/derived/demo/<adapter>/ so the candidate outputs are never overwritten
  cards      data/build_factor_cards.build_cards -> data/derived/demo/factor-cards.csv, keyed by Matterport model id

Network: the adapters call the same public sources as the candidate run (Open-Meteo, BLS, Urban Institute/NCES,
state traffic counts). Outputs are local and gitignored.

    python data/build_demo_factor_cards.py [--pace 1.0] [model_id ...]
"""
import csv, importlib, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "data"))
import build_factor_cards as bfc  # noqa: E402
import run_factor_adapters as rfa  # noqa: E402

DEMO = ROOT / "data/derived/demo"
DEFAULT_MODELS = ["w2JcUVybv9c", "xVKH13z5MJ8", "JAnuRsaVo9M"]
# FEMA hazards left out on purpose; income needs a Census API key, so it reports unknown on its own.
ADAPTERS = ["climate_weather", "labor_supply", "schools_education", "traffic_access", "income_demographics"]
STATE_CITY = {"TX": "Houston", "CA": "Los Angeles"}


def demo_sites(models):
    out = []
    with (ROOT / "models_index.csv").open(newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            if r["sid"] not in models or not r["lat"] or not r["lon"]:
                continue
            lat, lon = float(r["lat"]), float(r["lon"])
            state = r["state"] or ("CA" if lon < -110 else "TX")
            out.append({"property_id": r["sid"], "address": r["address"] or "", "city": r["city"] or STATE_CITY[state],
                        "state": state, "postal_code": r["postal_code"] or "", "latitude": str(lat), "longitude": str(lon)})
    return out


def main(argv):
    pace = 1.0
    if "--pace" in argv:
        i = argv.index("--pace"); pace = float(argv[i + 1]); del argv[i:i + 2]
    sites = demo_sites(argv or DEFAULT_MODELS)
    print(f"demo sites: {[s['property_id'] for s in sites]}")
    for name in ADAPTERS:
        module = importlib.import_module(f"factors.{name}.adapter")
        n, bad = rfa.run(module, sites, DEMO / name, pace=pace)
        print(f"{name}: cards={n} fetch_failures={bad}", flush=True)
    factors = bfc.rows(bfc.REG / "factors.csv")
    operator = {s["property_id"]: {"matterport_model_ids": s["property_id"]} for s in sites}
    cards = bfc.build_cards(factors, sites, {}, operator, {}, bfc.load_adapter_observations(factors, derived=DEMO))
    out = DEMO / "factor-cards.csv"
    with out.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=bfc.FIELDS); w.writeheader(); w.writerows(cards)
    print(f"wrote {len(cards)} cards for {len(sites)} demo sites -> {out}")


if __name__ == "__main__":
    main(sys.argv[1:])
