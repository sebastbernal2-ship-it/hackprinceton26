"""Per-property horizon table: metrics x horizon buckets. Every cell is observed | fitted | published | cannot_say | pending.

Nothing is estimated here. Cells are filled only from (a) gated, non-hidden fitted ProjectionCards whose citation geography is
exactly the listing's city, (b) published sources/scenarios carrying a citation and retrieval date, (c) observed snapshot values.
Everything else is 'cannot_say' with a reason, or 'pending' when the upstream artifact has not been produced yet.
"""
from __future__ import annotations

import csv
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
for p in (ROOT, ROOT / "services" / "api"):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))
from app.models import SCENARIO_LABEL, ProjectionCard  # noqa: E402
from structure import scenarios as scen, screening  # noqa: E402

COLUMNS = ["now", "12m", "3_5y", "2030", "2050", "2070"]
SPAN = {"12m": (2027, 2027), "3_5y": (2029, 2031), "2030": (2030, 2030), "2050": (2050, 2050), "2070": (2070, 2070)}
ROWS = [("rent_level", "Rent level"), ("leasing_volume", "Leasing volume"), ("crime_context", "Crime context (reported incidents, not a rate)"),
        ("labor_wage", "Labor wage"), ("climate_seasonality", "Climate seasonality / warming"), ("heat_days", "Heat days"),
        ("sea_level_flood", "Sea-level / flood exposure"), ("population_trend", "Population / demographic trend"),
        ("traffic_trend", "Traffic trend"), ("tenancy_survival", "Tenancy survival prior"), ("rent_expectation", "Rent expectation")]
CITIES = {"los angeles": "Los Angeles", "houston": "Houston"}
STATES = {"CA": "California", "TX": "Texas"}
PTYPE = {"GeneralRetail": "retail", "Office": "office", "Multifamily": "multifamily", "Industrial": "industrial", "Hospitality": "hospitality", "Flex": "flex"}
NOTICE = ("Fitted cells are scenario/estimate cards that passed a pre-declared held-out gate; published cells are cite-only or published "
          "scenarios, not our forecasts. 'cannot_say' means no gated or cited source exists; unknown is never zero.")
# row -> (artifact source, metric regex)
SERIES_ROWS = {"crime_context": r"reported crime", "labor_wage": r"average hourly earnings", "climate_seasonality": r"air temperature",
               "traffic_trend": r"\baadt\b",
               # CoStar-kit quarterly series (metro level, kit sample, not market statistics); the card metric says so
               "rent_level": r"median contract rent", "leasing_volume": r"lease commencements|leased (?:square|sq)"}
RENT_ROWS = {"rent_expectation": r"rent"}  # leasing volume comes from the series artifact (SERIES_ROWS), not the rent model


def _env(name, default):
    return Path(os.environ.get(name, default))


def paths():
    return {"series": _env("HORIZONS_SERIES_DIR", ROOT / "data/derived/series"),
            "survival": _env("HORIZONS_SURVIVAL_DIR", ROOT / "forecasting/artifacts/survival"),
            "rent": _env("HORIZONS_RENT_DIR", ROOT / "forecasting/artifacts/rent"),
            "hazard": _env("HORIZONS_HAZARD_DIR", ROOT / "forecasting/artifacts/hazard"),
            "structure": _env("STRUCTURE_DIR", ROOT / "data/derived/structure"),
            "published": _env("HORIZONS_PUBLISHED", ROOT / "config/published_sources.json"),
            "factors": _env("HORIZONS_FACTORS", ROOT / "data/normalized/costar/factor-cards.csv")}


def _json(f: Path):
    try:
        return json.loads(f.read_text(encoding="utf-8")) if f.is_file() else None
    except (OSError, ValueError):
        return None


def load_artifact(d: Path) -> dict:
    """{'present': bool, 'cards': [...], 'gate_failed': reason|None}. Absent dir/file -> present False (pending)."""
    raw = _json(d / "cards.json")
    cards = raw.get("cards") if isinstance(raw, dict) else raw
    m = _json(d / "metrics.json")
    failed = None
    if isinstance(m, dict) and isinstance(m.get("gate"), dict) and m["gate"].get("passed") is False:
        failed = "gate failed on held-out split: " + "; ".join(map(str, m["gate"].get("reasons") or ["no reason recorded"]))[:300]
    rep, preds = _json(d / "report.json"), _json(d / "predictions.json")
    if isinstance(rep, dict) and rep.get("segments") and not cards:
        # the rent pipeline writes report.json + predictions.json (not cards.json); no predictions = every segment failed its gate
        if not preds and failed is None:
            reasons = sorted({str(r) for v in rep["segments"].values() for r in ((v.get("gate") or {}).get("reasons") or [])})
            failed = "gate failed on held-out splits in every segment: " + "; ".join(reasons)[:300]
    return {"present": cards is not None or failed is not None or isinstance(rep, dict), "cards": cards or [], "gate_failed": failed,
            "predictions": bool(preds)}


