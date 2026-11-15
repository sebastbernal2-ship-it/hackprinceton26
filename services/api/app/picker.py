"""Space picker: concept-aware ordering of the constraint-passing sites, with the reasons shown on each card.

Deterministic; no LLM. The weights below are stated PLANNING heuristics for the demo, not a fitted or validated score,
and the number is never returned: the card shows the reasons and one labelled "best match" only."""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

from . import concept_gate
from .models import Fact, Match, SpaceFacts

ROOT = Path(__file__).resolve().parents[3]
CAFE_SCANS = json.loads((Path(__file__).parent / "cafe_scans.json").read_text(encoding="utf-8"))["scans"]
CAFE_KIT = json.loads((ROOT / "foreground/app/lib/cafe-kit.json").read_text(encoding="utf-8"))["scans"]
CAFE_IDS = {s["listingId"] for s in CAFE_SCANS}
ESTIMATE = "scan-estimate"  # Match.spaceSource for a cafe scan: an assumed demo area, not a measurement

_CAFE_RE = re.compile(r"\b(caf[eé]s?|coffee(?:\s?shops?)?|espresso|bakery|bakeries|pastr(?:y|ies)|bistro|tea\s?(?:house|shop|room)|bagel|donut|doughnut)\b", re.I)
_FOOD_RE = re.compile(r"\b(restaurants?|kitchen|dining|diner|eatery|bars?|pub|brewery|taproom|cocktail|grill|food|yogurt|juice|taquer[ií]a|tacos?|pizz(?:a|eria)|burgers?|sushi|ramen|noodles?|bbq|barbecue|steakhouse|deli|gelato|ice cream|cantina|brasserie|tavern|lounge|bodega|food hall|ghost kitchen)\b", re.I)
_PRIOR_RE = re.compile(r"\b(already had food service|prior food|existing (?:hood|kitchen)|hood|grease)\b", re.I)


def walk_ready(tour: str) -> bool:
    """True when a local first-person walk export exists for this scan (the walk is then editable)."""
    root = Path(os.environ.get("SCAN_ASSETS_DIR", "."))
    return bool(tour) and (root / f"assets_{tour}" / "walk" / "meta.json").is_file()


def cafe_candidates() -> list[Match]:
    """The cafe scans as candidate sites. Area is the ESTIMATED kit area; the card says so."""
    out = []
    for s in CAFE_SCANS:
        t, sqft = s["tourId"], (CAFE_KIT.get(s["tourId"]) or {}).get("sqft")
        photo = lambda n: f"/api/scan-photo?modelId={t}&n={n}"  # noqa: E731
        photos = [photo(n) for n in range(0, s["photos"] + 1)]
        out.append(Match(
            listingId=s["listingId"], address=s["address"], detail=s["name"], city=s["city"],
            blurb="Café interior from a Matterport scan with an editable walk. A scan, not a listing: availability and rent are not on file.",
            photo=photos[0], squareFeet=None, spaceSquareFeet=sqft, spaceSource=ESTIMATE if sqft else None, rentPerSquareFootYear=None,
            tourId=t, evidenceReadiness=0,
            facts=SpaceFacts(photos=photos, property=[Fact(label="Use", value="Café (from the scan)"),
                                                        Fact(label="Space Available", value="Unknown (not a listing)")]
                             + ([Fact(label="Floor area", value=f"{sqft:,} sq ft (ESTIMATED demo area, not measured)")] if sqft else []),
                             location=[Fact(label="Matterport", value=f"Model {t}")]),
            factors=[]))
    return out


def detect_concept(text: str) -> str | None:
    """'cafe' | 'restaurant' | None from the words the operator wrote."""
    if _CAFE_RE.search(text):
        return "cafe"
    return "restaurant" if _FOOD_RE.search(text) else None


def wants_prior_food(text: str) -> bool:
    return bool(_PRIOR_RE.search(text))


def food_spells(m: Match) -> int:
    f = next((c for c in m.factors if c.factorId == "restaurant_lineage" and c.status == "observed"), None)
    n = re.match(r"\d+", f.value) if f else None
    return int(n.group()) if n else 0


