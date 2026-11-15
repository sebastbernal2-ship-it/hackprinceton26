"""Hand-authored demo fixtures for sites the demo keeps returning to (services/api/app/demo_sites/*.json).

A fixture is ONE authoritative file per site. Every route that reads artifacts from disk asks this module first: if a fixture exists
for the listing id (or Matterport tour id) it is served (merged over any real artifact, real fields kept). Values the fixture invents
are labelled DEMO DATA with status estimated or derived; only fields copied from the real local CoStar kit are marked observed.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

DIR = Path(__file__).parent / "demo_sites"
DEMO = "DEMO DATA"


@lru_cache(maxsize=1)
def _all() -> tuple[dict, ...]:
    return tuple(json.loads(p.read_text(encoding="utf-8")) for p in sorted(DIR.glob("*.json")))


def get(listing_id: int | None = None, tour: str | None = None) -> dict | None:
    for fx in _all():
        m = fx["meta"]
        if (listing_id is not None and m["listingId"] == listing_id) or (tour and m["tourId"] == tour):
            return fx
    return None


def ids() -> set[int]:
    return {fx["meta"]["listingId"] for fx in _all()}


def has(listing_id: int) -> bool:
    return listing_id in ids()


def structure_props(fx: dict) -> dict:
    return {k: v for k, v in fx["structure"].items()}


def lineage(fx: dict, names: bool) -> dict:
    L = json.loads(json.dumps(fx["lineage"]))
    if not names:
        for t in L["tenants"]:
            t.pop("name", None)
    L["anonymized"] = not names
    return {"listingId": fx["meta"]["listingId"], **L}


def presence(fx: dict) -> dict:
    return {"listingId": fx["meta"]["listingId"], **fx["presence"]}


def triage(fx: dict, real: dict | None) -> dict:
    """Fixture triage fields; CoStar values and evidence refs come from the real triage result when it has them."""
    realf = {f["field"]: f for f in (real or {}).get("fields", [])}
    fields = []
    for f in fx["triage"]["fields"]:
        r = realf.get(f["field"]) or {}
        costar = r.get("costarValue") if r.get("costarValue") is not None else f.get("costarValue")
        out = {"evidenceRefs": r.get("evidenceRefs") or [], "rule": r.get("rule") or "Hand-authored demo rule; not a measurement.",
               "reviewScore": r.get("reviewScore", 0.0), **f, "costarValue": costar}
        fields.append(out)
    return {"listingId": str(fx["meta"]["listingId"]), "hasScan": True, "hasAerial": True, "scope": "suite", "fields": fields, "demo": True,
            "demoNote": f"{DEMO}: {fx['triage']['demoNote']}"}


def aerial(fx: dict) -> dict:
    return {"listingId": fx["meta"]["listingId"], "demo": True, **fx["aerial"]}


def inspection(fx: dict) -> dict:
    return {"findings": json.loads(json.dumps(fx["inspection"]["findings"])), "mode": "demo", "notice": fx["inspection"]["notice"]}


def projection_cards(fx: dict) -> list[dict]:
    p = fx["projections"]
    out = []
    for c in p["cards"]:
        for horizon, (lo, pt, hi) in c["rows"].items():
            out.append({"kind": "scenario", "status": "estimated", "metric": c["metric"], "horizon": horizon, "scenario": p["scenario"],
                        "point": pt, "lower": lo, "upper": hi, "unit": c["unit"], "method": p["method"], "citation": None,
                        "trainingWindow": None, "validation": [], "hidden": False, "hiddenReason": ""})
    return out


def horizon_rows(fx: dict, rows: list[dict]) -> list[dict]:
    """The real horizon rows with each cell the fixture authors replaced by an estimated demo card."""
    h = fx["horizons"]
    out = []
    if not rows:  # no horizon artifacts on this machine: the same row keys with every cell not yet authored left as cannot_say
        from forecasting.horizons.build import COLUMNS, ROWS
        rows = [{"key": k, "label": lab, "cells": {c: {"state": "cannot_say", "cards": [], "reason": "no fitted or published source for this metric and horizon in the repo"} for c in COLUMNS}} for k, lab in ROWS]
    for r in rows:
        r = json.loads(json.dumps(r))
        for col, (pt, unit, lo, hi) in h["rows"].get(r["key"], {}).items():
            r["cells"][col] = {"state": "estimated", "reason": f"{DEMO}: hand-authored value, not fitted or published",
                               "cards": [{"kind": "scenario", "status": "estimated", "metric": r["label"], "horizon": col, "scenario": "base case (demo estimate)",
                                          "point": pt, "lower": lo, "upper": hi, "unit": unit, "method": h["note"], "citation": None,
                                          "trainingWindow": None, "validation": [], "hidden": False, "hiddenReason": ""}]}
        out.append(r)
    return out


def rent_response(fx: dict) -> dict:
    rl = fx["rentLease"]
    card = {"kind": "scenario", "status": "estimated", "metric": "expected asking rent", "horizon": "current listing",
            "scenario": "DEMO DATA: hand-authored asking rent", "point": rl["askingRentPerSfYear"], "lower": rl["askingRentRange"]["low"],
            "upper": rl["askingRentRange"]["high"], "unit": "USD/sf/yr", "method": rl["source"], "citation": None, "trainingWindow": None,
            "validation": [], "hidden": False, "hiddenReason": ""}
    return {"listingId": fx["meta"]["listingId"], "card": card, "asking": rl["askingRentPerSfYear"], "flag": "in_range",
            "flagMeaning": "DEMO DATA: asking sits inside the hand-authored range; not a model result", "expectationSource": rl["source"],
            "contributions": [], "label": "DEMO DATA: hand-authored rent and lease terms, not a market appraisal", "lease": rl}


def demo_factor_cards(fx: dict, real: list | None = None):
    """Real local demo cards that hold data, plus the fixture's cards for every factor the real ones leave unknown or lack."""
    from .models import FactorCard
    real = list(real or [])
    authored = {c["factorId"] for c in fx["factors"]}
    have = {c.factorId for c in real if c.status in ("observed", "derived")}
    # A real card that only estimates (for example an ACS value with a margin of error) yields to the fixture's card for that factor.
    cards = [c for c in real if c.status in ("observed", "derived") or (c.status == "estimated" and c.factorId not in authored)]
    cards += [FactorCard(**c) for c in fx["factors"] if c["factorId"] not in have]
    return cards


