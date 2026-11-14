"""Cite-only published projections. `fetch` GETs each URL once and writes config/published_sources.json;
cards from these entries carry a citation and no numbers (values are not ingested)."""
from __future__ import annotations

import hashlib
import json
import re
import urllib.request
from datetime import date
from pathlib import Path

CONFIG = Path(__file__).resolve().parents[2] / "config" / "published_sources.json"

# horizonToken is searched in the fetched page to confirm the stated horizon; it is recorded, never assumed.
SOURCES = [
    {"id": "ca-dof-county-population", "publisher": "California Department of Finance, Demographic Research Unit",
     "title": "Population Projections (Baseline 2024), P-2 County Population Projections",
     "url": "https://dof.ca.gov/forecasting/demographics/projections/", "geography": "California and counties",
     "horizon": "2020-2070", "horizonToken": "2020-2070", "kind": "population projection",
     "limitations": "Baseline demographic projection by the state; not a site-level forecast; assumptions in publisher methodology."},
    {"id": "tx-tdc-county-population", "publisher": "Texas Demographic Center",
     "title": "Vintage 2024 Population Projections (counties)",
     "url": "https://demographics.texas.gov/Projections/", "geography": "Texas and counties",
     "horizon": "2020-2060", "horizonToken": "2020 to 2060", "kind": "population projection",
     "limitations": "Three migration scenarios published; scenario choice is the publisher's, not an estimate of likelihood."},
    {"id": "cal-adapt-la-climate", "publisher": "Cal-Adapt (UC Berkeley Geospatial Innovation Facility / California Energy Commission)",
     "title": "Cal-Adapt climate projections for California (use Los Angeles County/grid-cell queries)",
     "url": "https://cal-adapt.org/", "geography": "California, queryable for Los Angeles",
     "horizon": "to 2100 (stated by publisher documentation, not confirmed in the fetched landing page)", "horizonToken": "2100",
     "kind": "climate projection",
     "limitations": "Downscaled global-model scenarios (emissions pathways); scenario analysis, not a forecast. Specific variable and model must be cited per use."},
    {"id": "noaa-sea-level-scenarios", "publisher": "NOAA National Ocean Service (Office for Coastal Management)",
     "title": "Sea Level Rise Viewer: local relative sea level rise scenarios (2022 Interagency Technical Report)",
     "url": "https://coast.noaa.gov/slr/", "geography": "US coast, tide-gauge and grid-cell scenarios",
     "horizon": "2020-2100 viewer scenarios (2022 technical report extends to 2150; not confirmed in fetch)",
     "horizonToken": "2100", "kind": "sea-level scenario",
     "limitations": "Scenarios (low to extreme), not probabilities; relative to local land motion; inland sites are not covered."},
    {"id": "bls-employment-projections", "publisher": "U.S. Bureau of Labor Statistics",
     "title": "Employment Projections, 2025-35", "url": "https://www.bls.gov/emp/", "geography": "United States (national)",
     "horizon": "2025-2035", "horizonToken": "2025–35", "kind": "employment projection",
     "limitations": "National industry/occupation projections; not metro- or site-specific."},
]


def fetch_one(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (published-sources fetch)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        body = r.read()
        return r.status, r.geturl(), body


def fetch_all(write=True):
    out = []
    for s in SOURCES:
        status, final, body = fetch_one(s["url"])
        text = body.decode("utf-8", "ignore")
        m = re.search(r"<title>(.*?)</title>", text, re.S)
        e = {k: v for k, v in s.items() if k != "horizonToken"}
        e.update(retrieved=date.today().isoformat(), httpStatus=status, finalUrl=final,
                 pageTitle=re.sub(r"\s+", " ", m.group(1)).strip() if m else None,
                 sha256=hashlib.sha256(body).hexdigest(), bytes=len(body),
                 horizonConfirmedInFetchedPage=s["horizonToken"] in text.replace("&#8211;", "–"))
        out.append(e)
    if write:
        CONFIG.parent.mkdir(parents=True, exist_ok=True)
        CONFIG.write_text(json.dumps({"note": "Cite-only published projections. Values are not ingested; "
                                      "cards from these carry citation only.", "sources": out}, indent=2) + "\n")
    return out


def published_cards(entries=None):
    entries = entries or json.loads(CONFIG.read_text())["sources"]
    cards = []
    for e in entries:
        cards.append({
            "kind": "published", "status": "unknown", "metric": e["title"], "horizon": e["horizon"],
            "scenario": "as published by the source (scenario analysis, not our forecast)",
            "method": f"Cite-only pointer to {e['publisher']} {e['kind']}; values are not extracted or recomputed here.",
            "citation": {"source": f"{e['publisher']}: {e['title']}", "recordId": e["url"],
                         "asOf": e["retrieved"], "geography": e["geography"], "limitations": e["limitations"]},
        })
    return cards
