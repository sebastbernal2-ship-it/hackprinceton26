#!/usr/bin/env python3
"""Climate/weather factor adapter (Open-Meteo historical archive, no key).

fetch(site) -> raw dict; observations(site, raw) -> factor-card dicts
(contracts/factor-card.schema.json). Values are reanalysis grid-cell
summaries, not station observations, and not a forecast.
"""
import csv, hashlib, json, pathlib, sys, time, urllib.parse, urllib.request
from datetime import date
from math import asin, cos, radians, sin, sqrt

ROOT = pathlib.Path(__file__).resolve().parents[3]
FACTOR_ID = "climate_weather"
CACHE = ROOT / "data/derived" / FACTOR_ID / "cache"
URL = "https://archive-api.open-meteo.com/v1/archive"
START, END = "2023-01-01", "2025-12-31"   # three complete calendar years
ANNUAL_YEAR = "2025"
HOT_C, FREEZE_C = 35.0, 0.0
SOURCE = "Open-Meteo Historical Weather API (ERA5/ERA5-Land reanalysis; CC BY 4.0)"
DAILY = "temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum"
BASE_LIM = ("Reanalysis grid-cell estimate (~10 km), not a station observation or site measurement; "
            f"window {START} to {END} is three years, not a 30-year normal; not a forecast or projection.")


def _km(a, b, c, d):
    a, b, c, d = map(radians, (a, b, c, d))
    h = sin((c - a) / 2) ** 2 + cos(a) * cos(c) * sin((d - b) / 2) ** 2
    return 6371.0088 * 2 * asin(sqrt(h))


def _coords(site):
    return round(float(site["latitude"]), 4), round(float(site["longitude"]), 4)


def fetch(site, cache_dir=None, opener=urllib.request.urlopen, retries=3, timeout=30, sleep=time.sleep):
    """Return raw API JSON (cached). Raises RuntimeError after retries; never fabricates."""
    lat, lon = _coords(site)
    params = {"latitude": lat, "longitude": lon, "start_date": START, "end_date": END,
              "daily": DAILY, "timezone": "UTC"}
    url = URL + "?" + urllib.parse.urlencode(params)
    cdir = pathlib.Path(cache_dir) if cache_dir else CACHE
    path = cdir / (hashlib.sha256(url.encode()).hexdigest()[:20] + ".json")
    if path.exists():
        return json.loads(path.read_text())
    err = None
    for i in range(retries):
        try:
            with opener(url, timeout=timeout) as r:
                raw = json.loads(r.read())
            if "daily" not in raw:
                raise ValueError(str(raw.get("reason", "no daily block"))[:200])
            raw["_request"] = {"lat": lat, "lon": lon, "retrieved": date.today().isoformat()}
            cdir.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(raw))
            return raw
        except Exception as e:  # network, HTTP (429/5xx), JSON
            err = e
            sleep(2 ** i * 2)
    raise RuntimeError(f"Open-Meteo fetch failed: {err}")


def _card(site, status, value, unit, metric, lim, raw=None):
    lat, lon = _coords(site)
    req = (raw or {}).get("_request", {})
    return {"factorId": FACTOR_ID, "status": status, "value": value, "unit": unit,
            "source": SOURCE,
            "recordId": f"open-meteo-archive:{metric}:{lat},{lon}:{START}..{END}",
            "asOf": req.get("retrieved", "") if status != "unknown" else "",
            "geography": f"ERA5 grid cell at {(raw or {}).get('latitude', '')},{(raw or {}).get('longitude', '')}" if raw else f"point {lat},{lon}",
            "limitations": lim}


METRICS = ["annual_mean_temp", "annual_precip", "hot_days_per_year", "freeze_days_per_year",
           "monthly_mean_temp", "monthly_precip", "grid_cell_distance"]
_UNIT = {"annual_mean_temp": "degC", "annual_precip": "mm", "hot_days_per_year": f"days/yr with tmax>={HOT_C:g}C",
         "freeze_days_per_year": f"days/yr with tmin<={FREEZE_C:g}C", "monthly_mean_temp": "degC, Jan..Dec JSON array",
         "monthly_precip": "mm/month, Jan..Dec JSON array", "grid_cell_distance": "km"}


