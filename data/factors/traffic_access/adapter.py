"""Traffic-count adapter: nearest official AADT count station per candidate site.

Sources (public ArcGIS REST, no key):
  Houston/TX  TxDOT AADT Annuals (Public View), multi-year AADT per station.
  LA/CA       Caltrans Traffic Volumes AADT (state highway network), one year.
Output rows follow contracts/factor-card.schema.json. A count on a nearby road is
context only: it is not footfall, visibility, access quality, or sales. No station
within SEARCH_RADIUS_M means unknown (missing is not a negative).
"""
import hashlib, json, math, pathlib, time, urllib.parse, urllib.request

FACTOR_ID = "traffic_access"
SEARCH_RADIUS_M = 3000
CACHE_DIR = pathlib.Path(__file__).resolve().parents[2] / "derived" / FACTOR_ID / "cache"
TXDOT_URL = ("https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/"
             "TxDOT_AADT_Annuals_(Public_View)/FeatureServer/0/query")
CALTRANS_URL = ("https://caltrans-gis.dot.ca.gov/arcgis/rest/services/CHhighway/"
                "Traffic_AADT/FeatureServer/0/query")
TXDOT_SOURCE = "TxDOT AADT Annuals (Public View) ArcGIS feature layer"
CALTRANS_SOURCE = "Caltrans Traffic Volumes AADT (2024) ArcGIS feature layer"
TXDOT_LIMITS = ("AADT is a modeled annual-average daily volume on a state-system road, not footfall, "
                "visibility, access quality or sales. Station is the nearest with a reported AADT within "
                f"{SEARCH_RADIUS_M} m by straight-line distance; not routed, not tied to driveway or direction. "
                "TxDOT terms: informational use, no warranty; no commercial use, resale or third-party distribution.")
CALTRANS_LIMITS = ("AADT on the state highway network only (local streets are not covered), count year Oct-Sep; "
                   "not footfall, visibility, access quality or sales. Nearest highway count point within "
                   f"{SEARCH_RADIUS_M} m by straight-line distance; back/ahead are the two sides of the post mile, "
                   "direction not resolved. Single published year, so no trend. Caltrans: informational, no warranty.")


