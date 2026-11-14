"""Fetch and parse public series. Raw responses go to data/raw/series/ (git-ignored)."""
from __future__ import annotations

import csv
import json
import urllib.parse
import urllib.request
from collections import Counter
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "series"
UA = {"User-Agent": "series-forecast-fetch/1.0"}

LA_DATASETS = {"2010-2019": "63jg-8b9z", "2020-2024": "2nrs-mtv8"}
BLS_SERIES = {  # SMU + state + area + total private + average hourly earnings (all employees)
    "Los Angeles-Long Beach-Glendale MD": "SMU06310800500000003",
    "Houston-Pasadena-The Woodlands MSA": "SMU48264200500000003",
}
CITIES = {"Los Angeles": (34.0522, -118.2437), "Houston": (29.7604, -95.3698)}
TXDOT = ("https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/"
         "TxDOT_AADT_Annuals_(Public_View)/FeatureServer/0/query")


def get(url, params=None):
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        return json.load(r)


def post(url, body):
    req = urllib.request.Request(url, json.dumps(body).encode(), {**UA, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def save(name, obj):
    RAW.mkdir(parents=True, exist_ok=True)
    (RAW / name).write_text(json.dumps({"retrieved": date.today().isoformat(), "data": obj}))


def load(name):
    p = RAW / name
    return json.loads(p.read_text()) if p.exists() else None


def fetch_la_crime():
    out = {}
    for label, ds in LA_DATASETS.items():
        out[ds] = get(f"https://data.lacity.org/resource/{ds}.json", {
            "$select": "date_trunc_ym(date_occ) as m,count(*) as n", "$group": "m", "$order": "m", "$limit": 1000})
    save("la_crime_monthly.json", out)


def fetch_bls():
    """Per-series incremental cache (v1 allows ~25 requests/day); failures on one series keep the others."""
    out = (load("bls_wages.json") or {}).get("data", {})
    errors = []
    for area, sid in BLS_SERIES.items():
        if sid in out:
            continue
        rows = []
        try:
            for a, b in ((2007, 2016), (2017, date.today().year)):  # v1: max 10 years per request
                r = post("https://api.bls.gov/publicAPI/v1/timeseries/data/",
                         {"seriesid": [sid], "startyear": str(a), "endyear": str(b)})
                if r.get("status") != "REQUEST_SUCCEEDED":
                    raise RuntimeError(f"BLS {sid}: {r.get('message')}")
                rows += r["Results"]["series"][0]["data"]
        except Exception as e:  # noqa: BLE001
            errors.append(str(e))
            continue
        out[sid] = rows
        save("bls_wages.json", out)
    if errors:
        raise RuntimeError("; ".join(errors))


def fetch_climate():
    out = {}
    for city, (lat, lon) in CITIES.items():
        out[city] = get("https://archive-api.open-meteo.com/v1/archive", {
            "latitude": lat, "longitude": lon, "start_date": "1991-01-01", "end_date": "2025-12-31",
            "daily": "temperature_2m_mean", "timezone": "UTC"})
    save("climate_daily.json", out)


def fetch_txdot(county="HARRIS", limit=300):
    out, off = [], 0
    while len(out) < limit:
        r = get(TXDOT, {"where": f"CNTY_NM='{county}'", "outFields": "*", "returnGeometry": "false", "f": "json",
                        "resultOffset": off, "resultRecordCount": 1000})
        feats = r.get("features", [])
        out += [f["attributes"] for f in feats]
        if not r.get("exceededTransferLimit"):
            break
        off += len(feats)
    save("txdot_aadt_harris.json", out[:limit] if limit else out)


# ---- parsers (pure; tested) ----
def month_key(s):
    return s[:7]


def to_monthly_array(pairs):
    """pairs: {"YYYY-MM": value}. Returns (months, values) over the contiguous range; raises on gaps."""
    keys = sorted(pairs)
    y, m = map(int, keys[0].split("-"))
    months = []
    while f"{y:04d}-{m:02d}" <= keys[-1]:
        months.append(f"{y:04d}-{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    gaps = [k for k in months if k not in pairs]
    if gaps:
        raise ValueError(f"missing months (not filled with zero): {gaps[:3]}")
    return months, [pairs[k] for k in months]


def drop_incomplete_tail(months, values, ratio=0.7):
    """Drop the final month when it is below `ratio` x the median of the previous 6 (reporting lag)."""
    import statistics
    if len(values) > 7 and values[-1] < ratio * statistics.median(values[-7:-1]):
        return months[:-1], values[:-1], months[-1]
    return months, values, None


def parse_la_crime(raw):
    pairs = {}
    for rows in raw["data"].values():
        for r in rows:
            pairs[month_key(r["m"])] = float(r["n"])
    return pairs


def parse_bls(rows):
    pairs = {}
    for r in rows:
        if r["period"].startswith("M") and r["period"] != "M13":
            pairs[f"{r['year']}-{int(r['period'][1:]):02d}"] = float(r["value"])
    return pairs


def parse_climate(daily):
    sums, cnt = Counter(), Counter()
    for d, v in zip(daily["daily"]["time"], daily["daily"]["temperature_2m_mean"]):
        if v is not None:  # missing days are skipped, not zero-filled
            sums[d[:7]] += v
            cnt[d[:7]] += 1
    return {k: sums[k] / cnt[k] for k in sums if cnt[k] >= 25}


def aadt_series(attrs):
    """Trailing contiguous run of positive AADT values -> (first_year, values oldest-first). Gaps/zero = missing."""
    yr = attrs.get("AADT_RPT_YEAR")
    if not yr:
        return None
    vals = {yr: attrs.get("AADT_RPT_QTY")}
    for i in range(1, 20):
        vals[yr - i] = attrs.get(f"AADT_RPT_HIST_{i:02d}_QTY")
    run = []
    for y in range(yr, yr - 20, -1):
        v = vals[y]
        if v is None or v <= 0:
            break
        run.append(float(v))
    if not run:
        return None
    return yr - len(run) + 1, run[::-1]


def houston_monthly(path):
    """Monthly NIBRS offense counts from the local Houston PD file: (months, counts)."""
    c = Counter()
    with open(path, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            if r["Occurrence Date"]:
                c[r["Occurrence Date"][:7]] += int(r["Offense Count"] or 1)
    return to_monthly_array(dict(c))
