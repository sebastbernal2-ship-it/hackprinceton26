"""Deterministic, credit-free inspection for sites where the vision run cannot happen (no model key, or no panorama).

Every finding is a rule applied to facts we already hold (scan walk export, triage values, CoStar record, aerial), or a
labelled DEMO ESTIMATE where nothing is known. Nothing here is a model observation of imagery. Each finding carries
status ("derived" = rule over an observed fact, "estimated" = demo estimate), a plain confidence label and a verificationStep.
Thresholds are ASSUMPTIONS (rules of thumb), not code requirements.
"""
import math

from .cost_link import link_costs
from .schema import coerce_finding

MODE = "demo"
HOOD_MIN_CEILING_M = 2.7  # ASSUMPTION, same as inspection.geometry
OCCUPANT_SQFT = 15  # ASSUMPTION: ~15 sq ft per person for dining occupant load
M_PER_FT = 0.3048


def _f(fid, cat, title, desc, *, sev, conf, label, status, source, ref, step, can=False, grounding="inferred"):
    raw = {"title": title, "category": cat, "description": desc, "severity": sev, "modelConfidence": conf,
           "canConfirmFromImagery": can, "verificationStep": step, "grounding": grounding}
    f = coerce_finding(raw, fid, source, ref)
    f["status"], f["confidenceLabel"], f["grounding"] = status, label, grounding
    return f


def _sqft(facts):
    return facts.get("sqft") or None