def observations(site, raw):
    """Cards for one site. raw=None or unusable data -> unknown cards with empty value."""
    d = (raw or {}).get("daily") or {}
    t = d.get("time") or []
    unk = lambda m, why: _card(site, "unknown", "", _UNIT[m], m, why + " " + BASE_LIM)
    if not t:
        return [unk(m, "Source unavailable; missing is not zero.") for m in METRICS]
    series = {k: d.get(k) or [] for k in ("temperature_2m_mean", "temperature_2m_max", "temperature_2m_min", "precipitation_sum")}
    rows = list(zip(t, *[series[k] + [None] * (len(t) - len(series[k])) for k in series]))
    out = []

    def ok(vals, n):  # require near-complete coverage; never fill gaps
        return len([v for v in vals if v is not None]) >= n * 0.95

    yr = [r for r in rows if r[0].startswith(ANNUAL_YEAR)]
    ndays = len(yr)
    temp = [r[1] for r in yr]
    prc = [r[4] for r in yr]
    out.append(_card(site, "estimated", f"{sum(v for v in temp if v is not None) / len([v for v in temp if v is not None]):.1f}", _UNIT["annual_mean_temp"], "annual_mean_temp",
                     f"Mean of daily means, calendar {ANNUAL_YEAR}. " + BASE_LIM, raw) if ndays and ok(temp, ndays) else unk("annual_mean_temp", "Incomplete daily data."))
    out.append(_card(site, "estimated", f"{sum(v for v in prc if v is not None):.0f}", _UNIT["annual_precip"], "annual_precip",
                     f"Sum of daily precipitation, calendar {ANNUAL_YEAR}. " + BASE_LIM, raw) if ndays and ok(prc, ndays) else unk("annual_precip", "Incomplete daily data."))
    years = sorted({r[0][:4] for r in rows})
    nyears = len(years)
    tmax = [r[2] for r in rows]; tmin = [r[3] for r in rows]
    out.append(_card(site, "derived", f"{sum(1 for v in tmax if v is not None and v >= HOT_C) / nyears:.1f}", _UNIT["hot_days_per_year"], "hot_days_per_year",
                     f"Count of modeled days over threshold, averaged over {nyears} years; threshold is a transparent convention, not a comfort or revenue finding. " + BASE_LIM, raw) if ok(tmax, len(rows)) else unk("hot_days_per_year", "Incomplete daily data."))
    out.append(_card(site, "derived", f"{sum(1 for v in tmin if v is not None and v <= FREEZE_C) / nyears:.1f}", _UNIT["freeze_days_per_year"], "freeze_days_per_year",
                     f"Count of modeled days at or below threshold, averaged over {nyears} years. " + BASE_LIM, raw) if ok(tmin, len(rows)) else unk("freeze_days_per_year", "Incomplete daily data."))
    for metric, idx, agg in (("monthly_mean_temp", 1, "mean"), ("monthly_precip", 4, "sum")):
        m = {f"{i:02d}": [] for i in range(1, 13)}
        for r in rows:
            if r[idx] is not None:
                m[r[0][5:7]].append(r[idx])
        if all(len(v) >= 0.9 * 28 * nyears for v in m.values()):
            vals = [round(sum(v) / len(v), 1) if agg == "mean" else round(sum(v) / nyears, 0) for v in m.values()]
            out.append(_card(site, "derived", json.dumps(vals), _UNIT[metric], metric,
                             f"Calendar-month {'mean' if agg == 'mean' else 'total averaged'} over {nyears} years; seasonality shape only, interval/uncertainty not computed. " + BASE_LIM, raw))
        else:
            out.append(unk(metric, "Incomplete daily data."))
    la, lo = raw.get("latitude"), raw.get("longitude")
    if la is None or lo is None:
        out.append(unk("grid_cell_distance", "Grid coordinates missing."))
    else:
        km = _km(float(site["latitude"]), float(site["longitude"]), la, lo)
        out.append(_card(site, "derived", f"{km:.1f}", "km", "grid_cell_distance",
                         "Haversine distance from CoStar site coordinates to returned grid-cell centre; indicates spatial representativeness only. " + BASE_LIM, raw))
    return out


def main(argv):
    path = pathlib.Path(argv[1] if len(argv) > 1 else ROOT / "data/normalized/costar/restaurant-site-candidates.csv")
    sites = list(csv.DictReader(path.open(newline="", encoding="utf-8")))
    cov = {m: 0 for m in METRICS}; fails = 0; dist = []
    for s in sites:
        try:
            raw = fetch(s)
        except RuntimeError as e:
            print("fetch failure:", str(e)[:150]); fails += 1; raw = None
        for c in observations(s, raw):
            m = c["recordId"].split(":")[1]
            if c["status"] != "unknown":
                cov[m] += 1
                if m == "grid_cell_distance": dist.append(float(c["value"]))
        time.sleep(0.2)
    print(json.dumps({"sites": len(sites), "fetch_failures": fails, "coverage": cov,
                      "grid_dist_km": {"min": min(dist), "max": max(dist), "mean": round(sum(dist) / len(dist), 2)} if dist else None}))


if __name__ == "__main__":
    main(sys.argv)