def haversine_m(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = (math.sin((p2 - p1) / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2)
    return 2 * 6371000 * math.asin(math.sqrt(a))


def provider(site):
    state = (site.get("state") or "").strip().upper()
    return {"TX": "txdot", "CA": "caltrans"}.get(state)


def _query_params(site):
    return {"where": "1=1", "geometry": f"{float(site['longitude'])},{float(site['latitude'])}",
            "geometryType": "esriGeometryPoint", "inSR": "4326", "outSR": "4326",
            "spatialRel": "esriSpatialRelIntersects", "distance": str(SEARCH_RADIUS_M),
            "units": "esriSRUnit_Meter", "outFields": "*", "returnGeometry": "true", "f": "json"}


def _get_json(url, params, timeout=30, retries=3, sleep=time.sleep):
    full = url + "?" + urllib.parse.urlencode(params)
    last = None
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(urllib.request.Request(full, headers={"User-Agent": "traffic-access-adapter"}),
                                        timeout=timeout) as r:
                data = json.load(r)
            if "error" in data:
                raise RuntimeError(f"ArcGIS error: {data['error']}")
            return data
        except Exception as exc:  # network, HTTP, JSON, ArcGIS error: retry with backoff
            last = exc
            if attempt < retries - 1:
                sleep(2 ** attempt)
    raise RuntimeError(f"request failed after {retries} attempts: {last}")


def fetch(site, cache_dir=None, fetcher=_get_json):
    """Return {'provider','retrieved_at','features'} for the site; cached on disk."""
    prov = provider(site)
    if prov is None:
        return {"provider": None, "retrieved_at": "", "features": []}
    params = _query_params(site)
    url = TXDOT_URL if prov == "txdot" else CALTRANS_URL
    key = hashlib.sha256((url + json.dumps(params, sort_keys=True)).encode()).hexdigest()[:24]
    cache = pathlib.Path(cache_dir or CACHE_DIR)
    path = cache / f"{prov}-{key}.json"
    if path.exists():
        return json.loads(path.read_text())
    data = fetcher(url, params)
    raw = {"provider": prov, "retrieved_at": time.strftime("%Y-%m-%d", time.gmtime()),
           "features": data.get("features", [])}
    cache.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(raw))
    return raw


def _num(v):
    try:
        f = float(str(v).strip())
    except (TypeError, ValueError):
        return None
    return int(f) if f >= 0 and f == int(f) else None


def _unknown(reason, asof, source, geography):
    return {"factorId": FACTOR_ID, "status": "unknown", "value": "", "unit": "vehicles/day (AADT)",
            "source": source, "recordId": "", "asOf": asof, "geography": geography, "limitations": reason}


def _txdot_history(attrs):
    year = _num(attrs.get("AADT_RPT_YEAR"))
    if year is None:
        return {}
    out = {}
    for n in range(0, 20):
        field = "AADT_RPT_QTY" if n == 0 else f"AADT_RPT_HIST_{n:02d}_QTY"
        q = _num(attrs.get(field))
        if q is not None:
            out[str(year - n)] = q
    return out


def _nearest(site, features, aadt_fields, latlon):
    lat, lon = float(site["latitude"]), float(site["longitude"])
    best = None
    for f in features:
        a = f.get("attributes", {})
        if not any(_num(a.get(k)) is not None for k in aadt_fields):
            continue
        slat, slon = latlon(f)
        if slat is None:
            continue
        d = haversine_m(lat, lon, slat, slon)
        if best is None or d < best[0]:
            best = (d, f)
    return best


def observations(site, raw):
    prov = raw.get("provider")
    pid = site.get("property_id", "")
    if prov == "txdot":
        return _txdot(site, raw, pid)
    if prov == "caltrans":
        return _caltrans(site, raw, pid)
    return [_unknown("No traffic-count source wired for this site's state.", "", "none", "")]


def _txdot(site, raw, pid):
    geo = f"nearest TxDOT count station within {SEARCH_RADIUS_M} m of site"
    best = _nearest(site, raw["features"], ["AADT_RPT_QTY"],
                    lambda f: (f["attributes"].get("LATITUDE") or (f.get("geometry") or {}).get("y"),
                               f["attributes"].get("LONGITUDE") or (f.get("geometry") or {}).get("x")))
    if best is None:
        return [_unknown(f"No TxDOT station with a reported AADT within {SEARCH_RADIUS_M} m; this does not mean "
                         "low traffic (local streets are not covered).", raw.get("retrieved_at", ""), TXDOT_SOURCE, geo)]
    d, f = best
    a = f["attributes"]
    year = str(a.get("AADT_RPT_YEAR"))
    rid = str(a.get("TRFC_STATN_ID"))
    ctx = (f" Road: {a.get('ON_ROAD')}; category {a.get('CATEGORY')}; count cycle {a.get('COUNT_CYCLE')}; "
           f"active={a.get('ACTIVE')}; county {a.get('CNTY_NM')}.")
    base = {"factorId": FACTOR_ID, "source": TXDOT_SOURCE, "recordId": rid, "asOf": year, "geography": geo}
    hist = _txdot_history(a)
    return [
        {**base, "status": "observed", "value": str(_num(a["AADT_RPT_QTY"])), "unit": "vehicles/day (AADT)",
         "limitations": TXDOT_LIMITS + ctx},
        {**base, "status": "derived", "value": str(round(d)), "unit": "meters, straight-line to station",
         "limitations": "Haversine distance from CoStar site coordinate to station point; not a route or frontage."},
        {**base, "status": "observed", "value": json.dumps(hist, sort_keys=True),
         "unit": "vehicles/day (AADT) by count year (JSON)", "asOf": f"{min(hist)}-{max(hist)}",
         "limitations": "Multi-year AADT as reported by TxDOT for later trend fitting; gaps are unreported years, not zero. "
                        + TXDOT_LIMITS},
    ]


def _caltrans(site, raw, pid):
    geo = f"nearest Caltrans highway count point within {SEARCH_RADIUS_M} m of site"
    best = _nearest(site, raw["features"], ["BACK_AADT", "AHEAD_AADT"],
                    lambda f: ((f.get("geometry") or {}).get("y"), (f.get("geometry") or {}).get("x")))
    if best is None:
        return [_unknown(f"No Caltrans highway count point with AADT within {SEARCH_RADIUS_M} m; the layer covers "
                         "state highways only, so this does not mean low traffic.",
                         "2024", CALTRANS_SOURCE, geo)]
    d, f = best
    a = f["attributes"]
    rid = f"{a.get('CNTY')}-{a.get('RTE')}{a.get('RTE_SFX') or ''}-PM{a.get('PM_PFX') or ''}{a.get('PM')}{a.get('PM_SFX') or ''}"
    base = {"factorId": FACTOR_ID, "source": CALTRANS_SOURCE, "asOf": "2024", "geography": geo}
    ctx = f" Location: {a.get('DESCRIPTION')}."
    out = []
    for side, field in (("back", "BACK_AADT"), ("ahead", "AHEAD_AADT")):
        q = _num(a.get(field))
        if q is not None:
            out.append({**base, "status": "observed", "value": str(q), "recordId": f"{rid}-{side}",
                        "unit": f"vehicles/day (AADT), {side} side of post mile", "limitations": CALTRANS_LIMITS + ctx})
    out.append({**base, "status": "derived", "value": str(round(d)), "recordId": rid,
                "unit": "meters, straight-line to count point",
                "limitations": "Haversine distance from CoStar site coordinate to count point; not a route or frontage."})
    return out
