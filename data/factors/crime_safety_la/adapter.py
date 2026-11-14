"""Crime-safety context factor adapter for Los Angeles (LAPD NIBRS offenses, data.lacity.org).

Context only: counts of reported offenses near a site. Never a score, rate, rank or
safety claim. Mirrors the Houston NIBRS aggregation in data/build_local_context.py
(same 0.5 mi radius, same inclusive haversine, same violent/property NIBRS code sets).

fetch(site)        -> raw dict (network + on-disk cache under data/derived/crime_safety_la/cache)
observations(...)  -> list of dicts matching contracts/factor-card.schema.json
fetch_city_monthly -> whole-city monthly aggregate counts (for later trend fitting)
"""
import hashlib
import json
import pathlib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

DATA = pathlib.Path(__file__).resolve().parents[2]
ROOT = DATA.parent
if str(DATA) not in sys.path:
    sys.path.insert(0, str(DATA))
import build_local_context as ctx  # noqa: E402  (reuse miles/VIOLENT/PROPERTY)

FACTOR_ID = "crime_safety_la"
HOST = "https://data.lacity.org"
NIBRS = "k7nn-b2ep"   # LAPD NIBRS Offenses Dataset
LEGACY = "2nrs-mtv8"  # Crime Data from 2020 to 2024 (legacy UCR, ends 2024-12-30)
CACHE = ROOT / "data/derived" / FACTOR_ID / "cache"
RADIUS_MI = 0.5
# Same Jan 1 - Jun 30 2026 window as the Houston NIBRS snapshot (occurrence date).
WINDOW = ("2026-01-01", "2026-06-30")
MARGIN_DEG = 0.012  # > 0.5 mi in lat and lon at LA latitude; exact filter is haversine
TIMEOUT = 60
RETRIES = 3
SOURCE = "LAPD NIBRS Offenses Dataset (data.lacity.org/resource/k7nn-b2ep), CC0 1.0"
CITY_NAMES = {"los angeles"}


def _get(dataset, params, cache_dir=None, opener=urllib.request.urlopen, sleep=time.sleep):
    """GET a Socrata query with timeout, retries (backoff) and a content-addressed cache."""
    cache_dir = cache_dir or CACHE
    qs = urllib.parse.urlencode(sorted(params.items()))
    key = hashlib.sha256(f"{dataset}?{qs}".encode()).hexdigest()[:32]
    path = pathlib.Path(cache_dir) / f"{key}.json"
    if path.exists():
        return json.loads(path.read_text())
    url = f"{HOST}/resource/{dataset}.json?{qs}"
    last = None
    for attempt in range(RETRIES):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "location-intel-factor-adapter"})
            with opener(req, timeout=TIMEOUT) as resp:
                body = json.loads(resp.read().decode("utf-8"))
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(body))
            return body
        except (urllib.error.URLError, TimeoutError, ValueError, OSError) as exc:
            last = exc
            sleep(2 ** attempt)
    raise RuntimeError(f"LA open data request failed after {RETRIES} tries: {last}")


def _coord(site):
    try:
        return float(site["latitude"]), float(site["longitude"])
    except (KeyError, TypeError, ValueError):
        return None


def _is_la(site):
    return str(site.get("city") or "").strip().casefold() in CITY_NAMES


def _where(lat, lon):
    # lat/lon are text columns; Socrata orders these numerically (verified: bounds must be
    # numerically ascending), so string bounds act as a bbox prefilter. The authoritative 0.5 mi test is the haversine in observations().
    f = lambda v: f"{v:.4f}"
    return (f"date_occ >= '{WINDOW[0]}T00:00:00' AND date_occ < '2026-07-01T00:00:00' "
            f"AND hndrdth_lat > '{f(lat - MARGIN_DEG)}' AND hndrdth_lat < '{f(lat + MARGIN_DEG)}' "
            f"AND hndrdth_lon > '{f(lon - MARGIN_DEG)}' AND hndrdth_lon < '{f(lon + MARGIN_DEG)}'")


def fetch(site, cache_dir=None, opener=urllib.request.urlopen, sleep=time.sleep):
    """Raw offense rows (bounding-box prefilter) for one site, or an unknown marker."""
    coord = _coord(site)
    if not _is_la(site) or coord is None:
        return {"rows": None, "reason": "not an LA site or no coordinates"}
    rows, offset = [], 0
    while True:
        page = _get(NIBRS, {
            "$select": "nibr_code,totaloffensecount,hndrdth_lat,hndrdth_lon",
            "$where": _where(*coord), "$order": "uniquenibrno",
            "$limit": 50000, "$offset": offset}, cache_dir, opener, sleep)
        rows += page
        if len(page) < 50000:
            return {"rows": rows, "reason": ""}
        offset += 50000