def months(horizon: str) -> int | None:
    m = re.search(r"(\d+)\s*month", horizon or "", re.I)
    if m:
        return int(m.group(1))
    m = re.search(r"(\d+)\s*quarter", horizon or "", re.I)
    if m:
        return int(m.group(1)) * 3
    m = re.search(r"(\d+)\s*year", horizon or "", re.I)
    return int(m.group(1)) * 12 if m else None


def bucket(card: dict) -> str | None:
    n = months(card.get("horizon", ""))
    return "12m" if n == 12 else "3_5y" if n is not None and 36 <= n <= 60 else None


def cities_in(text: str) -> set[str]:
    t = (text or "").lower()
    return {v for k, v in CITIES.items() if k in t}


def accept(card: dict) -> tuple[dict | None, str | None]:
    """Re-validate with the authoritative ProjectionCard. Fitted cards must be non-hidden, estimated and fully passed."""
    try:
        c = ProjectionCard.model_validate(card).model_dump(mode="json")
    except Exception as e:  # noqa: BLE001
        return None, f"card failed contract validation: {str(e)[:120]}"
    if c["hidden"]:
        return None, c["hiddenReason"] or "hidden card"
    if c["kind"] == "fitted" and (c["status"] != "estimated" or not c["validation"] or not all(v["passed"] for v in c["validation"])):
        return None, "fitted card without passed validation"
    if c["kind"] == "published" and not (c["citation"] or {}).get("asOf"):
        return None, "published card lacks retrieval date"
    return c, None


def cell(state: str, cards=None, reason: str = "", observed=None) -> dict:
    out = {"state": state, "cards": cards or [], "reason": reason}
    if observed is not None:
        out["observed"] = observed
    return out


def cannot(reason): return cell("cannot_say", reason=reason)
def pending(reason): return cell("pending", reason=reason)


def _pick(art: dict, art_name: str, pattern: str, city: str, col: str, extra=None):
    """Fitted cell from an artifact: cards matching metric, bucket, exact-city citation geography."""
    if not art["present"]:
        return pending(f"{art_name} artifact not produced yet")
    if art["gate_failed"]:
        return cannot(art["gate_failed"])
    hits, why = [], []
    for c in art["cards"]:
        if not re.search(pattern, c.get("metric", ""), re.I) or bucket(c) != col:
            continue
        if cities_in((c.get("citation") or {}).get("geography", "")) != {city}:
            continue
        if extra and not extra(c):
            continue
        ok, reason = accept(c)
        (hits if ok else why).append(ok or reason)
    if len(hits) == 1 or (hits and art_name in ("survival", "hazard")):
        return cell("fitted", hits)
    if len(hits) > 1:
        return cannot(f"{len(hits)} cards match this metric in {city} with no site-to-series link; refusing to pick one")
    return cannot("; ".join(sorted(set(why))) if why else f"no gated {art_name} card for this city and horizon")


def _published_pop(p, src, col):
    state = STATES.get((p.get("state") or "").upper())
    out = []
    for s in src.get("sources", []):
        if s.get("kind") != "population projection" or not state or state.lower() not in s.get("geography", "").lower():
            continue
        if any(o.lower() in s["geography"].lower() for o in STATES.values() if o != state):
            continue
        m = re.match(r"(\d{4})\D+(\d{4})", s.get("horizon", ""))
        lo, hi = SPAN[col]
        if not m or not (int(m[1]) <= lo and hi <= int(m[2])):
            continue
        card = {"kind": "published", "status": "unknown", "metric": s["title"], "horizon": s["horizon"],
                "scenario": "as published by the source (" + SCENARIO_LABEL + ")",
                "method": f"Cite-only pointer to {s['publisher']} {s['kind']}; values are not extracted or recomputed here.",
                "citation": {"source": f"{s['publisher']}: {s['title']}", "recordId": s["url"], "asOf": s.get("retrieved", ""),
                             "geography": s["geography"], "limitations": s["limitations"]}}
        ok, _ = accept(card)
        if ok:
            out.append(ok)
    return cell("published", out) if out else None


