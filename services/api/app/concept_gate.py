"""Hard concept gate: for a food concept (cafe, restaurant, bar, ...) a site is shown only when its recorded use can host it
and a suite of the right size exists. Deterministic; uses CoStar property type/subtype, the listed available space (else the scanned
floor area), and prior food-service tenancy. Sites whose type is clearly irrelevant are excluded and counted, with the reason.
Size windows are stated PLANNING assumptions, not code or measured figures."""
from __future__ import annotations

import json
import re
from pathlib import Path

from . import demo_fixture
from .models import Match

SUBTYPES: dict[str, str] = json.loads((Path(__file__).parent / "property_subtypes.json").read_text(encoding="utf-8"))

# Subtype groups. Name = CoStar PropertySubtype enum; the prefix before "_" is its asset class.
FOOD_USE = {"GeneralRetail_Restaurant", "GeneralRetail_FastFood", "GeneralRetail_QuickService", "GeneralRetail_Bar", "Flex_Cafe",
            "Flex_FoodCourt", "Flex_PublicHouse"}
STREET_RETAIL = {"GeneralRetail_Storefront", "GeneralRetail_StorefrontRetailOrOffice", "GeneralRetail_StorefrontRetailOrResidential",
                 "GeneralRetail_Freestanding", "GeneralRetail_RetailBuilding", "MixedUse", "Flex_MixedRetail"}
NIGHTLIFE = {"SportsAndEntertainment_NightClub"}
LABEL = {  # excluded subtype -> readable type for the excluded list
    "GeneralRetail_Bank": "Bank branch", "GeneralRetail_DayCareCenter": "Day care", "GeneralRetail_AutoRepair": "Auto repair",
    "GeneralRetail_AutoDealership": "Auto dealership", "GeneralRetail_ConvenienceStore": "Convenience store",
    "GeneralRetail_Supermarket": "Supermarket", "GeneralRetail_DrugStore": "Drug store", "GeneralRetail_ServiceStation": "Service station",
    "GeneralRetail_TruckStop": "Truck stop", "GeneralRetail_FuneralHome": "Funeral home", "GeneralRetail_GardenCenter": "Garden center",
    "GeneralRetail_VeterinarianOrKennel": "Vet or kennel", "GeneralRetail_HealthClub": "Health club", "GeneralRetail_MovieTheatre": "Cinema",
    "GeneralRetail_BowlingAlley": "Bowling alley", "GeneralRetail_DepartmentStore": "Department store", "Specialty_Schools": "School",
    "Specialty_SelfStorage": "Self-storage", "Office_Medical": "Medical office", "Industrial_Warehouse": "Warehouse",
    "MultiFamily_Apartments": "Multifamily", "Hospitality_Hotel": "Hotel"}
CLASS_LABEL = {"Office": "Office", "Industrial": "Industrial or warehouse", "MultiFamily": "Multifamily", "HealthCare": "Medical or care facility",
               "Hospitality": "Hotel or lodging", "Flex": "Flex or industrial", "Specialty": "Specialty property (not retail)",
               "Residential": "Residential", "DataCenter": "Data center", "SportsAndEntertainment": "Sports or entertainment venue"}
TYPE_LABEL = {"Land": "Land", "Office": "Office", "Industrial": "Industrial or warehouse", "Multifamily": "Multifamily",
              "Healthcare": "Medical or care facility", "Hospitality": "Hotel or lodging", "Flex": "Flex or industrial",
              "Residential": "Residential", "Homes": "Residential", "Specialty": "Specialty property (not retail)"}
OK_TYPES = {"GeneralRetail", "MixedUse"}

# Planning windows (sq ft) when the brief states neither area nor seats. Seats: low estimate = 30 sq ft/seat overall, high = 70% dining at 15
# (the same assumptions as the seat-capacity constraint), so n seats needs about 21.4 sq ft each at the very least.
DEFAULT_WINDOW = {"cafe": (250, 3000), "restaurant": (500, 6000), "bar": (400, 5000)}
SQFT_PER_SEAT_MIN, SQFT_PER_SEAT_TOTAL = 15 / 0.7, 30.0
TOLERANCE = 1.5  # a suite up to 1.5x the stated maximum still passes this gate (the area constraint is stricter when an area is stated)
_BAR_RE = re.compile(r"\b(bars?|pub|brewery|taproom|cocktail|wine bar)\b", re.I)


def subtype_name(code) -> str:
    """Decoded CoStar subtype; "" for blank or Unknown (code 0), which says nothing about use."""
    name = SUBTYPES.get(str(code).split(".")[0].strip(), "") if code not in (None, "") else ""
    return "" if name == "Unknown" else name


def window(profile, concept: str | None, text: str = "") -> tuple[float, float]:
    """(floor, cap) in sq ft that a suite must overlap for this brief."""
    kind = "bar" if concept == "restaurant" and _BAR_RE.search(text) else (concept or "restaurant")
    d_lo, d_hi = DEFAULT_WINDOW.get(kind, DEFAULT_WINDOW["restaurant"])
    lo = d_lo
    if profile.min_seats:
        lo = profile.min_seats * SQFT_PER_SEAT_MIN
    elif profile.min_area_sqft:
        lo = profile.min_area_sqft * 0.5
    if profile.max_area_sqft:
        hi = profile.max_area_sqft
    elif profile.min_area_sqft:
        hi = profile.min_area_sqft * 2
    elif profile.max_seats:
        hi = profile.max_seats * SQFT_PER_SEAT_TOTAL
    elif profile.min_seats:
        hi = profile.min_seats * SQFT_PER_SEAT_TOTAL * 2
    else:
        hi = d_hi
    return lo, hi * TOLERANCE