def count_site(coord, rows, radius=RADIUS_MI):
    """Aggregate counts within `radius` mi (inclusive). Rows with missing or 0,0 coords are skipped."""
    c = {"incidents": 0, "violent": 0, "property": 0}
    for r in rows:
        try:
            pt = (float(r["hndrdth_lat"]), float(r["hndrdth_lon"]))
            n = max(1, int(r.get("totaloffensecount") or 1))
        except (KeyError, TypeError, ValueError):
            continue
        if pt == (0.0, 0.0) or ctx.miles(coord, pt) > radius:
            continue
        code = str(r.get("nibr_code") or "").strip()
        c["incidents"] += n
        for k in ctx.classify_incident(code):
            c[k] += n
    return c


def observations(site, raw):
    """Factor cards for one site. Missing or non-LA data is `unknown`, never zero."""
    pid = str(site.get("property_id", ""))
    coord = _coord(site)
    geo = f"{RADIUS_MI} mi haversine radius around site coordinates"
    base = {"factorId": FACTOR_ID, "source": SOURCE, "recordId": f"{NIBRS}:{pid}",
            "asOf": f"{WINDOW[0]}/{WINDOW[1]}", "geography": geo}
    if raw.get("rows") is None or coord is None:
        return [{**base, "status": "unknown", "value": "", "unit": "offenses",
                 "geography": "none", "limitations":
                 "No LAPD data applies: site is outside the City of Los Angeles or has no coordinates. "
                 "Unknown, not zero."}]
    c = count_site(coord, raw["rows"])
    lim = ("Reported LAPD NIBRS offense counts by occurrence date at the public 100-block-rounded "
           "location; not a rate, not population-adjusted, not a safety score; context only, "
           "not comparable across cities. Reporting, geocoding and entry lag bias counts; "
           "offenses with missing coordinates are excluded.")
    cards = []
    for key, label in (("incidents", "all NIBRS offenses"), ("violent", "violent-classified offenses"),
                       ("property", "property-classified offenses")):
        cards.append({**base, "status": "derived", "value": str(c[key]), "unit": f"{label} (count)",
                      "recordId": f"{NIBRS}:{pid}:{key}", "limitations": lim})
    return cards


def fetch_city_monthly(cache_dir=None, opener=urllib.request.urlopen, sleep=time.sleep):
    """Whole-city monthly aggregates: LAPD NIBRS offenses (complete from ~2025) and legacy UCR (2020-2024).

    Returns rows {series, year, month, nibr_code|crm_cd, incidents}; aggregate only, no locations.
    """
    out = []
    page = _get(NIBRS, {
        "$select": "date_extract_y(date_occ) as y,date_extract_m(date_occ) as m,nibr_code,"
                   "sum(totaloffensecount) as n",
        "$where": "date_occ >= '2020-01-01T00:00:00'", "$group": "y,m,nibr_code",
        "$order": "y,m,nibr_code", "$limit": 50000}, cache_dir, opener, sleep)
    out += [{"series": "nibrs_offenses", "year": int(r["y"]), "month": int(r["m"]),
             "code": r.get("nibr_code", ""), "incidents": int(r["n"])} for r in page]
    page = _get(LEGACY, {
        "$select": "date_extract_y(date_occ) as y,date_extract_m(date_occ) as m,count(*) as n",
        "$group": "y,m", "$order": "y,m", "$limit": 50000}, cache_dir, opener, sleep)
    out += [{"series": "legacy_ucr_incidents", "year": int(r["y"]), "month": int(r["m"]),
             "code": "", "incidents": int(r["n"])} for r in page]
    return out


def main(data_root=None):
    """Run over the local site file. `data_root` = checkout holding the gitignored data/ dirs."""
    import csv
    global CACHE
    data_root = pathlib.Path(data_root or (sys.argv[1] if len(sys.argv) > 1 else ROOT))
    CACHE = data_root / "data/derived" / FACTOR_ID / "cache"
    sites = list(csv.DictReader((data_root / "data/normalized/costar/restaurant-site-candidates.csv").open(newline="")))
    outdir = data_root / "data/derived" / FACTOR_ID
    outdir.mkdir(parents=True, exist_ok=True)
    monthly = fetch_city_monthly()
    with (outdir / "city-monthly-counts.csv").open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["series", "year", "month", "code", "incidents"])
        w.writeheader(); w.writerows(monthly)
    cards = []
    for s in sites:
        cards += [{**c, "propertyId": str(s.get("property_id", ""))} for c in observations(s, fetch(s))]
    (outdir / "observations.json").write_text(json.dumps(cards))
    la = [c for c in cards if c["status"] != "unknown"]
    print(f"sites={len(sites)} cards={len(cards)} derived={len(la)} unknown={len(cards) - len(la)} "
          f"monthly_rows={len(monthly)}")


if __name__ == "__main__":
    main()
