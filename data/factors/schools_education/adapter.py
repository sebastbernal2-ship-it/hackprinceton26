"""Schools factor adapter: public schools near a site (NCES CCD directory via Urban Institute).

Context only. Counts and distances are locations, not school quality, demand or
safety. Schools without coordinates in the directory cannot be placed and are
not counted (missing is not a negative).
"""
import json
import math
import pathlib
import time
import urllib.error
import urllib.request

FACTOR_ID = "schools_education"
YEAR = 2024
RADIUS_MILES = 1.0
API = "https://educationdata.urban.org/api/v1/schools/ccd/directory/{year}/?fips={fips}&per_page=10000"
STATE_FIPS = {"TX": 48, "CA": 6}
OPEN_STATUSES = {1, 3, 4, 5, 7}  # CCD: open, new, added, changed boundary, reopened
KEEP = ("ncessch", "school_name", "latitude", "longitude", "school_status", "fips")
CACHE_DIR = pathlib.Path(__file__).resolve().parents[2] / "derived" / FACTOR_ID / "cache"
SOURCE = "NCES Common Core of Data school directory via Urban Institute Education Data Portal"
LIMITATIONS = ("Public schools in the CCD directory only (no private schools); location is the directory "
               "geocode, schools lacking coordinates are not counted; says nothing about school quality, "
               "demand or safety.")


def haversine_miles(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 3958.7613 * 2 * math.asin(math.sqrt(a))


def _get(url, retries=3, timeout=60):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "site-context-adapter"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.load(r)
        except (urllib.error.URLError, TimeoutError, ValueError):
            if attempt == retries - 1:
                raise
            time.sleep(2 ** attempt)


def fetch(site, year=YEAR, cache_dir=CACHE_DIR, getter=_get):
    """Return {'year', 'state', 'schools'} for the site's state; one request series per state, cached."""
    state = (site.get("state") or "").strip().upper()
    fips = STATE_FIPS.get(state)
    if fips is None:
        return {"year": year, "state": state, "schools": None}
    path = pathlib.Path(cache_dir) / f"ccd_directory_{year}_{fips}.json"
    if path.exists():
        return json.loads(path.read_text())
    url, schools = API.format(year=year, fips=fips), []
    while url:
        page = getter(url)
        schools += [{k: s.get(k) for k in KEEP} for s in page["results"]]
        url = page.get("next")
    raw = {"year": year, "state": state, "schools": schools}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(raw))
    return raw


def _obs(site, raw, status, value, unit, extra, limits=LIMITATIONS):
    return {"factorId": FACTOR_ID, "status": status, "value": value, "unit": unit, "source": SOURCE,
            "recordId": f"ccd-directory-{raw.get('year', YEAR)}:{extra}:{site.get('property_id', '')}",
            "asOf": f"CCD directory year {raw.get('year', YEAR)} (school year {raw.get('year', YEAR)}-{str(raw.get('year', YEAR) + 1)[2:]})",
            "geography": f"within {RADIUS_MILES:g} mile (haversine) of site coordinates",
            "limitations": limits}


def observations(site, raw):
    try:
        lat, lon = float(site["latitude"]), float(site["longitude"])
    except (KeyError, TypeError, ValueError):
        lat = lon = None
    if raw.get("schools") is None or lat is None:
        why = "Site coordinates missing." if lat is None else f"State {raw.get('state')!r} not covered by this adapter."
        return [_obs(site, raw, "unknown", "unknown", "schools", "count", why)]
    near = []
    for s in raw["schools"]:
        if s.get("latitude") is None or s.get("longitude") is None or s.get("school_status") not in OPEN_STATUSES:
            continue
        d = haversine_miles(lat, lon, s["latitude"], s["longitude"])
        if d <= RADIUS_MILES:
            near.append(d)
    out = [_obs(site, raw, "derived", str(len(near)), "open public schools within 1 mile", "count")]
    if near:
        out.append(_obs(site, raw, "derived", f"{min(near):.2f}", "miles to nearest open public school", "nearest"))
    return out
