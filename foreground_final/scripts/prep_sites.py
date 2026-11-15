"""Build data/sites/<id>.json (CoStar layer) from the site-selection output.

Input:  docs/spikes/top12.json (built from the CoStar kit by scripts/spikes/sites/build.py + pick.py)
Output: data/sites/<propertyId>.json matching lib/sites/schema.ts. Media fields (matterport rooms/panos/images,
        aerial) are filled later by scripts/prep_media.py; this script keeps any media already present.

Run: python -I scripts/prep_sites.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "spikes" / "top12.json"
OUT = ROOT / "data" / "sites"

CITY = {"Houston": ("Houston", "TX"), "Los Angeles": ("Los Angeles", "CA")}
OUTCOME = {
    "ClosedLocationOrBankrupt": "closed",
    "MovingOutNewAddressUnknown": "moved",
    "MovingOutNewAddressKnown": "moved",
}
MEDIA_KEYS = ("matterport", "aerial", "neighborhood")


def suite_key(s: str | None) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def to_space(s: dict) -> dict:
    sf = s.get("sfMax") or s.get("sfMin") or s.get("sfMaxContiguous")
    return {
        "spaceId": s["spaceId"],
        "listingId": s["listingId"],
        "suite": s.get("suite"),
        "floor": s.get("floor"),
        "sf": sf,
        "sfMin": s.get("sfMin"),
        "rentPerSfYr": s.get("rentPerSfYrHigh") or s.get("rentPerSfYrLow"),
        "serviceType": s.get("serviceTypeShort"),
        "spaceUse": s.get("spaceUse"),
        "spaceType": s.get("spaceType"),
        "notes": (s.get("spaceNotes") or "").strip() or None,
        "availableOn": s.get("availableOnDate"),
        "floorPlanUrl": s.get("floorPlanUri"),
        "restaurantKeywords": sorted(
            set(s.get("restaurantKeywordsInSpaceNotes") or []) | set(s.get("restaurantKeywordsInListingNotes") or [])
        ),
    }


def pick_space(spaces: list[dict]) -> dict:
    """Featured space: has its own scan > restaurant keywords > restaurant-sized, then smallest rent."""

    def rank(s: dict):
        sf = s.get("sfMax") or 0
        notes = (s.get("spaceNotes") or "").lower()
        return (
            0 if s.get("matterportModelIdsForSuite") else 1,
            0 if 1000 <= sf <= 5000 else 1,
            0 if ("hood" in notes or "grease" in notes) and "non-vented" not in notes else 1,
            0 if s.get("restaurantKeywordsInSpaceNotes") else 1,
            0 if s.get("rentPerSfYrHigh") else 1,
        )

    return sorted(spaces, key=rank)[0]


def notes_findings(space: dict, listing_keywords: list[str]) -> list[dict]:
    text = (space.get("notes") or "").lower()
    out: list[dict] = []

    def add(kind: str, status: str, conf: float, evidence: str) -> None:
        out.append(
            {
                "id": f"costar-{kind}",
                "kind": kind,
                "status": status,
                "confidence": conf,
                "evidence": evidence,
                "source": "costar-notes",
            }
        )

    if "non-vented" in text or "no hood" in text:
        add("hood", "absent", 0.7, "Listing says the space suits a non-vented use (no kitchen hood).")
    elif "hood" in text or "vented" in text:
        add("hood", "present", 0.6, "Listing notes mention an existing hood or venting.")
    elif "hood" in listing_keywords:
        add("hood", "unknown", 0.4, "The building's listing mentions a hood, but not for this suite.")
    if "grease" in text:
        add("grease-trap", "present", 0.6, "Listing notes mention a grease trap or interceptor.")
    if "walk-in" in text:
        add("walk-in", "present", 0.6, "Listing notes mention a walk-in cooler or freezer.")
    if re.search(r"(2nd|second)[ -]gen.{0,40}restaurant", text, re.S):
        add("prior-use", "present", 0.8, "Listed as a second-generation restaurant space.")
    elif "2nd gen" in text or "second gen" in text:
        add("prior-use", "unknown", 0.5, "Second-generation space, previous use not a restaurant.")
    if "ada" in text and "restroom" in text:
        add("restrooms", "present", 0.6, "Listing notes mention an existing ADA restroom.")
    if "patio" in text:
        add("patio", "present", 0.6, "Listing notes mention a patio.")
    return out


def tenancy(t: dict, featured_suite: str | None, suite_occupancy_ids: set[int]) -> dict:
    suites = [suite_key(s) for s in t.get("suites") or []]
    current = bool(t.get("isCurrent"))
    in_suite = bool(set(t.get("occupancyIds") or []) & suite_occupancy_ids)
    return {
        "name": t["name"],
        "industry": "AccommodationAndFoodServices",
        "isFood": True,
        "moveIn": t.get("moveIn"),
        "moveOut": t.get("moveOut"),
        "years": t.get("durationYears"),
        "suite": (t.get("suites") or [None])[0],
        "sameSuite": in_suite or (bool(featured_suite) and suite_key(featured_suite) in suites),
        "current": current,
        "outcome": "current" if current else OUTCOME.get(t.get("expirationReason") or "", "unknown"),
        "matchBasis": ", ".join(t.get("matchBasis") or []),
    }


def fix_text(v):
    """Repair UTF-8 text that was decoded as cp1252 (e.g. 'Houstonâ€™s'); applied recursively to all strings."""
    if isinstance(v, str):
        if "â€" in v or "Ã" in v:
            try:
                return v.encode("cp1252").decode("utf-8")
            except (UnicodeEncodeError, UnicodeDecodeError):
                return v
        return v
    if isinstance(v, list):
        return [fix_text(x) for x in v]
    if isinstance(v, dict):
        return {k: fix_text(x) for k, x in v.items()}
    return v


def make_headline(site: dict) -> str | None:
    """One factual sentence (<= 110 chars) built only from CoStar fields; never says 'failed' unless outcome is closed."""
    sp = site["space"]
    kinds = {(f["kind"], f["status"]) for f in site.get("findings", [])}
    if sp.get("spaceType") == "Relet" and ("prior-use", "present") in kinds:
        lead = "Second-generation restaurant suite"
    elif sp.get("spaceType") == "Relet":
        lead = "Second-generation suite"
    elif sp.get("spaceType") == "New":
        lead = "First-generation shell"
    else:
        lead = "Retail suite"
    if ("hood", "present") in kinds:
        lead += " with a hood"
    elif ("hood", "absent") in kinds:
        lead += ", non-vented"
    clauses = []
    ts = [t for t in site.get("tenantHistory", []) if t.get("sameSuite") and not t.get("current")]
    if ts:
        closed = sum(t.get("outcome") == "closed" for t in ts)
        yrs = [t["years"] for t in ts if t.get("years")]
        c = f"{len(ts)} food tenant{'s' if len(ts) != 1 else ''} left it"
        if closed:
            c += f", {closed} closed"
        if yrs:
            c += f" after ~{sum(yrs) / len(yrs):.0f} yr{' avg' if len(yrs) > 1 else ''}"
        clauses.append(c)
    if sp.get("availableOn") and sp["availableOn"][:4].isdigit() and int(sp["availableOn"][:4]) <= 2024:
        clauses.append(f"on market since {sp['availableOn'][:4]}")
    if sp.get("rentPerSfYr"):
        clauses.append(f"${sp['rentPerSfYr']:g}/SF {sp.get('serviceType') or ''}".strip())
    out = lead
    for c in clauses:
        cand = f"{out}; {c}" if ";" not in out else f"{out}, {c}"
        if len(cand) + 1 > 110:
            break
        out = cand
    return out + "."


def build(rec: dict, existing: dict | None) -> dict:
    city, state = CITY[rec["city"]]
    featured = pick_space(rec["spaces"])
    space = to_space(featured)
    model_ids = featured.get("matterportModelIdsForSuite") or rec.get("matterportModelIdsMatchingAvailableSuite") or rec.get(
        "matterportModelIds"
    ) or []
    captions = {m["modelId"]: ", ".join(m.get("captions") or []) for m in rec.get("matterportModels") or []}
    matterport = None
    if model_ids:
        mid = model_ids[0]
        matterport = {
            "modelId": mid,
            "defurnishedViewId": None,
            "scanOfExactSuite": bool(featured.get("matterportModelIdsForSuite")),
            "scanName": captions.get(mid) or None,
        }
    sale = rec.get("lastSale") or {}
    site = {
        "id": str(rec["propertyId"]),
        "address": rec["address"].replace("Th St", "th St"),
        "city": city,
        "state": state,
        "postcode": rec.get("postcode"),
        "lat": rec["lat"],
        "lng": rec["lng"],
        "buildingName": rec.get("buildingName"),
        "propertyType": rec["propertyType"],
        "propertySubtype": rec.get("propertySubtype"),
        "buildingSf": rec.get("buildingSF"),
        "yearBuilt": rec.get("yearBuilt"),
        "yearRenovated": rec.get("yearRenovated"),
        "stories": rec.get("stories"),
        "zoning": rec.get("zoning"),
        "photoUrl": rec.get("primaryPhotoUri"),
        "space": space,
        "otherSpaces": [to_space(s) for s in rec["spaces"] if s is not featured],
        "tenantHistory": [
            tenancy(t, space["suite"], {h["occupancyId"] for h in featured.get("suiteTenantHistory") or []})
            for t in rec.get("foodHistory") or []
        ],
        "sales": (
            [{"date": sale["soldDate"], "priceUsd": sale.get("soldForPrice"), "note": sale.get("salePriceStatus")}]
            if sale.get("soldDate")
            else []
        ),
        "matterport": matterport,
        "aerial": None,
        "findings": notes_findings(space, rec["spaces"][0].get("restaurantKeywordsInListingNotes") or []),
        "headline": (rec.get("selection") or {}).get("rationale", "").split(". ")[0] or None,
        "sources": [{"label": "CoStar hackathon data kit (Nov 2026)"}],
    }
    if existing:
        for key in MEDIA_KEYS:
            if not existing.get(key):
                continue
            if key == "matterport" and matterport and existing[key].get("modelId") != matterport["modelId"]:
                continue  # featured scan changed: media must be re-fetched for the new model
            site[key] = existing[key]
        if existing.get("findings"):
            keep = [f for f in existing["findings"] if f.get("source") != "costar-notes"]
            site["findings"] = site["findings"] + keep
    site["headline"] = make_headline(site)
    site = fix_text(site)
    return {k: v for k, v in site.items() if v is not None or k in ("matterport", "aerial")}


def main() -> int:
    records = json.loads(SRC.read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    for rec in records:
        path = OUT / f"{rec['propertyId']}.json"
        existing = json.loads(path.read_text(encoding="utf-8")) if path.exists() else None
        path.write_text(json.dumps(build(rec, existing), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {len(records)} sites to {OUT}")
    for f in sorted(OUT.glob("*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        print(d["id"], d["address"], "|", d.get("headline"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
