"""Build every business-model artifact for the candidate sites and cafe scans (idempotent; gitignored output).

  python -m forecasting.peers.build --kit <kit data dir> --out data/derived/business

Writes  peers_index.json (fitted kNN index + evaluation), context.json (non-food tenancies near any site), sites.json, results/<id>.json,
neighbourhood_checks.json. Same inputs give byte-identical files.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
from datetime import date
from pathlib import Path

from forecasting.peers import data, fit, neighbourhood
from forecasting.peers.site import site_result

REGION_MI = neighbourhood.CONFIG["region_mi"]
DEFAULT_CONCEPT = "cafe"


def read_sites(kit_props: dict, candidates_csv: Path | None, scans_json: Path | None, fixtures: list[dict]) -> list[dict]:
    """Sites = restaurant candidates (CoStar ids) + cafe scans. Coordinates from the kit property record (observed), else a fixture's own
    kit-sourced coordinates, else None (the scan has no address: market-level result only)."""
    sites, seen = [], set()
    fx_by = {fx["meta"]["listingId"]: fx for fx in fixtures}

    def add(lid, label, city, lat=None, lon=None, src="CoStar kit primary address"):
        if lid in seen:
            return
        seen.add(lid)
        p = kit_props.get(lid) if lid > 0 else None
        if p and p["lat"] is not None:
            lat, lon = p["lat"], p["lon"]
        elif lid in fx_by and lat is None:
            c = fx_by[lid]["meta"].get("coordinates") or {}
            lat, lon, src = c.get("lat"), c.get("lon"), c.get("source", src)
        market = (p or {}).get("market") or ("Los Angeles" if "Los Angeles" in city or ", CA" in city else "Houston" if "Houston" in city or ", TX" in city else None)
        sites.append({"listingId": lid, "label": label, "lat": lat, "lon": lon, "market": market, "concept": DEFAULT_CONCEPT, "propertyId": lid if p else None,
                      "bclass": (p or {}).get("bclass"), "yearBuilt": (p or {}).get("yearBuilt"), "ptype": (p or {}).get("ptype"), "sqft": None,
                      "locationSource": src if lat is not None else "no coordinates on file"})

    if candidates_csv and candidates_csv.is_file():
        with open(candidates_csv, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                add(int(r["property_id"]), "candidate", r.get("city", ""), float(r["latitude"]) if r.get("latitude") else None,
                    float(r["longitude"]) if r.get("longitude") else None, "CoStar candidate row")
    if scans_json and scans_json.is_file():
        for s in json.loads(scans_json.read_text(encoding="utf-8"))["scans"]:
            add(s["listingId"], "cafe scan", s["city"])
    return sites


def demo_spells(fx: dict) -> list[dict]:
    block = fx.get("peers") or {}
    out = []
    for s in block.get("spells", []):
        out.append({**s, "start": date.fromisoformat(s["start"]), "end": date.fromisoformat(s["end"]) if s.get("end") else None, "demo": True})
    return out


def context_rows(others: list[dict], sites: list[dict]) -> list[dict]:
    """Non-food tenancies within the region of any located site (slim, anonymised)."""
    pts = [(s["lat"], s["lon"], s["market"]) for s in sites if s["lat"] is not None]
    keep = []
    for o in others:
        if o["lat"] is None or o["lon"] is None or not o["market"]:
            continue
        if any(m == o["market"] and abs(la - o["lat"]) < 0.06 and abs(lo - o["lon"]) < 0.07 and data.haversine_miles(la, lo, o["lat"], o["lon"]) <= REGION_MI for la, lo, m in pts):
            keep.append({"id": o["id"], "propertyId": o["propertyId"], "lat": o["lat"], "lon": o["lon"], "market": o["market"], "industry": o["industry"],
                         "etype": o["etype"], "years": o["years"], "employees": o["employees"]})
    return keep


def _dump(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(f".{os.getpid()}.tmp")
    tmp.write_text(json.dumps(obj, sort_keys=True, default=str), encoding="utf-8")
    tmp.replace(path)


def build_all(kit_dir: Path, out: Path, candidates_csv: Path | None, scans_json: Path | None, fixtures: list[dict], n_configs: int = fit.DEFAULT_CONFIGS,
              reps: int = 300) -> list[dict]:
    kit = data.load_kit(kit_dir)
    pool = data.peer_pool(kit["food"])
    best, ev = fit.run_evaluation(pool, n_configs)
    ev["neighbourhoodAdjacencyCheck"] = neighbourhood.adjacency_check(pool)
    idx = {"version": 1, "asOf": data.ASOF.isoformat(), "params": best.metric_dict(), "evaluation": ev, "pool": [fit._spell_json(s) for s in pool],
           "note": "Anonymised food-tenancy spells from the local CoStar kit. Local only: never commit."}
    _dump(out / fit.INDEX_NAME, idx)
    sites = read_sites(kit["props"], candidates_csv, scans_json, fixtures)
    ctx = context_rows(kit["others"], sites)
    _dump(out / "context.json", ctx)
    _dump(out / "sites.json", sites)
    fx_by = {fx["meta"]["listingId"]: fx for fx in fixtures}
    rows = []
    for s in sites:
        res = site_result(s, pool, ctx, best, ev, demo_spells(fx_by[s["listingId"]]) if s["listingId"] in fx_by else None, reps)
        _dump(out / "results" / f"{s['listingId']}.json", res)
        k, nb = res["knn"], res["neighbourhood"]
        direct = [n for n in (k.get("neighbours") or []) if n["sameKind"]]
        rows.append({"id": s["listingId"], "kind": s["label"], "market": s["market"], "foodSpellsWithin1mi": (res["coverage"] or {}).get("foodSpellsWithin1mi"),
                     "nearestPeerMi": k.get("nearestMi"), "surv2y": (k.get("survival", {}).get("2") or {}).get("value"), "closure2y": (k.get("closure2y") or {}).get("value"),
                     "index": (nb or {}).get("index"), "adjacent": (nb or {}).get("adjacentCompetitor"), "directInK": len(direct), "status": "demo" if res["demo"] else k.get("status")})
    return rows


def summary_table(rows: list[dict]) -> str:
    head = ["id", "kind", "market", "food<=1mi", "nearest peer mi", "survive 2y", "close 2y", "index", "adjacent", "status"]
    f = lambda v: "-" if v is None else (f"{v:.2f}" if isinstance(v, float) else str(v))  # noqa: E731
    lines = ["  ".join(f"{h:>14}" for h in head)]
    for r in rows:
        lines.append("  ".join(f"{f(v):>14}" for v in (r["id"], r["kind"], r["market"], r["foodSpellsWithin1mi"], r["nearestPeerMi"], r["surv2y"], r["closure2y"], r["index"], r["adjacent"], r["status"])))
    return "\n".join(lines)


def main(argv=None) -> int:
    root = Path(__file__).resolve().parents[2]
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--kit", default=None, help="CoStar kit data dir (default: COSTAR_KIT_DIR or data/raw/costar/full-kit/data)")
    ap.add_argument("--out", default=None, help="output dir (default: $DERIVED_DIR/business, else data/derived/business)")
    ap.add_argument("--candidates", default=None)
    ap.add_argument("--configs", type=int, default=fit.DEFAULT_CONFIGS)
    ap.add_argument("--reps", type=int, default=300)
    a = ap.parse_args(argv)
    from data.costar import client
    kit = Path(a.kit) if a.kit else client.kit_dir()
    out = Path(a.out) if a.out else Path(os.environ.get("DERIVED_DIR", "data/derived")) / "business"
    norm = Path(os.environ.get("COSTAR_NORMALIZED_DIR", "data/normalized/costar"))
    cand = Path(a.candidates) if a.candidates else norm / "restaurant-site-candidates.csv"
    fx = [json.loads(p.read_text(encoding="utf-8")) for p in sorted((root / "services/api/app/demo_sites").glob("*.json"))]
    rows = build_all(kit, out, cand, root / "services/api/app/cafe_scans.json", fx, a.configs, a.reps)
    print(summary_table(rows))
    print(f"\n{len(rows)} sites; artifacts in {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
