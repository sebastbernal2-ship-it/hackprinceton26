"""Analyses for every site the picker can show: the CoStar candidates and the cafe scans.

Real analyses read precomputed artifacts (triage, aerial, structure, lineage, presence). Where one cannot run (a cafe scan has no
CoStar candidate row, a model key is absent, a blank could not be filled) this module builds a deterministic, credit-free result
from the facts we hold, labelled DEMO ESTIMATE (status estimated/derived) and never presented as observed. Results that are built
from scratch are cached on disk under DERIVED_DIR/runall (inspection under the inspection dir) so each is computed once.
"""
from __future__ import annotations

import json
import os
import statistics
import sys
import threading
from collections import Counter
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from inspection.demo import build_demo  # noqa: E402

V = 1  # bump to invalidate every cached demo result
M_PER_FT = 0.3048
DEMO = "DEMO ESTIMATE"
_lock = threading.Lock()


# ---------------------------------------------------------------- locations
def derived_root() -> Path:
    return Path(os.environ.get("DERIVED_DIR", "data/derived"))


def inspection_dir() -> Path:
    e = os.environ.get("INSPECTION_DIR")
    return Path(e) if e else derived_root() / "inspection"


def _cache_path(kind: str, lid: int) -> Path:
    return derived_root() / "runall" / kind / f"{lid}.json"


def _read(p: Path):
    try:
        return json.loads(p.read_text(encoding="utf-8")) if p.is_file() else None
    except (OSError, ValueError):
        return None


_BIG: dict = {}


def _read_big(p: Path):
    """_read for the large shared artifacts (triage results, structure snapshot, lineage): parsed once until the file changes.
    Callers must not mutate what they get back."""
    try:
        key = (str(p), p.stat().st_mtime_ns)
    except OSError:
        return None
    if key not in _BIG:
        for k in [k for k in _BIG if k[0] == key[0]]:
            del _BIG[k]
        _BIG[key] = _read(p)
    return _BIG[key]


def _write(p: Path, obj) -> None:
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(f".{os.getpid()}.{threading.get_ident()}.tmp")
        tmp.write_text(json.dumps(obj), encoding="utf-8")
        tmp.replace(p)
    except OSError:
        pass  # a read-only checkout still answers, just without the disk cache


def cached(kind: str, lid: int, build, force: bool = False):
    p = _cache_path(kind, lid)
    if not force:
        hit = _read(p)
        if hit is not None and hit.get("_v") == V:
            return hit["data"]
    data = build()
    if data is not None:
        _write(p, {"_v": V, "data": data})
    return data


# ---------------------------------------------------------------- sources
def _match(lid: int):
    from . import loader
    return next((m for m in loader.load_matches() or [] if m.listingId == lid), None)


def pool_ids() -> list[int]:
    from . import loader
    return [m.listingId for m in loader.load_matches() or []]


def _load_derived(*parts: str):
    return _read(derived_root().joinpath(*parts))


def _triage_dir() -> Path:
    return Path(os.environ.get("TRIAGE_DERIVED_DIR", "data/derived/triage"))


def real_triage(lid: int):
    for r in _read_big(_triage_dir() / "results.json") or []:
        if r.get("listingId") == str(lid):
            return r
    return None


def real_aerial(lid: int):
    return _read(Path(os.environ.get("AERIAL_DIR", "data/derived/triage/aerial/properties")) / f"{lid}.json")


def _structure_dir() -> Path:
    return Path(os.environ.get("STRUCTURE_DIR", "data/derived/structure"))


def _lineage_dir() -> Path:
    return Path(os.environ.get("LINEAGE_DIR", "data/derived/lineage"))


def _cafe_scan(lid: int):
    from . import picker
    return next((s for s in picker.CAFE_SCANS if s["listingId"] == lid), None)


def costar_id(lid: int) -> int | None:
    """The CoStar PropertyId a site is linked to: the candidate's own id, or a cafe scan's linked property (none for -2)."""
    return lid if lid > 0 else None