def demo_findings(facts: dict) -> list[dict]:
    """facts: see services/api/app/analyses.site_facts. Returns validated DefectFinding dicts (plus status/confidenceLabel)."""
    out = []
    sqft, scan = _sqft(facts), bool(facts.get("hasScan"))
    src = "floorplan_geometry" if scan else "listing_text"
    where = facts.get("name") or facts.get("address") or "this site"
    spells, cafe = facts.get("foodSpells") or 0, bool(facts.get("isCafeScan"))

    # 1. hood / grease line
    if spells:
        out.append(_f("run-hood", "kitchen_infrastructure", "Hood and grease line: likely present, unverified",
                      f"DEMO ESTIMATE: CoStar records {spells} past food-service tenancy spell(s) in this building, so a Type I hood, grease "
                      "interceptor and make-up air may already exist. Nothing in the data shows the equipment or its condition.",
                      sev="unknown", conf=0.45, label="medium", status="estimated", source="listing_text", ref=f"CoStar tenancy: {spells} food spell(s)",
                      step="Inspect the hood, duct run, fire suppression tags and grease interceptor; ask the landlord for the last hood cleaning and permit records."))
    elif cafe:
        out.append(_f("run-hood", "kitchen_infrastructure", "Hood and grease line: café fit-out, hood not confirmed",
                      "DEMO ESTIMATE: the scan is of a café interior, so a counter and some service equipment exist, but a commercial hood and grease line "
                      "are not identifiable from the scan geometry. A café may run without a Type I hood (espresso, baking in a small oven needs a ruling).",
                      sev="unknown", conf=0.3, label="low", status="estimated", source=src, ref="walk export: café scan",
                      step="Confirm on site whether a Type I or Type II hood exists, and with the city which hood class a café menu needs."))
    else:
        out.append(_f("run-hood", "kitchen_infrastructure", "Hood and grease line: assume none",
                      "DEMO ESTIMATE: no food-service history in the CoStar kit for this building, so assume there is no hood, grease interceptor or "
                      "kitchen exhaust. A new Type I hood is a major fit-out line item if the concept needs one.",
                      sev="medium", conf=0.35, label="low", status="estimated", source="listing_text", ref="CoStar kit: no food tenancy",
                      step="Check the roof and ceiling for an existing exhaust path and ask the landlord whether a hood shaft or roof penetration is allowed."))

    # 2. ceiling height vs hood clearance
    ceil_m = facts.get("ceilingM") or (facts.get("clearHeightFt") * M_PER_FT if facts.get("clearHeightFt") else None)
    if ceil_m:
        low = ceil_m < HOOD_MIN_CEILING_M
        basis = "walk export bounding box (scanned shell, floor to highest point)" if facts.get("ceilingM") else "triage clear-height value"
        out.append(_f("run-ceiling", "layout_inefficiency", f"Ceiling height about {ceil_m:.1f} m ({ceil_m / M_PER_FT:.0f} ft)",
                      f"DERIVED from {basis}: {'below' if low else 'at or above'} the {HOOD_MIN_CEILING_M} m planning rule of thumb for a hood plus clearance "
                      f"(ASSUMPTION; local code governs). The scan measures the highest point, which may be a vault or duct, not the typical ceiling.",
                      sev="medium" if low else "low", conf=0.6 if facts.get("ceilingM") else 0.4, label="medium" if facts.get("ceilingM") else "low",
                      status="derived", source=src, ref=basis, step="Measure the finished ceiling at the cook line and under any duct or beam.", grounding="inferred"))
    else:
        out.append(_f("run-ceiling", "layout_inefficiency", "Ceiling height: not measured",
                      "DEMO ESTIMATE: no scan or triage clear height for this site; a 9 to 12 ft ceiling is typical for street retail, so a hood is plausible "
                      "but unconfirmed.", sev="unknown", conf=0.25, label="low", status="estimated", source="listing_text", ref="no height on file",
                      step="Measure the ceiling height in the intended kitchen area."))

    # 3. restrooms
    r = facts.get("restrooms")
    need = max(1, math.ceil((sqft or 1200) / OCCUPANT_SQFT / 75))
    if r is not None and facts.get("restroomsBasis") == "scan":
        out.append(_f("run-restrooms", "plumbing", f"Restrooms: {r} counted in the scan",
                      f"DERIVED from the scan walk export: {r} restroom(s). At least one must be ADA-accessible; the count needed depends on the "
                      f"occupant load (about {need} at the {OCCUPANT_SQFT} sq ft per person rule of thumb, an ASSUMPTION).",
                      sev="low" if r >= need else "medium", conf=0.55, label="medium", status="derived", source=src, ref="walk export object counts",
                      step="Verify fixture count, accessible stall clearances and whether restrooms are inside the leased suite or shared."))
    else:
        est = r or max(1, round((sqft or 1200) / 1500))
        out.append(_f("run-restrooms", "plumbing", f"Restrooms: about {est} (estimate)",
                      f"DEMO ESTIMATE: restroom count is not observed for this site; {est} is estimated from floor area ({sqft or 'unknown'} sq ft). "
                      "At least one must be ADA-accessible.", sev="unknown", conf=0.3, label="low", status="estimated", source=src, ref="area-based estimate",
                      step="Count restrooms and confirm at least one accessible stall and lavatory."))

    # 4. ADA entrance
    out.append(_f("run-ada", "egress_accessibility", "ADA entrance: step-free entry unverified",
                  "DEMO ESTIMATE: a step-free front entrance, 32 in clear door width and a compliant threshold are typical for new retail but cannot be seen in this "
                  f"data{' (ground-floor scan suite)' if scan else ''}.", sev="unknown", conf=0.35, label="low", status="estimated", source=src,
                  ref="no entrance geometry extracted", step="Check the entrance for steps or a high threshold, door width and ramp slope.", can=True))

    # 5. sprinklers
    sp = facts.get("hasSprinklers")
    if sp is None:
        out.append(_f("run-sprinklers", "other", "Fire sprinklers: unknown",
                      "DEMO ESTIMATE: CoStar has no sprinkler flag for this building; buildings built after about 1990 usually have them, older ones often do not.",
                      sev="unknown", conf=0.3, label="low", status="estimated", source="listing_text", ref="CoStar: hasSprinklers not recorded",
                      step="Look for sprinkler heads and the riser; ask for the last fire-marshal inspection."))
    else:
        out.append(_f("run-sprinklers", "other", "Fire sprinklers: " + ("recorded" if sp else "not recorded in the CoStar record"),
                      f"DERIVED from the CoStar record: hasSprinklers = {sp}. A food-service change of use can trigger sprinkler or suppression upgrades.",
                      sev="low" if sp else "medium", conf=0.6, label="medium", status="derived", source="listing_text", ref="CoStar: hasSprinklers",
                      step="Verify heads in the suite, coverage and the last test tag."))

    # 6. electrical panel
    yr = facts.get("renovatedYear") or facts.get("yearBuilt")
    old = bool(yr and yr < 1990)
    out.append(_f("run-electrical", "electrical", "Electrical panel: " + (f"building era {yr}, likely older service" if old else "service capacity unknown"),
                  (f"DEMO ESTIMATE: building {'built' if not facts.get('renovatedYear') else 'last renovated'} {yr}; panels of that era are often undersized for "
                   "commercial kitchen and coffee equipment (a rule of thumb, not a reading)." if yr else
                   "DEMO ESTIMATE: no year built or panel data on file; a café or restaurant fit-out usually needs 200 A or more of service (ASSUMPTION)."),
                  sev="medium" if old else "unknown", conf=0.35, label="low", status="estimated", source="listing_text",
                  ref=f"CoStar year {yr}" if yr else "no year on file", step="Photograph the panel label, read amperage and open breaker spaces; get an electrician's load estimate."))

    # 7. floor condition
    out.append(_f("run-floor", "flooring", "Floor condition: not assessed",
                  "DEMO ESTIMATE: floor finish and slab condition are not visible in the data we hold. Prior food use would also imply drain locations and a possible "
                  "depressed slab." if spells else "DEMO ESTIMATE: floor finish and slab condition are not visible in the data we hold.",
                  sev="unknown", conf=0.25, label="low", status="estimated", source=src, ref="no floor imagery analysed",
                  step="Walk the floor for cracks, uneven slab, stains and existing floor drains.", can=True))

    # 8. egress
    load = math.ceil((sqft or 1200) / OCCUPANT_SQFT)
    two = load >= 50
    out.append(_f("run-egress", "egress_accessibility", f"Egress: occupant load about {load}, {'two exits' if two else 'one exit'} by rule of thumb",
                  f"DEMO ESTIMATE: {sqft or 1200} sq ft at {OCCUPANT_SQFT} sq ft per person gives an occupant load near {load}; loads of 50 or more usually need two "
                  "exits (ASSUMPTION; the building code governs). Exits are not extracted from the scan.",
                  sev="medium" if two else "low", conf=0.3, label="low", status="estimated", source=src, ref=f"area {sqft or 'assumed 1200'} sq ft",
                  step="Count exits and their travel distance on site; check the posted occupant load."))

    # 9. HVAC / rooftop units
    ru = facts.get("rooftopUnits")
    out.append(_f("run-hvac", "hvac", f"HVAC: {ru} rooftop unit(s) counted" if ru else "HVAC: equipment age and capacity unknown",
                  (f"DERIVED from the aerial/triage rooftop count: {ru} unit(s). Age, tonnage and whether they serve this suite are not known."
                   if ru else "DEMO ESTIMATE: no rooftop or mechanical data on file; coffee and kitchen heat loads usually need dedicated cooling."),
                  sev="unknown", conf=0.35, label="low", status="derived" if ru else "estimated", source="listing_text", ref="aerial/triage rooftop units" if ru else "no data",
                  step="Read the nameplates on the units serving the suite; ask for service records."))

    # 10. grease interceptor / plumbing
    out.append(_f("run-grease", "plumbing", "Grease interceptor and floor drains: unverified",
                  "DEMO ESTIMATE: most jurisdictions require a grease interceptor for food service; whether one exists, and floor drains near the cook line, is "
                  "unknown for this site." + (" Prior food tenants make it more likely." if spells or cafe else ""),
                  sev="unknown", conf=0.3, label="low", status="estimated", source=src, ref="prior food tenancy" if spells else "no plumbing data",
                  step="Locate the interceptor (often under the slab or outside) and floor drains; confirm sewer connection size."))
    return out


def build_demo(facts: dict) -> dict:
    findings = link_costs(demo_findings(facts))
    n_der = sum(1 for f in findings if f.get("status") == "derived")
    basis = ("a scan walk export and records" if facts.get("hasScan") else "CoStar and aerial records") if (facts.get("hasScan") or facts.get("hasAerial")) else "defaults only"
    return {"findings": findings, "mode": MODE,
            "notice": (f"DEMO ESTIMATE: rule-based checks from {basis}; no vision model ran, so none of this is an observation of this property. "
                       f"{n_der} of {len(findings)} findings are derived from an observed fact, the rest are labelled estimates. "
                       "An on-site inspector must verify every item.")}
