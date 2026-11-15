import csv
import os
from pathlib import Path
from typing import Optional

from .models import Fact, FactorCard, Match, SpaceFacts
from . import streams
from .readiness import evidence_readiness

STATUSES = {"observed", "derived", "estimated", "unknown"}
CANDIDATES = "restaurant-site-candidates.csv"
FACTORS = "factor-cards.csv"
PROPERTY_MODELS = "commercial-properties.csv"
EVIDENCE = "restaurant-site-evidence.csv"


def _scan_areas() -> dict:
    """Saved scan floor areas from modeling/scan_area.py (local, gitignored). Missing file = no scan areas."""
    import json
    p = Path(os.environ.get("SCAN_AREAS_PATH", "data/derived/scan_areas.json"))
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def data_dir() -> Path:
    return Path(os.environ.get("COSTAR_NORMALIZED_DIR", "data/normalized/costar"))


def photo_dir() -> Path:
    return Path(os.environ.get("SITE_PHOTO_DIR", "data/derived/site-photos"))


def _rows(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as fh:  # read-only
        return list(csv.DictReader(fh))


def _int(s: str) -> Optional[int]:
    try:
        return int(float(s))
    except (TypeError, ValueError):
        return None


def _card(r: dict) -> FactorCard:
    status = r.get("status", "unknown")
    limits = [r.get(k, "") for k in ("uncertainty", "unknown_reason", "interpretation")]
    return FactorCard(
        factorId=r.get("factor_id", ""),
        status=status if status in STATUSES else "unknown",
        value=r.get("value", ""),
        unit=r.get("unit", ""),
        source=r.get("source", ""),
        recordId=r.get("record_id", ""),
        asOf=r.get("retrieved_or_observed_date", ""),
        geography=r.get("geography", ""),
        limitations=" ".join(x for x in limits if x),
    )


def _fact(label: str, value: str, out: list[Fact]) -> None:
    if value not in ("", None):
        out.append(Fact(label=label, value=value))


def _costar_models(d: Path) -> dict[str, list[str]]:
    """PropertyId -> Matterport model ids as CoStar lists them (commercial-properties.csv). A property-level
    association: it does not say which suite a model shows."""
    out: dict[str, list[str]] = {}
    p = d / PROPERTY_MODELS
    if p.is_file():
        for r in _rows(p):
            pid, mid = r.get("PropertyId", ""), (r.get("MatterportModelId") or "").strip()
            if pid and mid and mid not in out.setdefault(pid, []):
                out[pid].append(mid)
    return out


def _walk_ready(model: str) -> bool:
    """True when a local first-person walk export exists for this model (modeling/walk_export.py)."""
    root = Path(os.environ.get("SCAN_ASSETS_DIR", "."))
    return (root / f"assets_{model}" / "walk" / "meta.json").is_file()


def _evidence(d: Path) -> dict[str, dict]:
    """restaurant-site-evidence.csv (listing and tenancy columns for the same candidates), by property id. Optional."""
    p = d / EVIDENCE
    return {r.get("property_id", ""): r for r in _rows(p)} if p.is_file() else {}


def _match(c: dict, cards: list[FactorCard], models: Optional[list[str]] = None) -> Optional[Match]:
    listing = _int(c.get("property_id", ""))
    if listing is None:
        return None
    sqft = _int(c.get("rentable_area_sqft", "")) or _int(c.get("retail_gla_sqft", "")) or _int(
        c.get("gross_building_area_sqft", "")
    )
    models = models or []
    # An observed scan card wins; otherwise the model CoStar lists for the property, preferring one that can be walked locally.
    tour = next((f.value for f in cards if f.factorId == "spatial_interior" and f.status == "observed"), "") or next(
        (m for m in models if _walk_ready(m)), models[0] if models else ""
    )
    prop: list[Fact] = []
    from .concept_gate import subtype_name
    subtype = subtype_name(c.get("property_subtype_code", ""))
    _fact("Property Type", c.get("property_type", ""), prop)
    _fact("Property Subtype", subtype, prop)
    if sqft:
        _fact("Area", f"{sqft:,} sq ft", prop)
    _fact("Sprinklers", {"true": "Yes", "false": "No"}.get(c.get("has_sprinklers", "").lower(), ""), prop)
    loc: list[Fact] = []
    _fact("Postal code", c.get("postal_code", ""), loc)
    _fact("Latitude", c.get("latitude", ""), loc)
    _fact("Longitude", c.get("longitude", ""), loc)
    if models:
        _fact("Matterport (CoStar-listed, property level)", ", ".join(models), loc)
    city = ", ".join(x for x in (c.get("city", ""), c.get("state", "")) if x)
    # Space you would lease: the listing's available space; else the floor area measured from this site's scan.
    lo_s, hi_s = _int(c.get("active_listed_min_available_sqft", "")), _int(c.get("active_listed_max_available_sqft", ""))
    space, space_src = (lo_s or hi_s), "listing"
    suites = [x for x in (lo_s or hi_s, hi_s or lo_s) if x]
    if suites:
        _fact("Listed available space", f"{min(suites):,} to {max(suites):,} sq ft" if min(suites) != max(suites) else f"{suites[0]:,} sq ft", prop)
    if not space:
        scan = _scan_areas().get(tour) or {}
        space, space_src = (scan.get("squareFeet"), "scan") if scan.get("squareFeet") else (None, None)
        if space:
            _fact(f"Scanned floor area ({scan.get('status')}, Matterport {tour})", f"{space:,} sq ft", prop)
    photo_root = photo_dir() / str(listing)
    photos = [f"/api/site-photos/{listing}/{name}" for name in ("photo-1.jpg", "aerial.jpg") if (photo_root / name).is_file()]
    if not photos and tour:  # no listing photo: a locally captured scan photo, else nothing (the card draws a placeholder, no request is made)
        scan_dir = photo_dir() / f"scan-{tour}"
        local = Path(os.environ.get("SCAN_ASSETS_DIR", ".")) / f"assets_{tour}" / "matterport" / "preview.jpg"
        if (scan_dir / "photo-1.jpg").is_file() or local.is_file():
            photos = [f"/api/scan-photo?modelId={tour}&n=0"]
    return Match(
        listingId=listing,
        address=c.get("address", ""),
        detail="",
        city=city,
        blurb=c.get("candidate_basis", ""),
        photo=photos[0] if photos else "",
        squareFeet=sqft,
        spaceSquareFeet=space,
        spaceSource=space_src,
        rentPerSquareFootYear=None,
        tourId=tour,
        propertyType=c.get("property_type", ""), propertySubtype=subtype, suiteRangeSqft=[min(suites), max(suites)] if suites else None,
        evidenceReadiness=evidence_readiness(cards),
        facts=SpaceFacts(photos=photos, property=prop, location=loc),
        factors=cards,
    )


_MATCH_CACHE: dict = {}


def load_matches(directory: Optional[Path] = None) -> Optional[list[Match]]:
    """None when the local data files are absent (dataAvailable=false). Cached per data folder until the source files change
    (building the list takes seconds, and every property route calls it)."""
    d = directory or data_dir()
    cand, fac = d / CANDIDATES, d / FACTORS
    if not cand.is_file() or not fac.is_file():
        return None
    env = tuple(sorted((k, v) for k, v in os.environ.items() if k.endswith(("_DIR", "_PATH")) or k.startswith("DEMO_")))
    key = (str(d), cand.stat().st_mtime_ns, fac.stat().st_mtime_ns, env)
    hit = _MATCH_CACHE.get("v")
    if hit and hit[0] == key:
        return [m.model_copy() for m in hit[1]]
    out = _load_matches(d, cand, fac)
    _MATCH_CACHE["v"] = (key, out)
    return [m.model_copy() for m in out]


def _load_matches(d: Path, cand: Path, fac: Path) -> list[Match]:
    by_prop: dict[str, list[FactorCard]] = {}
    for r in _rows(fac):
        by_prop.setdefault(r.get("property_id", ""), []).append(_card(r))
    models, ev = _costar_models(d), _evidence(d)
    out = [m for c in _rows(cand) if (m := _match({**ev.get(c.get("property_id", ""), {}), **c}, streams.merge(_int(c.get("property_id", "")) or 0, by_prop.get(c.get("property_id", ""), [])), models.get(c.get("property_id", ""))))]
    from . import picker
    return sorted(out, key=lambda m: m.listingId) + [c for c in picker.cafe_candidates() if picker.walk_ready(c.tourId)]  # only scans with a local walk export