def walk_summary(tour: str | None) -> dict | None:
    """What the local walk export says about a scan: ceiling height (bbox), footprint and object kinds. None without an export."""
    if not tour:
        return None
    meta = _read(Path(os.environ.get("SCAN_ASSETS_DIR", ".")) / f"assets_{tour}" / "walk" / "meta.json")
    if not meta or not meta.get("bbox"):
        return None
    lo, hi = meta["bbox"]
    kinds = Counter((p.get("kind") or "object") for p in meta.get("pieces") or [])
    return {"ceilingM": round(hi[2] - max(lo[2], 0.0), 2), "widthM": round(hi[0] - lo[0], 1), "depthM": round(hi[1] - lo[1], 1),
            "objects": sum(kinds.values()), "kinds": dict(kinds)}


def _kit_record(pid: int):
    """Raw CoStar kit property record for a linked property, or None (kit absent or id unknown)."""
    try:
        from data.costar import client
        k = client.kit()
        return k.props.get(pid) if k.available() else None
    except Exception:  # noqa: BLE001  the kit is optional locally
        return None


def kit_structure_props(pid: int, match) -> dict | None:
    """Structure-screen inputs for a property the structure snapshot does not hold, from the CoStar kit only (hazard layers
    are NOT fetched here: no network in the API). None when the kit has no such property."""
    from structure.fetch_sources import CLASS, MATERIAL
    r = _kit_record(pid)
    if r is None:
        return None
    ev = r.get("constructionEvents") or []
    yr = [e["year"] for e in ev if e.get("eventType") == 2 and e.get("year")]
    rn = [e["year"] for e in ev if e.get("eventType") == 4 and e.get("year")]
    a = r.get("primaryAddress") or {}
    city, _, state = (match.city if match else "").partition(",")
    return {"yearBuilt": min(yr) if yr else None, "renovatedYear": max(rn) if rn else None, "material": MATERIAL.get(r.get("buildingConstructionMaterial")),
            "buildingClass": CLASS.get(r.get("buildingClass")), "stories": r.get("numStoriesAboveGrade"),
            "grossSqFt": r.get("grossBuildingAreaSquareFeet"), "heightFt": r.get("buildingHeightInFeet"), "hasSprinklers": r.get("hasSprinklers"),
            "lat": a.get("latitude"), "lon": a.get("longitude"), "city": city.strip() or a.get("city"), "state": state.strip() or a.get("state"),
            "fema": {"zone": None, "error": "not fetched (kit fields only)"}, "usgs": {"error": "not fetched (kit fields only)"}, "elevationFt": None,
            "demo": True, "demoNote": f"{DEMO}: building fields come from the linked CoStar record; FEMA flood and USGS seismic layers were not fetched for this scan."}


def structure_props(lid: int):
    """Structure props for a pool site the snapshot lacks (cached), else None."""
    from . import demo_fixture
    if (fx := demo_fixture.get(lid)):
        return demo_fixture.structure_props(fx)
    def build():
        m = _match(lid)
        if m is None:
            return None
        p = kit_structure_props(lid, m) if costar_id(lid) else None
        if p is None:
            city, _, state = m.city.partition(",")
            p = {"yearBuilt": None, "renovatedYear": None, "material": None, "buildingClass": None, "stories": None, "grossSqFt": None,
                 "heightFt": None, "hasSprinklers": None, "city": city.strip(), "state": state.strip(), "fema": {"zone": None, "error": "no coordinates"},
                 "usgs": {"error": "no coordinates"}, "elevationFt": None, "demo": True,
                 "demoNote": f"{DEMO}: this scan has no linked CoStar building, so the screen uses the metro only; every building field is unknown, not defaulted."}
        return p
    return cached("structure", lid, build)


# ---------------------------------------------------------------- facts
def _field(r: dict | None, name: str):
    f = next((x for x in (r or {}).get("fields", []) if x["field"] == name), None)
    if not f:
        return None
    for k in ("scanValue", "value", "costarValue"):
        if f.get(k) is not None:
            return f[k]
    return None


