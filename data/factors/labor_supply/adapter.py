"""Labor-supply factor adapter: BLS public API v1 (no key), metro geography only.

fetch(site) -> raw      cached JSON of full available series for the site's metro
observations(site, raw) -> list of dicts matching contracts/factor-card.schema.json

Series (each verified by querying the API on 2026-11-14):
  OEWS  OEUM<area7>000000<soc6><datatype2>  annual (A01), only the latest year is exposed
        by the API; SOC 353023 fast food/counter, 352014 restaurant cooks,
        353031 waiters/waitresses, 359011 dining room/cafeteria attendants;
        datatype 03 mean hourly wage, 08 median hourly wage, 01 employment.
  CES   SMU<state2><area5>7072200001  monthly all employees (thousands), food services
        and drinking places. Metro average hourly earnings do not exist at this detail.
Missing is not negative: an unmapped metro, a missing series, or a null value yields an
'unknown' observation, never zero.
"""
import hashlib
import json
import pathlib
import time
import urllib.request

API = "https://api.bls.gov/publicAPI/v1/timeseries/data/"
SOURCE = "BLS Public Data API v1 (api.bls.gov), no key"
FACTOR_ID = "labor_supply"
CACHE_DIR = pathlib.Path(__file__).resolve().parents[2] / "derived" / FACTOR_ID / "cache"

METROS = {
    ("houston", "TX"): {"cbsa": "26420", "state": "48", "name": "Houston metro area (CBSA 26420)"},
    ("los angeles", "CA"): {"cbsa": "31080", "state": "06", "name": "Los Angeles-Long Beach-Anaheim metro area (CBSA 31080)"},
}
ROLES = {
    "353023": "fast food and counter workers",
    "352014": "restaurant cooks",
    "353031": "waiters and waitresses",
    "359011": "dining room and cafeteria attendants and bartender helpers",
}
OEWS_TYPES = {"03": ("mean hourly wage", "USD/hour"), "08": ("median hourly wage", "USD/hour"),
              "01": ("employment", "jobs")}
OEWS_WINDOWS = [(2017, 2026)]  # API serves at most 10 years per request
CES_WINDOWS = [(1990, 1999), (2000, 2009), (2010, 2019), (2020, 2029)]
OEWS_LIMIT = ("OEWS survey estimate for the metro, all industries, reference period May of the year; "
              "a metro aggregate, not a site wage, hiring availability, or wage offer. Only the latest "
              "year is exposed by the API, so no OEWS trend. Hourly figures are rounded by BLS.")
CES_LIMIT = ("CES monthly all-employee count (thousands, not seasonally adjusted) for NAICS 722 in the "
             "metro; the latest months are preliminary and revised. Metro employment level, not labor "
             "availability for a site or concept.")


def metro_for(site):
    return METROS.get((str(site.get("city", "")).strip().lower(), str(site.get("state", "")).strip().upper()))


def series_ids(metro):
    ids = [f"OEUM00{metro['cbsa']}000000{soc}{dt}" for soc in ROLES for dt in OEWS_TYPES]
    ces = [f"SMU{metro['state']}{metro['cbsa']}7072200001"]
    return ids, ces


def _post(ids, start, end, timeout=30, retries=3):
    body = json.dumps({"seriesid": ids, "startyear": str(start), "endyear": str(end)}).encode()
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(API, body, {"Content-type": "application/json"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                out = json.load(r)
            if out.get("status") != "REQUEST_SUCCEEDED":
                raise RuntimeError(f"BLS status {out.get('status')}: {out.get('message')}")
            return out
        except Exception as exc:  # network, HTTP, JSON, or API-level failure
            last = exc
            time.sleep(2 ** attempt)
    raise RuntimeError(f"BLS request failed after {retries} attempts: {last}")


def _merge(responses):
    """Merge responses into {series_id: [points]} with full history; absent series stay absent."""
    out = {}
    for resp in responses:
        for s in resp.get("Results", {}).get("series", []):
            if s.get("data"):
                out.setdefault(s["seriesID"], {})
                for p in s["data"]:
                    out[s["seriesID"]][(p["year"], p["period"])] = p
    return {k: sorted(v.values(), key=lambda p: (p["year"], p["period"])) for k, v in out.items()}


def fetch(site, cache_dir=None, post=_post):
    metro = metro_for(site)
    if metro is None:
        return {"metro": None, "series": {}}
    cache = pathlib.Path(cache_dir) if cache_dir else CACHE_DIR
    cache.mkdir(parents=True, exist_ok=True)
    path = cache / f"bls_{metro['cbsa']}.json"
    if path.exists():
        return json.loads(path.read_text())
    oews, ces = series_ids(metro)
    responses = [post(oews, s, e) for s, e in OEWS_WINDOWS] + [post(ces, s, e) for s, e in CES_WINDOWS]
    raw = {"metro": metro, "series": _merge(responses)}
    path.write_text(json.dumps(raw))
    return raw


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _unknown(reason, series, geography):
    return {"factorId": FACTOR_ID, "status": "unknown", "value": "unknown", "unit": "n/a", "source": SOURCE,
            "recordId": series, "asOf": "unknown", "geography": geography, "limitations": reason}


def observations(site, raw):
    metro = (raw or {}).get("metro")
    if not metro:
        return [_unknown("Site is outside the Houston and Los Angeles metros covered by this adapter; "
                         "no labor data joined.", "none", f"{site.get('city')}, {site.get('state')}")]
    geo = metro["name"]
    oews, ces = series_ids(metro)
    out = []
    for sid in oews:
        soc, dt = sid[-8:-2], sid[-2:]
        label, unit = OEWS_TYPES[dt]
        out.append(_obs(raw["series"].get(sid), sid, f"{ROLES[soc]} {label} (SOC {soc})", unit, geo, OEWS_LIMIT,
                        lambda p: p["year"] + "-05"))
    for sid in ces:
        out.append(_obs(raw["series"].get(sid), sid, "food services and drinking places employment (NAICS 722)",
                        "thousand jobs", geo, CES_LIMIT, lambda p: f"{p['year']}-{p['period'][1:]}"))
    return out


def _obs(points, sid, label, unit, geo, limit, asof):
    latest = next((p for p in reversed(points or []) if _num(p.get("value")) is not None), None)
    if latest is None:
        return _unknown(f"No {label} value returned by BLS for this series; absence is not zero.", sid, geo)
    n = sum(1 for p in points if _num(p.get("value")) is not None)
    return {"factorId": FACTOR_ID, "status": "observed", "value": f"{_num(latest['value']):g}", "unit": unit,
            "source": f"{SOURCE}: {label}", "recordId": sid, "asOf": asof(latest), "geography": geo,
            "limitations": f"{limit} Series has {n} point(s) in cache."}


def timeseries(raw, series_id):
    """Full cached history for trend fitting: [(year, period, value)] with nulls dropped."""
    return [(p["year"], p["period"], _num(p["value"])) for p in raw["series"].get(series_id, [])
            if _num(p.get("value")) is not None]
