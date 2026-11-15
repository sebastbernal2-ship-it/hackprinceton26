"""Extra FactorCards from the locally held data streams (building kit, structure/hazard screen, lineage, triage,
aerial, climate). Observed/derived only where a local artifact has the listing. Where aerial or climate data is
absent a clearly-labelled ESTIMATED DEMO card is added instead (never counted as evidence, see readiness.py)."""
import json
from pathlib import Path

from . import aerial_routes, lineage_routes, structure_routes, triage_routes
from .models import FactorCard

DEMO = "ESTIMATED DEMO placeholder, not observed data; replace when the stream is fetched for this site."
REPLACED = {"aerial_site", "natural_hazards", "climate_weather"}  # unknown placeholders superseded by a stream card


def _j(p: Path):
    try:
        return json.loads(p.read_text(encoding="utf-8")) if p.is_file() else None
    except (OSError, ValueError):
        return None


def _card(fid, status, value, unit, source, rid, asof, geo, lim="") -> FactorCard:
    return FactorCard(factorId=fid, status=status, value=str(value), unit=unit, source=source, recordId=str(rid),
                      asOf=asof or "", geography=geo, limitations=lim)


def stream_cards(listing_id: int) -> list[FactorCard]:
    lid, out = str(listing_id), []
    props = _j(structure_routes._dir() / "properties.json") or {}
    p = props.get(lid)
    if p:
        kit = [f"{k}={p[k]}" for k in ("yearBuilt", "material", "buildingClass", "stories") if p.get(k) not in (None, "")]
        if kit:
            out.append(_card("building_kit", "observed", ", ".join(kit), "kit fields", "CoStar kit", lid,
                             p.get("retrieved", ""), "building", "Kit record; not field-verified."))
        usgs = p.get("usgs") or {}
        if usgs.get("sdc"):
            fema = (p.get("fema") or {}).get("zone") or "FEMA zone unavailable"
            out.append(_card("natural_hazards", "observed", f"seismic design category {usgs['sdc']}; {fema}", "screen",
                             "USGS design maps / FEMA NFHL", lid, p.get("retrieved", ""), "site point",
                             "Screening prior, not an engineering assessment."))
    lin = _j(lineage_routes.lineage_dir() / "lineage.json") or {}
    if lid in lin:
        out.append(_card("restaurant_lineage", "observed", f"{len(lin[lid].get('tenants', []))} food tenancy spells", "spells",
                         "CoStar tenancy (kit-listed)", lid, "", "building", "Exploratory market prior, not a per-site prediction."))
    tri = next((r for r in (_j(triage_routes.derived_dir() / "results.json") or []) if r.get("listingId") == lid), None)
    if tri and tri.get("fields"):
        n = sum(1 for f in tri["fields"] if f["status"] in ("confirmed", "filled", "conflicting"))
        out.append(_card("record_triage", "derived", f"{n}/{len(tri['fields'])} fields backed by scan or aerial", "fields",
                         "triage reconcile", lid, "", "building", "Rule-based screening triage, not a fit score."))
    aer = _j(aerial_routes.aerial_dir() / f"{lid}.json")
    if aer:
        im = aer.get("imagery", {})
        out.append(_card("aerial_site", "observed", "ortho imagery fetched", "image", im.get("source", ""), lid,
                         im.get("fetched", ""), "100 m crop", im.get("capture_date_note", "")))
    else:
        out.append(_card("aerial_site", "estimated", "no aerial imagery fetched", "", "demo", lid, "", "site", DEMO))
    if _j(structure_routes._dir() / "climate_fetch.json") and p:
        out.append(_card("climate_weather", "derived", "published NOAA/Cal-Adapt scenarios (2030/2050/2070)", "scenarios",
                         "NOAA CO-OPS SLR / Cal-Adapt LOCA", lid, "", "regional gauge",
                         "Scenario analysis, not a forecast; not downscaled to the parcel."))
    else:
        out.append(_card("climate_weather", "estimated", "no climate scenarios fetched", "", "demo", lid, "", "region", DEMO))
    return out


def merge(listing_id: int, cards: list[FactorCard]) -> list[FactorCard]:
    """Stream cards replace unknown placeholders of the same factor id; other cards untouched."""
    extra = stream_cards(listing_id)
    ids = {c.factorId for c in extra}
    return [c for c in cards if not (c.factorId in ids and c.status == "unknown")] + [
        c for c in extra if not any(o.factorId == c.factorId and o.status != "unknown" for o in cards)]