def site_facts(lid: int) -> dict | None:
    """One dict of everything we hold on a site, from files only. None for a listing the picker cannot show."""
    m = _match(lid)
    if m is None:
        return None
    tri, aer, tour = real_triage(lid), real_aerial(lid), m.tourId
    props = _read_big(_structure_dir() / "properties.json") or {}
    sp = props.get(str(lid)) or structure_props(lid) or {}
    lin = (_read_big(_lineage_dir() / "lineage.json") or {}).get(str(lid))
    walk = walk_summary(tour)
    toilets = ((walk or {}).get("kinds") or {}).get("toilet")
    cs = _cafe_scan(lid)
    sqft = m.spaceSquareFeet or _field(tri, "area_sqft")
    ru = _field(tri, "rooftop_units")
    if ru is None and aer:
        ru = ((aer.get("rooftop_units") or {}).get("expected"))
    return {"listingId": lid, "name": (cs or {}).get("name") or m.detail or m.address, "address": m.address, "city": m.city, "tourId": tour,
            "sqft": round(sqft) if sqft else None, "sqftBasis": m.spaceSource, "kind": m.propertySubtype or ("cafe scan" if cs else ""),
            "isCafeScan": bool(cs), "hasScan": bool(walk or (tri or {}).get("hasScan") or tour), "hasAerial": bool(aer) and (tri or {}).get("hasAerial", True),
            "ceilingM": (walk or {}).get("ceilingM"), "clearHeightFt": _field(tri, "clear_height_ft"), "walk": walk,
            "restrooms": _field(tri, "restroom_count") if tri else toilets or None,
            "restroomsBasis": "scan" if (tri and any(x["field"] == "restroom_count" and x.get("scanValue") is not None for x in tri["fields"])) or toilets else None,
            "stories": sp.get("stories"), "yearBuilt": sp.get("yearBuilt"), "renovatedYear": sp.get("renovatedYear"), "hasSprinklers": sp.get("hasSprinklers"),
            "foodSpells": ((lin or {}).get("counts") or {}).get("foodTenants") or 0, "rooftopUnits": round(ru) if isinstance(ru, (int, float)) else None,
            "heightFt": sp.get("heightFt"), "match": m}


# ---------------------------------------------------------------- inspection
def inspection_for(lid: int, force: bool = False) -> dict | None:
    """Findings for a site, from the inspection dir if one was written (python -m inspection.run, or this tool), else built and cached."""
    from . import demo_fixture
    if (fx := demo_fixture.get(lid)):
        return demo_fixture.inspection(fx)
    p = inspection_dir() / f"{lid}.json"
    if not force and p.is_file():
        d = _read(p)
        if d and d.get("findings") is not None and d.get("mode") in ("live", "fixture", "demo"):
            return d
    facts = site_facts(lid)
    if facts is None:
        return None
    out = build_demo({k: v for k, v in facts.items() if k not in ("match", "walk")})
    _write(p, out)
    return out


# ---------------------------------------------------------------- triage
def _est(field, value, note, unit="", scope="suite", basis="derived", conf="low", refs=None):
    return {"field": field, "status": "filled", "costarValue": None, "scanValue": value, "aerialValue": None, "value": value, "valueStatus": basis,
            "unit": unit, "scope": scope, "confidence": conf, "evidenceRefs": refs or [], "rule": "Deterministic demo rule from the facts we hold; not a measurement.",
            "note": note, "reviewScore": 0.0}


def demo_value(field: str, f: dict):
    """(value, how) for a field nothing could settle. Rules use what we know of the site; constants only when nothing is known."""
    sqft = f.get("sqft") or 1200
    if field == "clear_height_ft":
        if f.get("ceilingM"):
            return round(f["ceilingM"] / M_PER_FT, 1), "walk export bounding box, highest point"
        if f.get("heightFt") and f.get("stories"):
            return round(max(9.0, f["heightFt"] / f["stories"] - 3), 1), "CoStar building height per story less a 3 ft floor build-up"
        return 12, "typical street-retail ceiling"
    if field == "floors":
        return f.get("stories") or 1, "CoStar stories, else single storey"
    if field == "area_sqft":
        return sqft, "listed or scan area, else assumed demo area"
    if field == "restroom_count":
        return f.get("restrooms") or max(1, round(sqft / 1500)), "one per 1,500 sq ft (assumption)"
    if field == "kitchen_present":
        return ("yes", "prior food-service tenancy or café scan") if (f.get("foodSpells") or f.get("isCafeScan")) else ("no", "no food-service history on file")
    if field == "use_hint":
        return ("cafe" if f.get("isCafeScan") else (f.get("kind") or "retail")), "scan name or CoStar subtype"
    if field == "parking_spaces":
        return max(4, round(sqft / 250)), "about one stall per 250 sq ft (assumption)"
    if field == "rooftop_units":
        return f.get("rooftopUnits") or max(1, round(sqft / 2500)), "aerial count, else one unit per 2,500 sq ft (assumption)"
    if field == "loading_docks":
        return (1 if sqft > 6000 else 0), "one dock above 6,000 sq ft (assumption)"
    return 1, "placeholder"