def _scenario_cards(p, fetch, reg, unit, col):
    year = int(col)
    out = []
    for r in scen.table(fetch, reg)["rows"]:
        if r["horizon"] != year or r["unit"] != unit or not r.get("citation") or not r.get("retrieved"):
            continue
        if not (r["low"] <= r["value"] <= r["high"]):
            continue
        card = {"kind": "published", "status": "estimated", "metric": r["metric"], "horizon": str(year), "scenario": r["scenario"],
                "point": r["value"], "lower": r["low"], "upper": r["high"], "unit": unit,
                "method": f"{r['note']}. {SCENARIO_LABEL}.",
                "citation": {"source": r["scenario"], "recordId": str(r["citation"]), "asOf": r["retrieved"],
                             "geography": r["station"], "limitations": scen.NOTICE}}
        ok, _ = accept(card)
        if ok:
            out.append(ok)
    return out


def build_table(p: dict, *, ptype: str | None = None, factors: list[dict] | None = None, arts: dict | None = None,
                published: dict | None = None, fetch: dict | None = None) -> dict:
    """p: property dict with city/state/(fema, elevationFt). arts: {'series','survival','rent','hazard'} -> load_artifact result."""
    city = next(iter(cities_in(p.get("city", ""))), None)
    reg = screening.region(p.get("city"), p.get("state"))
    absent = {"present": False, "cards": [], "gate_failed": None}
    arts = arts or {}
    A = {k: arts.get(k, absent) for k in ("series", "survival", "rent", "hazard")}
    published = published or {}
    seg = PTYPE.get(ptype or "")
    table = {k: {} for k, _ in ROWS}
    for key, _ in ROWS:
        for col in COLUMNS:
            table[key][col] = cannot("no fitted or published source for this metric and horizon in the repo")
    if not city:
        for key, _ in ROWS:
            for col in COLUMNS:
                table[key][col] = cannot("listing city is not one of the covered markets; no cross-city substitution")
        return _wrap(p, table)
    fx = {f.get("factor_id"): f for f in (factors or []) if f.get("status") == "observed"}
    # now
    if "crime_safety" in fx:
        f = fx["crime_safety"]
        table["crime_context"]["now"] = cell("observed", observed={k: f.get(k) for k in ("value", "unit", "source", "time_window", "geography", "uncertainty")})
    if p.get("fema") or p.get("elevationFt") is not None:
        table["sea_level_flood"]["now"] = cell("observed", observed={"femaZone": (p.get("fema") or {}).get("zone"), "elevationFt": p.get("elevationFt"),
                                                                   "retrieved": p.get("retrieved"), "note": "today's map; not a projection"})
    rent_absent = not A["rent"]["present"]
    table["rent_level"]["now"] = (pending("rent artifact not produced yet; kit snapshot carries listing status only, no asking rent in factor cards")
                                  if rent_absent else cannot("no observed asking-rent value surfaced for this property"))
    # the rent model estimates today's building-based asking rent (a current-listing estimate, not a forecast)
    if rent_absent:
        table["rent_expectation"]["now"] = pending("rent artifact not produced yet")
    elif A["rent"].get("gate_failed"):
        table["rent_expectation"]["now"] = cannot(A["rent"]["gate_failed"])
    elif A["rent"].get("predictions"):
        table["rent_expectation"]["now"] = pending("rent estimates exist; the per-listing card is served at /api/rent/{id}")
    for col in ("12m", "3_5y", "2030", "2050", "2070"):
        table["rent_level"][col] = cannot("future rent is carried in the rent_expectation row; level is observed now only")
    # fitted rows
    for key, pat in SERIES_ROWS.items():
        for col in ("12m", "3_5y"):
            table[key][col] = _pick(A["series"], "series", pat, city, col)
    for col in ("12m", "3_5y"):
        c1 = _pick(A["survival"], "survival", r"tenanc", city, col, extra=(lambda c, s=seg: bool(s) and f"in {s} space" in c.get("metric", "")))
        h = _pick(A["hazard"], "hazard", r"hazard|tenanc|closure", city, col,
                  extra=(lambda c, s=seg: bool(s) and f"in {s} space" in c.get("metric", "")))  # priors are per property type
        if c1["state"] == "fitted":
            table["tenancy_survival"][col] = c1
        elif h["state"] == "fitted":
            table["tenancy_survival"][col] = h
        elif not A["survival"]["present"] and not A["hazard"]["present"]:
            table["tenancy_survival"][col] = pending("survival and hazard artifacts not produced yet")
        else:
            table["tenancy_survival"][col] = c1 if A["survival"]["present"] else h
        for key, pat in RENT_ROWS.items():
            table[key][col] = _pick(A["rent"], "rent", pat, city, col)
    # published / scenario
    for col in ("12m", "3_5y", "2030", "2050", "2070"):
        c = _published_pop(p, published, col)
        if c:
            table["population_trend"][col] = c
    for col in ("2030", "2050", "2070"):
        if reg == "LA":
            sl = _scenario_cards(p, fetch, reg, "cm", col)
            if sl:
                table["sea_level_flood"][col] = cell("published", sl)
            heat = _scenario_cards(p, fetch, reg, "degC", col)
            if heat:
                table["climate_seasonality"][col] = cell("published", heat)
        elif reg == "HOU":
            table["sea_level_flood"][col] = cannot("inland site; NOAA scenarios are tide-gauge based (nearest gauge is Galveston), not site-level")
        table["heat_days"][col] = cannot("no sourced projection of heat-day counts (Cal-Adapt retrieval gives annual mean daily max temperature, not threshold-day counts)")
    for col in ("12m", "3_5y"):
        table["heat_days"][col] = cannot("no heat-day series or validated model in the repo")
    return _wrap(p, table)