def _n(x) -> str:
    return f"{x:,.0f}"


def pick(m: Match, results: dict, profile, concept: str | None, prior_food: bool) -> tuple[int, list[str], bool]:
    """(points, reasons, cafe_ready). Points only order sites; they are not shown."""
    pts, why = 0, []
    cafe_scan = m.listingId in CAFE_IDS and m.spaceSource in (ESTIMATE, None) and not m.factors
    food = concept is not None
    if cafe_scan:
        pts += 40 if concept == "cafe" else 25 if food else 0
        why.append("Café interior already scanned: existing food-service fit-out to build on (scan, not a listing)" if food
                   else "Scan of a café interior (not a listing)")
        if "not on file" not in m.address:
            pts += 3
            why.append("Street address on file")
    if food and m.propertySubtype in concept_gate.FOOD_USE:
        pts += 12
    elif food and m.propertySubtype in concept_gate.STREET_RETAIL:
        pts += 3
    spells = food_spells(m)
    if spells and food:
        pts += min(spells, 3) * (10 if prior_food or concept == "cafe" else 7)
        why.append(f"Prior food-service tenancy: {spells} spell{'s' if spells != 1 else ''} on this building (CoStar tenancy); a hood may exist, unverified")
    walk = walk_ready(m.tourId)
    if walk:
        pts += 25
        why.append("Editable 3D walk available: place furniture and equipment before visiting")
    elif m.tourId:
        pts += 6
        why.append("3D scan available (view only)")
    r = results
    if profile.cities and r.get("city") and r["city"].status == "PASS":
        pts += 10
        why.append(f"In {m.city.split(',')[0].strip()}, one of your cities")
    if r.get("area") and r["area"].status == "PASS" and m.spaceSquareFeet:
        src = "estimated" if m.spaceSource == ESTIMATE else "measured from scan" if m.spaceSource == "scan" else "listed"
        pts += 15
        lo, hi = profile.min_area_sqft, profile.max_area_sqft
        if lo and hi:
            mid = (lo + hi) / 2
            pts += max(0, 5 - int(5 * abs(m.spaceSquareFeet - mid) / mid))
        why.append(f"{_n(m.spaceSquareFeet)} sq ft ({src}) fits your size range")
    if r.get("seats") and r["seats"].status == "PASS" and profile.min_seats:
        pts += 10
        why.append(f"Estimated to seat at least {profile.min_seats} (from area, a planning assumption)")
    if r.get("budget") and r["budget"].status == "PASS":
        pts += 5
        why.append("Build-out estimate within your budget")
    if any(c.factorId == "property_market" and c.status == "observed" and c.value == "Active" for c in m.factors):
        pts += 5
        why.append("Active CoStar listing")
    return pts, why, cafe_scan


def order(kept: list[Match], results: dict, profile, concept: str | None, prior_food: bool, n_pass, notes: dict | None = None):
    """Sorted (match, reasons, best) rows. For a food concept the best cafe-ready, non-failing scan goes first."""
    rows = []
    for m in kept:
        pts, why, cafe = pick(m, results[m.listingId].by_constraint(), profile, concept, prior_food)
        why = (notes or {}).get(m.listingId, []) + why
        res = results[m.listingId]
        if res.status == "FAIL" and cafe:  # always offered for a cafe brief: say plainly what it does not meet
            why.append("Does not meet: " + ", ".join(sorted(c for c, r in res.by_constraint().items() if r.status == "FAIL")) + " (the area is an estimate)")
        rows.append((m, pts, why, cafe))
    rows.sort(key=lambda t: (results[t[0].listingId].status != "PASS" and not (concept == "cafe" and t[3]), -t[1], -n_pass(t[0]), -t[0].evidenceReadiness, t[0].listingId))
    if concept == "cafe":
        i = next((i for i, t in enumerate(rows) if t[3] and walk_ready(t[0].tourId)), next((i for i, t in enumerate(rows) if t[3]), None))
        if i:
            rows.insert(0, rows.pop(i))
    return [(m, why, bool(concept) and k == 0) for k, (m, _, why, _) in enumerate(rows)]