FIELDS = ("clear_height_ft", "floors", "area_sqft", "restroom_count", "kitchen_present", "use_hint", "parking_spaces", "rooftop_units", "loading_docks")
UNITS = {"clear_height_ft": "ft", "area_sqft": "sqft"}


def complete_triage(r: dict, f: dict) -> dict:
    """A real triage result with its blanks and awaiting-site-check fields filled by labelled demo estimates (real statuses kept in realStatus)."""
    out = dict(r)
    fields = []
    for x in r["fields"]:
        x = dict(x)
        if x["status"] in ("blank-unfillable", "unverified"):
            was, cv = x["status"], x.get("costarValue")
            if was == "unverified" and cv is not None:
                v, how = cv, "the CoStar record value, not independently measured"
            else:
                v, how = demo_value(x["field"], f)
            x.update(status="filled", scanValue=v, value=v, valueStatus="estimated", confidence="low", realStatus=was,
                     note=f"{DEMO}: {how}. Not a measurement.")
        fields.append(x)
    out["fields"] = fields
    return out


def scan_only_triage(f: dict) -> dict:
    walk = f.get("walk")
    fields = []
    for name in FIELDS:
        v, how = demo_value(name, f)
        derived = (name == "clear_height_ft" and f.get("ceilingM")) or (name == "floors" and walk) or (name == "restroom_count" and f.get("restroomsBasis") == "scan")
        refs = [{"source": "matterport", "ref": "walk export", "detail": how}] if derived else []
        fields.append(_est(name, v, ("Derived from the scan walk export: " if derived else f"{DEMO}: ") + how + ".", UNITS.get(name, ""),
                           scope="room" if name == "clear_height_ft" else "suite", basis="derived" if derived else "estimated",
                           conf="medium" if derived else "low", refs=refs))
    return {"listingId": str(f["listingId"]), "hasScan": bool(f.get("walk")), "hasAerial": False, "scope": "suite", "fields": fields,
            "demo": True, "demoNote": f"{DEMO}: a scan has no CoStar candidate row, so these values come from the walk export and stated rules."}


def triage_for(lid: int) -> dict | None:
    from . import demo_fixture
    if (fx := demo_fixture.get(lid)):
        return demo_fixture.triage(fx, real_triage(lid))
    f = site_facts(lid)
    real = real_triage(lid)
    if real:
        return complete_triage(real, f or {"listingId": lid})
    if f is None:
        return None
    return cached("triage", lid, lambda: scan_only_triage({k: v for k, v in f.items() if k != "match"}))


# ---------------------------------------------------------------- aerial
def _rng(expected, spread, rationale, label=None):
    e = max(0, round(expected))
    return {"status": "estimated", "low": max(0, round(e * (1 - spread))), "expected": e, "high": round(e * (1 + spread)),
            "label": label or "demo estimate", "rationale": f"{DEMO}: {rationale}"}


