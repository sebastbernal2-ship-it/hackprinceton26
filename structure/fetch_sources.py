"""Build local snapshots (gitignored under data/derived/structure) from the CoStar kit + public keyless endpoints.

  python -m structure.fetch_sources --kit data/raw/costar/full-kit --cands data/normalized/costar/restaurant-site-candidates.csv
Writes: properties.json (per-candidate kit fields + FEMA zone + USGS design values + elevation + same-property occupancy
aggregates), climate_fetch.json (NOAA SLR + Cal-Adapt LOCA deltas, with URLs and retrieval date).
Every endpoint failure is recorded as unreachable; nothing is estimated. Read-only. Prints aggregates only.
"""
import argparse, csv, datetime as dt, json, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import urlopen

CLASS = {0: None, 1: "A", 2: "B", 3: "C", 4: "F"}
MATERIAL = {0: None, 1: "Masonry", 2: "Metal", 3: "ReinforcedConcrete", 4: "Steel", 5: "WoodFrame", 6: "Brownstone", 7: "Limestone"}
FEMA = ("https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query?geometry={lon},{lat}"
        "&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=FLD_ZONE,STATIC_BFE&f=json")
USGS = ("https://earthquake.usgs.gov/ws/designmaps/asce7-22.json?latitude={lat}&longitude={lon}"
        "&riskCategory=II&siteClass=D&title=structure")
EPQS = "https://epqs.nationalmap.gov/v1/json?x={lon}&y={lat}&units=Feet&wkid=4326&includeDate=false"


def get(url, t=40):
    try:
        with urlopen(url, timeout=t) as r:
            return json.load(r)
    except Exception as e:  # recorded, never guessed
        return {"_error": type(e).__name__}


def enrich(p):
    lat, lon = p["lat"], p["lon"]
    f = get(FEMA.format(lat=lat, lon=lon))
    ft = (f.get("features") or [])
    p["fema"] = ({"zone": ft[0]["attributes"].get("FLD_ZONE"), "bfeFt": ft[0]["attributes"].get("STATIC_BFE")} if ft
                 else {"zone": None, "error": f.get("_error", "no NFHL polygon")})
    u = get(USGS.format(lat=lat, lon=lon))
    d = ((u.get("response") or {}).get("data") or {})
    p["usgs"] = ({k: d.get(k) for k in ("sds", "sd1", "sdc", "pgam", "ss", "s1")} | {"ref": "ASCE7-22", "siteClass": "D (default)"}
                 if d else {"error": u.get("_error", "no data")})
    e = get(EPQS.format(lat=lat, lon=lon))
    p["elevationFt"] = e.get("value") if isinstance(e.get("value"), (int, float)) else None
    return p


def kit_props(kit: Path, cands: Path):
    want = {r["property_id"] for r in csv.DictReader(open(cands, newline="", encoding="utf-8"))}
    out = {}
    for line in open(kit / "data/commercial-property.jsonl", encoding="utf-8"):
        r = json.loads(line)
        if str(r["id"]) not in want:
            continue
        ev = r.get("constructionEvents") or []
        yr = [e["year"] for e in ev if e.get("eventType") == 2 and e.get("year")]
        rn = [e["year"] for e in ev if e.get("eventType") == 4 and e.get("year")]
        pa = r.get("primaryAddress") or {}
        out[str(r["id"])] = {"yearBuilt": min(yr) if yr else None, "renovatedYear": max(rn) if rn else None,
                             "material": MATERIAL.get(r.get("buildingConstructionMaterial")),
                             "buildingClass": CLASS.get(r.get("buildingClass")), "stories": r.get("numStoriesAboveGrade"),
                             "grossSqFt": r.get("grossBuildingAreaSquareFeet"), "heightFt": r.get("buildingHeightInFeet"),
                             "hasSprinklers": r.get("hasSprinklers")}
    occ = {k: {"occupancies": 0, "withToDate": 0, "latestToDateYear": None} for k in out}
    for line in open(kit / "data/location-occupancy.jsonl", encoding="utf-8"):
        if '"propertyId"' not in line:
            continue
        r = json.loads(line)
        k = str(r.get("propertyId"))
        if k in occ:
            o = occ[k]; o["occupancies"] += 1
            if r.get("toDate"):
                o["withToDate"] += 1
                y = int(r["toDate"][:4]); o["latestToDateYear"] = max(o["latestToDateYear"] or 0, y)
    for k in out:
        out[k]["sameProperty"] = occ[k]
    return out


def climate(today):
    res = {"retrieved": today, "noaaSlr": {}, "calAdapt": {}}
    for name, st in (("galveston", "8771450"), ("los_angeles", "9410660")):
        u = f"https://api.tidesandcurrents.noaa.gov/dpapi/prod/webapi/product/slr_projections.json?station={st}"
        d = get(u)
        res["noaaSlr"][name] = {"url": u, "rows": [r for r in d.get("SlrProjections", []) if r["projectionYear"] in (2030, 2050, 2070)],
                                "error": d.get("_error")}
    pt = "POINT(-118.25%2034.05)"
    for m in ("CanESM2", "CNRM-CM5", "HadGEM2-ES", "MIROC5"):
        for sc in ("historical", "rcp45", "rcp85"):
            slug = f"tasmax_year_{m}_{sc}"
            u = f"https://api.cal-adapt.org/api/series/{slug}/events/?g={pt}&format=json"
            d = get(u, 120)
            res["calAdapt"][slug] = {"url": u, "index": d.get("index"), "data": d.get("data"), "error": d.get("_error")}
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kit", default="data/raw/costar/full-kit")
    ap.add_argument("--cands", default="data/normalized/costar/restaurant-site-candidates.csv")
    ap.add_argument("--out", default="data/derived/structure")
    a = ap.parse_args()
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    props = kit_props(Path(a.kit), Path(a.cands))
    ll = {r["property_id"]: r for r in csv.DictReader(open(a.cands, newline="", encoding="utf-8"))}
    for k, p in props.items():
        p["lat"], p["lon"] = float(ll[k]["latitude"]), float(ll[k]["longitude"])
        p["city"], p["state"] = ll[k]["city"], ll[k]["state"]
    with ThreadPoolExecutor(6) as ex:
        list(ex.map(enrich, props.values()))
    today = dt.date.today().isoformat()
    for p in props.values():
        p["retrieved"] = today
    (out / "properties.json").write_text(json.dumps(props), encoding="utf-8")
    c = climate(today)
    (out / "climate_fetch.json").write_text(json.dumps(c), encoding="utf-8")
    n = len(props)
    fill = lambda f: sum(1 for p in props.values() if f(p))
    print(json.dumps({"n": n, "yearBuilt": fill(lambda p: p["yearBuilt"]), "material": fill(lambda p: p["material"]),
                      "class": fill(lambda p: p["buildingClass"]), "stories": fill(lambda p: p["stories"]),
                      "gba": fill(lambda p: p["grossSqFt"]), "fema": fill(lambda p: p["fema"].get("zone")),
                      "usgs": fill(lambda p: "sds" in p["usgs"]), "elev": fill(lambda p: p["elevationFt"] is not None),
                      "occWithToDate": fill(lambda p: p["sameProperty"]["withToDate"] > 0),
                      "climateErrors": [k for k, v in c["calAdapt"].items() if v["error"]],
                      "slrErrors": [k for k, v in c["noaaSlr"].items() if v["error"]]}))


if __name__ == "__main__":
    sys.exit(main())
