"""Climate stress scenario table (published numbers only) and exposure view. Scenario analysis, not a forecast.

Rows are built from climate_fetch.json (written by fetch_sources.py from NOAA CO-OPS SLR API and Cal-Adapt LOCA API).
Anything without a sourced number is returned as 'no sourced projection' - never estimated.
"""
from __future__ import annotations

import statistics

HORIZONS = (2030, 2050, 2070)
NOTICE = ("Scenario analysis, not a forecast. Values are published projections with the ranges they carry; they are applied "
          "to site exposure without downscaling to the parcel. 'no sourced projection' means nothing citable was retrieved.")
NOAA_REF = "NOAA 2022 Sea Level Rise Technical Report scenarios via CO-OPS API"
NOAA_SCEN = ("Low", "Intermediate-Low", "Intermediate", "Intermediate-High", "High")
STATIONS = {"HOU": ("galveston", "Galveston Pier 21 / GALVESTON_II (nearest coastal gauge; Houston is inland)"),
            "LA": ("los_angeles", "Los Angeles gauge (Terminal Island); coastal reference only")}
NO_SRC = "no sourced projection"


def _slr_rows(fetch: dict, reg: str) -> list[dict]:
    key, label = STATIONS[reg]
    blk = (fetch.get("noaaSlr") or {}).get(key) or {}
    out = []
    for r in blk.get("rows", []):
        out.append({"horizon": r["projectionYear"], "scenario": f"NOAA {r['scenario']}", "metric": "relative sea level rise vs 2000 (cm)",
                    "low": r["projectionCiLow"], "value": r["projectionRsl"], "high": r["projectionCiHigh"], "unit": "cm",
                    "station": label, "citation": blk.get("url"), "retrieved": fetch.get("retrieved"),
                    "note": f"{NOAA_REF}; low/high = published confidence interval"})
    return out


def _heat_rows(fetch: dict) -> list[dict]:
    """LA: 10-yr mean of annual average daily max temperature minus 1976-2005 mean, per LOCA model; range across 4 models."""
    ca = fetch.get("calAdapt") or {}
    out = []
    models = sorted({k.split("_")[2] for k in ca})
    def series(slug):
        v = ca.get(slug) or {}
        if not v.get("index") or not v.get("data"):
            return {}
        data = v["data"]
        return {int(t[:4]): x for t, x in zip(v["index"], data) if x is not None}
    for sc, label in (("rcp45", "RCP4.5"), ("rcp85", "RCP8.5")):
        for h in HORIZONS:
            deltas, urls = [], []
            for m in models:
                hist, fut = series(f"tasmax_year_{m}_historical"), series(f"tasmax_year_{m}_{sc}")
                hv = [x for y, x in hist.items() if 1976 <= y <= 2005]
                fv = [x for y, x in fut.items() if h - 5 <= y <= h + 4]
                if len(hv) >= 20 and len(fv) >= 8:
                    deltas.append(statistics.mean(fv) - statistics.mean(hv))
                    urls.append(ca[f"tasmax_year_{m}_{sc}"]["url"])
            if deltas:
                out.append({"horizon": h, "scenario": f"Cal-Adapt LOCA {label}", "metric": "change in annual mean daily max temperature vs 1976-2005 (degC)",
                            "low": round(min(deltas), 2), "value": round(statistics.mean(deltas), 2), "high": round(max(deltas), 2), "unit": "degC",
                            "station": f"Los Angeles point (34.05,-118.25); {len(deltas)} LOCA models: {', '.join(models)}",
                            "citation": urls[0] + "  (+ same pattern for the other models)", "retrieved": fetch.get("retrieved"),
                            "note": "Range = min/max across models of the decadal-mean delta; value = model mean. Annual mean of daily max, not heat-day counts."})
    return out


def table(fetch: dict | None, reg: str | None) -> dict:
    if not fetch or reg not in STATIONS:
        return {"rows": [], "noSourced": [{"metric": m, "result": NO_SRC} for m in ("sea level", "heat", "wind", "rainfall flood")],
                "notice": NOTICE, "reason": "no climate data fetched or region unsupported"}
    rows = _slr_rows(fetch, reg) + (_heat_rows(fetch) if reg == "LA" else [])
    no = [{"metric": "extreme heat days (count above threshold)", "result": NO_SRC},
          {"metric": "design wind speed change", "result": NO_SRC},
          {"metric": "extreme rainfall / pluvial flood depth", "result": NO_SRC}]
    if reg == "HOU":
        no.insert(0, {"metric": "annual mean daily max temperature change (Houston)", "result": NO_SRC,
                      "qualitative": "NOAA/NCICS Texas State Climate Summary: intermediate and higher pathways give historically unprecedented warming and stronger heat waves (no numeric Houston value retrieved)",
                      "citation": "https://statesummaries.ncics.org/chapter/tx/"})
    return {"rows": rows, "noSourced": no, "notice": NOTICE}


def exposure(p: dict, fetch: dict | None, reg: str | None) -> dict:
    """Per-horizon exposure: static sea-level headroom (site elevation minus published SLR upper bound), heat delta, others unsourced."""
    t = table(fetch, reg)
    elev = p.get("elevationFt")
    zone = (p.get("fema") or {}).get("zone")
    views = []
    for h in HORIZONS:
        slr = [r for r in t["rows"] if r["horizon"] == h and r["unit"] == "cm"]
        hi_ft = max((r["high"] for r in slr), default=None)
        hi_ft = None if hi_ft is None else hi_ft / 30.48
        head = None if (hi_ft is None or elev is None) else round(elev - hi_ft, 1)
        heat = [r for r in t["rows"] if r["horizon"] == h and r["unit"] == "degC"]
        v = {"horizon": h,
             "seaLevel": {"upperBoundFt": None if hi_ft is None else round(hi_ft, 2), "siteElevationFt": elev, "headroomFt": head,
                          "reading": ("no sourced projection or site elevation unknown" if head is None else
                                      "static rise alone does not reach site elevation; says nothing about rainfall/surge flooding" if head > 0 else
                                      "published upper bound meets or exceeds site elevation: verify")},
             "femaZoneToday": zone, "femaZoneNote": "Zone is today's map; no sourced projection of future flood zones",
             "heat": ({s["scenario"]: {"low": s["low"], "mean": s["value"], "high": s["high"], "unit": "degC"} for s in heat} if heat else NO_SRC),
             "hvacCapacity": "unknown (not in kit); compare design cooling load with a mechanical engineer",
             "wind": NO_SRC}
        views.append(v)
    return {"horizons": views, "notice": NOTICE, "label": "scenario analysis, not a forecast"}