def scan_only_aerial(f: dict) -> dict:
    sqft = f.get("sqft") or 1200
    why = f"no aerial capture was fetched for this scan; scaled from the {sqft:,} sq ft area ({f.get('sqftBasis') or 'assumed'})"
    return {"listingId": f["listingId"], "demo": True,
            "imagery": {"source": f"{DEMO}: no Vexcel capture for this scan", "fetched": "n/a", "capture_date": None,
                        "capture_date_note": "no imagery used", "centred_on": "no coordinates on file" if costar_id(f["listingId"]) is None else "linked CoStar property (not fetched)"},
            "vehicles": _rng(sqft / 60, 0.5, why, "vehicles visible nearby (estimate)"), "rooftop_units": _rng(max(1, sqft / 2500), 0.5, why),
            "parking_stalls": _rng(sqft / 250, 0.5, why), "loading_docks": _rng(1 if sqft > 6000 else 0, 1.0, why),
            "roof_area_shape": {"status": "estimated", "label": "roof footprint (estimate)", "rationale": f"{DEMO}: {f['walk']['widthM']} x {f['walk']['depthM']} m scan footprint; the roof is not seen."
                                if f.get("walk") else f"{DEMO}: no footprint on file."},
            "provenance": f"{DEMO}: deterministic estimates from the area on file; not derived from imagery."}


def aerial_for(lid: int) -> dict | None:
    from . import demo_fixture
    if (fx := demo_fixture.get(lid)):
        return demo_fixture.aerial(fx)
    real = real_aerial(lid)
    if real is not None:
        return real
    f = site_facts(lid)
    return None if f is None else cached("aerial", lid, lambda: scan_only_aerial({k: v for k, v in f.items() if k != "match"}))


# ---------------------------------------------------------------- lineage + presence
def _kit_data_dir() -> Path | None:
    try:
        from data.costar import client
        return client.kit_dir()
    except Exception:  # noqa: BLE001
        return None


@lru_cache(maxsize=8)
def _kit_sites(lid: int):
    """Real lineage and presence for a linked property, computed from the kit with the same code as the candidate build."""
    from triage.lineage import build as lb
    d = _kit_data_dir()
    if d is None or not (d / "commercial-property.jsonl").is_file():
        return None
    return lb.build_sites(d, [lid])


def _market_presence(city: str):
    """Median of the candidates' presence in the same metro, as the demo estimate for a scan with no coordinates."""
    pres = _read_big(_lineage_dir() / "presence.json") or {}
    from . import loader
    same = [str(m.listingId) for m in loader.load_matches() or [] if m.city == city and str(m.listingId) in pres]
    rows = [pres[k] for k in same]
    if not rows:
        return None
    out = {}
    for rk in rows[0]["radii"]:
        def med(path):
            vals = []
            for r in rows:
                v = r["radii"].get(rk, {})
                for p in path:
                    v = v.get(p) if isinstance(v, dict) else None
                if isinstance(v, (int, float)):
                    vals.append(v)
            return round(statistics.median(vals)) if vals else None
        share = None
        w, n = med(("day", "workers")), med(("night", "nightPopulation", "expected"))
        if w is not None and n is not None and w + n:
            share = round(w / (w + n), 3)
        out[rk] = {"radiusMiles": rows[0]["radii"][rk]["radiusMiles"], "kitBuildingsInRadius": med(("kitBuildingsInRadius",)), "shape": "unknown", "dayShare": share,
                   "day": {"workers": w, "status": f"{DEMO}: median of {len(rows)} candidates in the same metro", "employeeFillRate": None},
                   "night": {"status": f"{DEMO}: median of {len(rows)} candidates in the same metro",
                             "nightPopulation": {k: med(("night", "nightPopulation", k)) for k in ("low", "expected", "high")} if n is not None else None}}
    return {"radii": out, "demo": True, "assumptions": [f"{DEMO}: this scan has no coordinates, so each figure is the median over the candidates in the same metro."],
            "notAFootTrafficMeasure": "Presence index of kit-listed buildings; not foot traffic and not a 24-hour clock."}