def _wrap(p, table) -> dict:
    counts: dict[str, int] = {}
    for k in table.values():
        for c in k.values():
            counts[c["state"]] = counts.get(c["state"], 0) + 1
    return {"city": p.get("city"), "state": p.get("state"), "columns": COLUMNS,
            "rows": [{"key": k, "label": l, "cells": table[k]} for k, l in ROWS], "counts": counts, "notice": NOTICE}


def load_context() -> dict:
    P = paths()
    f = P["factors"]
    factors = []
    if f.is_file():
        with f.open(encoding="utf-8", newline="") as fh:
            factors = list(csv.DictReader(fh))
    return {"paths": P, "props": _json(P["structure"] / "properties.json"), "fetch": _json(P["structure"] / "climate_fetch.json"),
            "published": _json(P["published"]) or {}, "factors": factors,
            "arts": {k: load_artifact(P[k]) for k in ("series", "survival", "rent", "hazard")}}


def table_for(listing_id, ctx: dict, ptypes: dict | None = None) -> dict | None:
    p = (ctx["props"] or {}).get(str(listing_id))
    if p is None:
        return None
    fx = [r for r in ctx["factors"] if str(r.get("property_id")) == str(listing_id)]
    t = build_table(p, ptype=(ptypes or {}).get(str(listing_id)), factors=fx, arts=ctx["arts"], published=ctx["published"], fetch=ctx["fetch"])
    return {"listingId": listing_id, **t, "artifacts": {k: ("present" if v["present"] else "absent") for k, v in ctx["arts"].items()}}


def summary(ctx: dict, ptypes: dict | None = None) -> dict:
    tot: dict[str, int] = {}
    per_row: dict[str, dict[str, int]] = {}
    n = 0
    for lid in ctx["props"] or {}:
        t = table_for(lid, ctx, ptypes)
        n += 1
        for r in t["rows"]:
            for c in r["cells"].values():
                tot[c["state"]] = tot.get(c["state"], 0) + 1
                d = per_row.setdefault(r["key"], {})
                d[c["state"]] = d.get(c["state"], 0) + 1
    return {"properties": n, "cellsPerProperty": len(ROWS) * len(COLUMNS), "cells": tot, "byRow": per_row}


def ptypes_from_candidates(f: Path | None = None) -> dict:
    f = f or _env("HORIZONS_CANDIDATES", ROOT / "data/normalized/costar/restaurant-site-candidates.csv")
    if not f.is_file():
        return {}
    with f.open(encoding="utf-8", newline="") as fh:
        return {r["property_id"]: r["property_type"] for r in csv.DictReader(fh)}


if __name__ == "__main__":
    s = summary(load_context(), ptypes_from_candidates())
    print(json.dumps(s, indent=1))
