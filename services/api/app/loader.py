import csv
import os
from pathlib import Path
from typing import Optional

from .models import Fact, FactorCard, Match, SpaceFacts
from .readiness import evidence_readiness

STATUSES = {"observed", "derived", "estimated", "unknown"}
CANDIDATES = "restaurant-site-candidates.csv"
FACTORS = "factor-cards.csv"
PROPERTY_MODELS = "commercial-properties.csv"


def data_dir() -> Path:
    return Path(os.environ.get("COSTAR_NORMALIZED_DIR", "data/normalized/costar"))


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
    _fact("Property Type", c.get("property_type", ""), prop)
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
    return Match(
        listingId=listing,
        address=c.get("address", ""),
        detail="",
        city=city,
        blurb=c.get("candidate_basis", ""),
        photo="",
        squareFeet=sqft,
        rentPerSquareFootYear=None,
        tourId=tour,
        evidenceReadiness=evidence_readiness(cards),
        facts=SpaceFacts(photos=[], property=prop, location=loc),
        factors=cards,
    )


def load_matches(directory: Optional[Path] = None) -> Optional[list[Match]]:
    """None when the local data files are absent (dataAvailable=false)."""
    d = directory or data_dir()
    cand, fac = d / CANDIDATES, d / FACTORS
    if not cand.is_file() or not fac.is_file():
        return None
    by_prop: dict[str, list[FactorCard]] = {}
    for r in _rows(fac):
        by_prop.setdefault(r.get("property_id", ""), []).append(_card(r))
    models = _costar_models(d)
    out = [m for c in _rows(cand) if (m := _match(c, by_prop.get(c.get("property_id", ""), []), models.get(c.get("property_id", ""))))]
    return sorted(out, key=lambda m: m.listingId)