def type_verdict(m: Match, spells: int) -> tuple[bool, str, str]:
    """(capable, label, why). Unknown type facts are not 'clearly irrelevant', so they pass (the size gate still applies)."""
    sub, typ = m.propertySubtype or "", m.propertyType or ""
    if sub in FOOD_USE:
        return True, "", f"Recorded use is {sub.split('_')[1].replace('FastFood', 'fast food').replace('QuickService', 'quick service').lower()}: built for food service"
    prior = spells > 0
    if sub:
        cls = sub.split("_")[0]
        if sub in STREET_RETAIL or sub in NIGHTLIFE:
            return True, "", {"MixedUse": "Mixed-use ground floor", "Flex_MixedRetail": "Mixed retail"}.get(sub, "Street-level retail space") + " (CoStar subtype)"
        return False, LABEL.get(sub) or CLASS_LABEL.get(cls, cls), f"CoStar subtype {sub}"
    if typ:
        if typ in OK_TYPES:
            return True, "", "Retail property (subtype not recorded)"
        if prior:
            return True, "", "Not a retail property, but it has prior food-service tenancy"
        return False, TYPE_LABEL.get(typ, typ), f"CoStar property type {typ}"
    return True, "", ""


def suite_verdict(m: Match, lo: float, hi: float) -> tuple[bool, str, int | None, str]:
    """(fits, reason, suite_sqft_to_use, note). The area tested is the suite or scanned space, never the building when either is known."""
    a, b = (m.suiteRangeSqft or [None, None]) if m.suiteRangeSqft else (None, None)
    if a or b:
        a, b = a or b, b or a
        if b < lo:
            return False, f"Largest listed suite is {b:,.0f} sq ft: too small for this brief", None, ""
        if a > hi:
            return False, f"Smallest listed suite is {a:,.0f} sq ft: far larger than a {hi / TOLERANCE:,.0f} sq ft concept", None, ""
        if a == b:
            return True, "", int(a), f"Listed available space {a:,.0f} sq ft"
        pick = int(min(max((lo + hi / TOLERANCE) / 2, a), b))
        return True, "", pick, f"Listing spans {a:,.0f} to {b:,.0f} sq ft; a {pick:,.0f} sq ft suite sits inside that range (confirm with the broker)"
    if m.spaceSquareFeet:
        s = m.spaceSquareFeet
        if s < lo:
            return False, f"Scanned space is {s:,} sq ft: too small for this brief", None, ""
        if s > hi:
            return False, f"Scanned space is {s:,} sq ft: far larger than this concept needs", None, ""
        return True, "", s, ""
    if m.squareFeet:
        if m.squareFeet > hi:
            return False, f"No suite size on file and the building is {m.squareFeet:,} sq ft: cannot assume a cafe-sized suite", None, ""
        if m.squareFeet < lo:
            return False, f"Building is only {m.squareFeet:,} sq ft: too small for this brief", None, ""
    return True, "", None, ""


def apply(pool: list[Match], profile, concept: str | None, spells, cafe_ids, text: str = ""):
    """(kept, excluded, notes). kept: Match copies (suite area set to the suite tested); excluded: [{listingId, address, type, reason}];
    notes: listingId -> why-relevant lines. No concept = no gate (a non-food brief is not restricted to cafes). Cafe scans are exempt."""
    if concept is None:
        return list(pool), [], {}
    lo, hi = window(profile, concept, text)
    kept, excluded, notes = [], [], {}
    for m in pool:
        if m.listingId in cafe_ids and (not m.factors or m.listingId in demo_fixture.ids()):
            kept.append(m)
            continue
        ok, label, why = type_verdict(m, spells(m))
        reason, kind = (f"{label}: {why}", label) if not ok else ("", "")
        suite_note = ""
        if ok:
            fits, why_size, suite, suite_note = suite_verdict(m, lo, hi)
            if not fits:
                ok, kind, reason = False, "Wrong size", why_size
            elif suite and suite != m.spaceSquareFeet:
                m = m.model_copy(update={"spaceSquareFeet": suite, "spaceSource": "listing"})
        if ok:
            kept.append(m)
            notes[m.listingId] = [x for x in (why, suite_note) if x]
        else:
            excluded.append({"listingId": m.listingId, "address": m.address, "city": m.city, "type": kind, "reason": reason})
    return kept, excluded, notes


def summary(excluded: list[dict], total: int, concept: str | None) -> dict | None:
    if concept is None:
        return None
    by: dict[str, list[dict]] = {}
    for e in excluded:
        by.setdefault(e["type"], []).append(e)
    groups = [{"type": t, "count": len(v), "sites": v} for t, v in sorted(by.items(), key=lambda kv: (-len(kv[1]), kv[0]))]
    return {"concept": concept, "excluded": len(excluded), "total": total, "groups": groups}