def readiness(cards) -> int:
    from .readiness import evidence_readiness
    return evidence_readiness(cards)


def apply_match(m, real_factor_cards: list | None = None):
    """Overlay the fixture on a cafe-scan Match (area, rent, facts, factors, readiness); returns it."""
    fx = get(m.listingId, m.tourId)
    if fx is None:
        return m
    from .models import Fact
    mt = fx["match"]
    m.squareFeet = mt["squareFeet"]  # the card prices rent from this; the suite area, not the building
    m.spaceSquareFeet = mt["spaceSquareFeet"]
    m.rentPerSquareFootYear = mt["rentPerSquareFootYear"]
    m.blurb = mt["blurb"]
    keep = [f for f in m.facts.property if f.label not in {x["label"] for x in mt["facts"]["property"]} and f.label not in ("Use", "Space Available", "Floor area")]
    m.facts.property = [Fact(**x) for x in mt["facts"]["property"]] + keep
    m.factors = demo_factor_cards(fx, real_factor_cards)
    m.evidenceReadiness = readiness(m.factors)
    return m


def climate_metrics(fx: dict, base: dict) -> dict:
    """The sourced sea-level series stays; hot days, flood depth, cooling and insurance deltas come from the fixture (labelled demo)."""
    c = fx["climate"]
    series = {"days": c["hotDays95F"], "depth": {k: v for k, v in c["floodDepth100yrFt"].items() if k != "today"},
              "cool": c["costDeltas"]["coolingUsdPerYear"], "ins": c["costDeltas"]["floodInsuranceUsdPerYear"]}
    today = {"days": c["heatDaysToday"], "depth": c["floodDepth100yrFt"]["today"]}
    out = json.loads(json.dumps(base))
    for m in out.get("metrics", []):
        if m["id"] in series:
            m["series"] = {s: {str(h): v for h, v in hs.items()} for s, hs in series[m["id"]].items()}
            m["today"] = today.get(m["id"], m["today"])
            m["note"] = f"{DEMO}: hand-authored scenario values; not a forecast"
    return out
