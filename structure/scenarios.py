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


# ---- Reactive scenario metrics -------------------------------------------------------------------------------------------------
# Selector scenarios map to NOAA 2022 SLR scenarios (sourced). Heat, flood depth, wind and cost lines are LABELLED DEMO ESTIMATES: deterministic
# functions of the sourced sea level rise, the region, FEMA zone, site elevation and the listing id. They illustrate direction and order of
# magnitude so a cafe operator can compare scenarios; they are not projections and are never presented as sourced.
SELECTOR = ("Low", "Intermediate", "High")
CAFE_SQFT = 1800  # assumed cafe footprint for cost lines, not the building gross area
COOL_USD_PER_KSF_DAY = 14.0  # assumed extra cooling energy cost per 1,000 sq ft per extra hot day
INS_USD_PER_FT_DEPTH = 450.0  # assumed extra annual flood premium per foot of 100-year flood depth
DEMO_NOTE = "labelled demo estimate (deterministic per listing from the sourced sea level path); not a forecast"
_HEAT = {"HOU": (55, 45), "LA": (20, 30)}  # (hot days >= 95F today, added at +100 cm sea level path)
_ZONE_DEPTH = {"AE": 2.0, "A": 2.0, "AH": 1.5, "AO": 1.5, "VE": 3.0, "X": 0.4}


def _jitter(listing_id: int) -> float:
    return 0.9 + ((listing_id * 2654435761) % 2001) / 10000.0  # 0.90 .. 1.10, integer arithmetic so it is stable across runs


def metrics(listing_id: int, p: dict, fetch: dict | None, reg: str | None) -> dict:
    """Per-scenario, per-horizon series for each metric, plus today's baseline. Empty when no sea level path is sourced."""
    t = table(fetch, reg)
    slr = {(r["scenario"].removeprefix("NOAA "), r["horizon"]): r["value"] for r in t["rows"] if r["unit"] == "cm" and r["scenario"].startswith("NOAA ")}
    if not slr or reg not in _HEAT:
        return {"scenarios": [], "horizons": list(HORIZONS), "metrics": [], "assumptions": {}, "notice": NOTICE}
    j = _jitter(listing_id)
    base_days, k_days = _HEAT[reg]
    zone = ((p.get("fema") or {}).get("zone") or "").upper()
    zone_depth = _ZONE_DEPTH.get(zone, 0.4)
    elev = p.get("elevationFt") or 0.0
    today_days = round(base_days * j)
    today_depth = round(max(0.0, zone_depth - 0.02 * elev) * j, 1)

    def at(sc, h):
        cm = slr.get((sc, h))
        if cm is None:
            return None
        days = round((base_days + k_days * cm / 100.0) * j)
        depth = round(max(0.0, zone_depth + cm / 30.48 - 0.02 * elev) * j, 1)
        return {"slr": cm, "days": days, "depth": depth, "wind": round((3.0 if reg == "HOU" else 1.0) * cm / 100.0 * j, 1),
                "cool": round((days - today_days) * CAFE_SQFT / 1000.0 * COOL_USD_PER_KSF_DAY / 10) * 10,
                "ins": round((depth - today_depth) * INS_USD_PER_FT_DEPTH / 10) * 10}

    scs = [s for s in SELECTOR if all((s, h) in slr for h in HORIZONS)]
    if not scs:
        return {"scenarios": [], "horizons": list(HORIZONS), "metrics": [], "assumptions": {}, "notice": NOTICE}
    grid = {s: {h: at(s, h) for h in HORIZONS} for s in scs}
    spec = [("slr", "Sea level rise", "cm", "sourced", None, "slr", "NOAA 2022 relative sea level rise vs 2000 at the nearest gauge"),
            ("days", "Hot days a year (95F+)", "days", "demo", today_days, "days", DEMO_NOTE),
            ("depth", "100-year flood depth at the site", "ft", "demo", today_depth, "depth", DEMO_NOTE),
            ("wind", "Design wind gust change", "%", "demo", 0.0, "wind", DEMO_NOTE),
            ("cool", "Extra cooling cost a year", "USD", "demo", 0, "cool", DEMO_NOTE + f"; assumes {CAFE_SQFT:,} sq ft"),
            ("ins", "Extra flood insurance a year", "USD", "demo", 0, "ins", DEMO_NOTE)]
    out = [{"id": i, "label": lab, "unit": u, "kind": kind, "today": today,
            "series": {s: {str(h): grid[s][h][key] for h in HORIZONS} for s in scs}, "note": note}
           for i, lab, u, kind, today, key, note in spec]
    return {"scenarios": scs, "horizons": list(HORIZONS), "metrics": out, "notice": NOTICE,
            "assumptions": {"cafeSqFt": CAFE_SQFT, "coolUsdPerKsfDay": COOL_USD_PER_KSF_DAY, "insUsdPerFtDepth": INS_USD_PER_FT_DEPTH}}