def lineage_for(lid: int) -> dict | None:
    """Lineage payload (without marketPrior) for a pool site the candidate lineage artifact lacks, else None."""
    f = site_facts(lid)
    if f is None:
        return None

    def build():
        got = _kit_sites(lid) if costar_id(lid) else None
        L = ((got or {}).get("lineage") or {}).get(str(lid))
        if L:
            L = dict(L)
            L["demo"] = False
            return {"listingId": lid, "foodHistoryInKit": True, **L, "note": "Computed from the linked CoStar record (this scan is not a candidate row)."}
        if got is not None:  # the kit answered: no food tenancy there is an observed absence, not a demo value
            return {"listingId": lid, "foodHistoryInKit": False, "tenants": [], "demo": False,
                    "note": "No food-service tenancy recorded in the CoStar kit for the linked building. Unknown, not proof of no restaurant history."}
        return {"listingId": lid, "foodHistoryInKit": False, "tenants": [], "demo": True,
                "note": f"{DEMO}: this scan has no linked CoStar building, so tenancy history is unknown (not proof of none); a café fit-out in the scan suggests earlier food use."}
    return cached("lineage", lid, build)


def presence_for(lid: int) -> dict | None:
    f = site_facts(lid)
    if f is None:
        return None

    def build():
        got = _kit_sites(lid) if costar_id(lid) else None
        P = ((got or {}).get("presence") or {}).get(str(lid))
        if P:
            return {**P, "demo": False}
        return _market_presence(f["city"])
    return cached("presence", lid, build)


# ---------------------------------------------------------------- run everything
def run_site(lid: int, force: bool = False) -> dict | None:
    """Populate every analysis for one site and report how each is labelled. None when the picker cannot show the site."""
    f = site_facts(lid)
    if f is None:
        return None
    if force:
        for kind in ("triage", "aerial", "lineage", "presence"):
            _cache_path(kind, lid).unlink(missing_ok=True)
    insp = inspection_for(lid, force)
    tri, aer, lin, pres = triage_for(lid), aerial_for(lid), lineage_for_any(lid), presence_for_any(lid)
    sp = (_read_big(_structure_dir() / "properties.json") or {}).get(str(lid))
    sp = sp or structure_props(lid)
    fl = (insp or {}).get("findings") or []
    tf = (tri or {}).get("fields") or []
    return {
        "listingId": lid, "name": f["name"], "city": f["city"], "hasScan": bool(f["walk"]) or f["hasScan"], "hasAerial": bool(real_aerial(lid)),
        "inspection": {"n": len(fl), "derived": sum(1 for x in fl if x.get("status") == "derived"), "demo": sum(1 for x in fl if x.get("status") == "estimated"),
                       "tier": "derived" if (f["hasScan"] or f["hasAerial"]) else "demo"},
        "triage": {"n": len(tf), "observed": sum(1 for x in tf if x.get("valueStatus") == "observed"), "derived": sum(1 for x in tf if x.get("valueStatus") == "derived"),
                   "demo": sum(1 for x in tf if x.get("valueStatus") == "estimated")},
        "aerial": "derived" if real_aerial(lid) else "demo",  # detector ranges over real imagery, never a count
        "structure": "demo" if (sp or {}).get("demo") and not _kit_record_ok(sp) else "derived" if (sp or {}).get("demo") else "observed",
        "lineage": "demo" if (lin or {}).get("demo") else "observed", "presence": "demo" if (pres or {}).get("demo") else "derived",
    }


def _kit_record_ok(sp: dict) -> bool:
    return sp.get("yearBuilt") is not None or sp.get("material") is not None or sp.get("stories") is not None


def lineage_for_any(lid: int):
    from . import demo_fixture
    if (fx := demo_fixture.get(lid)):
        return demo_fixture.lineage(fx, False)
    real = (_read_big(_lineage_dir() / "lineage.json") or {}).get(str(lid))
    return real if real is not None else lineage_for(lid)


def presence_for_any(lid: int):
    from . import demo_fixture
    if (fx := demo_fixture.get(lid)):
        return demo_fixture.presence(fx)
    real = (_read_big(_lineage_dir() / "presence.json") or {}).get(str(lid))
    return real if real is not None else presence_for(lid)


def warm_all(force: bool = False, progress=None) -> list[dict]:
    rows = []
    ids = pool_ids()
    for i, lid in enumerate(ids, 1):
        r = run_site(lid, force)
        if r:
            rows.append(r)
        if progress:
            progress(i, len(ids), lid)
    return rows
