"""Income/demographics factor adapter (ACS 5-year tract context).

fetch(site) -> raw: geocodes the site coordinates to a 2020 census tract with the
keyless Census geocoder (cached on disk) and attaches the matching row of the locally
downloaded ACS 5-year tract table. observations(site, raw) -> factor-card dicts.

ACS values are sample-based estimates (status "estimated"). Area values describe the
tract, not the site, its customers, or any individual. Missing or sentinel values are
reported as "unknown", never as zero.
"""
import hashlib
import json
import pathlib
import time
import urllib.parse
import urllib.request

FACTOR_ID = "income_demographics"
ROOT = pathlib.Path(__file__).resolve().parents[3]
CACHE_DIR = ROOT / "data" / "derived" / FACTOR_ID / "cache"
ACS_DIR = ROOT / "data" / "derived" / FACTOR_ID / "acs"
GEOCODER = "https://geocoding.geo.census.gov/geocoder/geographies/coordinates"
VINTAGE = "ACS2023_Current"
BENCHMARK = "Public_AR_Current"
TIMEOUT = 20
RETRIES = 3
SOURCE = "US Census Bureau ACS 5-year 2023 (tract tables) + Census Geocoder"
AS_OF = "ACS 2019-2023 5-year estimates (vintage 2023)"
VARIABLES = [  # (estimate col, moe col, label, unit)
    ("B19013_001E", "B19013_001M", "median household income", "USD (2023 inflation-adjusted)"),
    ("B01003_001E", "B01003_001M", "total population", "persons"),
    ("B01002_001E", "B01002_001M", "median age", "years"),
]
# Census annotation sentinels: estimate not available / not computable / suppressed.
SENTINELS = {-666666666, -333333333, -222222222, -555555555, -888888888, -999999999}
TOPCODE_INCOME = 250001
_acs_cache = {}


def _cache_path(site):
    key = "%.6f,%.6f,%s,%s" % (float(site["latitude"]), float(site["longitude"]), VINTAGE, BENCHMARK)
    return CACHE_DIR / (hashlib.sha256(key.encode()).hexdigest()[:24] + ".json")


def _http_json(url):
    last = None
    for attempt in range(RETRIES):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "site-selection-research/0.1"})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                return json.load(r)
        except Exception as e:  # network, HTTP, or JSON errors: retry then give up
            last = e
            time.sleep(1.5 * (attempt + 1))
    raise last


def geocode_tract(site, cache_dir=None):
    """Return {'geoid','name'} or {'error': str}. Successful results are cached."""
    path = (pathlib.Path(cache_dir) / _cache_path(site).name) if cache_dir else _cache_path(site)
    if path.exists():
        return json.loads(path.read_text())
    q = urllib.parse.urlencode({"x": site["longitude"], "y": site["latitude"], "benchmark": BENCHMARK,
                                "vintage": VINTAGE, "layers": "Census Tracts", "format": "json"})
    try:
        data = _http_json(GEOCODER + "?" + q)
        tracts = data["result"]["geographies"]["Census Tracts"]
    except Exception as e:
        return {"error": "geocoder failed: %s" % type(e).__name__}
    if len(tracts) != 1:
        return {"error": "geocoder returned %d tracts" % len(tracts)}
    out = {"geoid": tracts[0]["GEOID"], "name": tracts[0].get("NAME", "")}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out))
    return out


def load_acs(state, acs_dir=None):
    """Index the local ACS table for a state FIPS by 11-digit tract GEOID."""
    d = pathlib.Path(acs_dir or ACS_DIR)
    key = (str(d), state)
    if key not in _acs_cache:
        path = d / ("acs5_2023_tracts_state%s.json" % state)
        if not path.exists():
            _acs_cache[key] = None
        else:
            rows = json.loads(path.read_text())
            head = rows[0]
            idx = {}
            for r in rows[1:]:
                rec = dict(zip(head, r))
                idx[rec["state"] + rec["county"] + rec["tract"]] = rec
            _acs_cache[key] = idx
    return _acs_cache[key]


def fetch(site, cache_dir=None, acs_dir=None):
    tract = geocode_tract(site, cache_dir)
    raw = {"tract": tract, "acs": None}
    if "geoid" in tract:
        idx = load_acs(tract["geoid"][:2], acs_dir)
        if idx is not None:
            raw["acs"] = idx.get(tract["geoid"])
    return raw


def _num(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def _fmt(x):
    return str(int(x)) if x == int(x) else str(x)


def _unknown(label, unit, site, reason, geoid=""):
    return {"factorId": FACTOR_ID, "status": "unknown", "value": "", "unit": unit, "source": SOURCE,
            "recordId": geoid or str(site.get("property_id", "")), "asOf": AS_OF,
            "geography": ("census tract %s" % geoid) if geoid else "census tract (not resolved)",
            "limitations": "%s unknown: %s. Missing is not zero." % (label, reason)}


def observations(site, raw):
    tract, acs = raw.get("tract") or {}, raw.get("acs")
    geoid = tract.get("geoid", "")
    if not geoid:
        return [_unknown(l, u, site, tract.get("error", "site not matched to a tract")) for _, _, l, u in VARIABLES]
    if not acs:
        return [_unknown(l, u, site, "tract %s not in local ACS table" % geoid, geoid) for _, _, l, u in VARIABLES]
    out = []
    for ecol, mcol, label, unit in VARIABLES:
        est, moe = _num(acs.get(ecol)), _num(acs.get(mcol))
        if est is None or int(est) in SENTINELS:
            out.append(_unknown(label, unit, site, "Census reports no usable estimate (%r)" % acs.get(ecol), geoid))
            continue
        notes = ["Tract-level sample estimate of the area, not of the site, its customers, or individuals; "
                 "not a demand forecast and not a suitability score."]
        value = _fmt(est)
        if moe is not None and int(moe) not in SENTINELS:
            value += " (90%% margin of error +/-%s)" % _fmt(moe)
        else:
            notes.append("Margin of error not available from Census.")
        if ecol == "B19013_001E" and int(est) == TOPCODE_INCOME:
            notes.append("Top-coded: true median is at least $250,000.")
        out.append({"factorId": FACTOR_ID, "status": "estimated", "value": value, "unit": unit,
                    "source": SOURCE, "recordId": "%s:%s" % (geoid, ecol), "asOf": AS_OF,
                    "geography": "census tract %s (%s); site matched by coordinates via Census Geocoder %s"
                                 % (geoid, acs.get("NAME", ""), VINTAGE),
                    "limitations": " ".join(notes)})
    return out
