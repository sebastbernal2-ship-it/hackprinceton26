#!/usr/bin/env python3
"""FEMA NFHL flood-zone point lookup for one site.

fetch(site) -> raw; observations(site, raw) -> list of factor-card dicts
(contracts/factor-card.schema.json). Flood zone is hazard context, not a
safety, insurance or suitability judgement. No NFHL polygon at the point is
'unknown' (unmapped or outside digitised coverage), never 'no hazard'.
"""
import csv, datetime, hashlib, json, pathlib, sys, time
import urllib.parse, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[3]
FACTOR_ID = "natural_hazards"
CACHE = ROOT / "data/derived" / FACTOR_ID / "cache"
SITES = ROOT / "data/normalized/costar/restaurant-site-candidates.csv"
URL = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query"
SOURCE = "FEMA National Flood Hazard Layer (NFHL) MapServer layer 28, Flood Hazard Zones"
FIELDS = "FLD_ZONE,ZONE_SUBTY,SFHA_TF,DFIRM_ID,VERSION_ID,FLD_AR_ID,STATIC_BFE"
LIMITS = ("Mapped regulatory flood zone at the geocoded point only; not parcel footprint. "
          "Effective date of the panel is not returned by this layer; asOf is retrieval date. "
          "Does not capture pluvial/drainage flooding, map age, or future change; not a safety, insurance or suitability finding.")
UNKNOWN_LIMITS = ("No NFHL flood-zone polygon returned at this point (unmapped, not digitised, or service gap); "
                  "this is not evidence of no hazard.")


def _cache_path(site):
    key = f"{float(site['latitude']):.6f},{float(site['longitude']):.6f}"
    return CACHE / (hashlib.sha1(key.encode()).hexdigest()[:16] + ".json")


def fetch(site, timeout=20, retries=3, use_cache=True, cache_dir=None, opener=urllib.request.urlopen, sleep=time.sleep):
    """Query NFHL at the site point. Returns {'retrieved':date,'url':..,'response':json}. Raises after retries."""
    path = _cache_path(site)
    if cache_dir is not None:
        path = pathlib.Path(cache_dir) / path.name
    if use_cache and path.exists():
        return json.loads(path.read_text())
    params = {"geometry": f"{float(site['longitude'])},{float(site['latitude'])}", "geometryType": "esriGeometryPoint",
              "inSR": "4326", "spatialRel": "esriSpatialRelIntersects", "outFields": FIELDS,
              "returnGeometry": "false", "f": "json"}
    url = URL + "?" + urllib.parse.urlencode(params)
    last = None
    for attempt in range(retries):
        try:
            with opener(urllib.request.Request(url, headers={"User-Agent": "site-evidence-research/0.1"}), timeout=timeout) as r:
                body = json.loads(r.read().decode("utf-8"))
            if "error" in body:
                raise RuntimeError(f"NFHL error: {body['error']}")
            raw = {"retrieved": datetime.date.today().isoformat(), "url": URL, "response": body}
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(raw))
            return raw
        except Exception as e:  # network, HTTP, JSON, service error
            last = e
            if attempt < retries - 1:
                sleep(2 ** attempt)
    raise RuntimeError(f"NFHL fetch failed after {retries} attempts: {last}")


def _card(site, status, value, raw, record, limits):
    city, state = site.get("city", ""), site.get("state", "")
    return {"factorId": FACTOR_ID, "status": status, "value": value, "unit": "FEMA flood zone designation" if status != "unknown" else "",
            "source": SOURCE, "recordId": record, "asOf": (raw or {}).get("retrieved", ""),
            "geography": f"point {float(site['latitude']):.6f},{float(site['longitude']):.6f}" + (f" ({city}, {state})" if city else ""),
            "limitations": limits}


def observations(site, raw):
    feats = ((raw or {}).get("response") or {}).get("features") or []
    if not feats:
        return [_card(site, "unknown", "", raw, "site-costar-" + str(site.get("property_id", "")) + ":no-nfhl-polygon", UNKNOWN_LIMITS)]
    out = []
    for f in feats:
        a = f.get("attributes") or {}
        zone = (a.get("FLD_ZONE") or "").strip()
        if not zone:
            out.append(_card(site, "unknown", "", raw, str(a.get("FLD_AR_ID") or ""), UNKNOWN_LIMITS))
            continue
        sub = (a.get("ZONE_SUBTY") or "").strip()
        sfha = {"T": "yes", "F": "no"}.get(a.get("SFHA_TF"), "unknown")
        value = f"{zone}" + (f" ({sub})" if sub else "") + f"; special flood hazard area: {sfha}"
        if a.get("STATIC_BFE") not in (None, -9999):
            value += f"; static BFE {a['STATIC_BFE']}"
        out.append(_card(site, "observed", value, raw, f"{a.get('DFIRM_ID','')}/{a.get('FLD_AR_ID','')}", LIMITS))
    return out


def load_sites(path=SITES):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


if __name__ == "__main__":  # aggregate summary only
    from collections import Counter
    sites = load_sites()
    c, fails = Counter(), 0
    for s in sites:
        try:
            for o in observations(s, fetch(s)):
                c[(s["city"], o["status"], o["value"].split(" ")[0] if o["status"] == "observed" else "")] += 1
        except Exception as e:
            fails += 1
            print("fetch failed:", type(e).__name__, file=sys.stderr)
        time.sleep(0.2)
    print(len(sites), "sites; fetch failures:", fails)
    for k, v in sorted(c.items()):
        print(k, v)
