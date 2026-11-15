"""Intake -> shortlist -> assess -> replan glue. Deterministic; no LLM, no invented scores."""
import dataclasses
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from integration import intake  # noqa: E402
from integration.constraint_filter import filter as cf  # noqa: E402
from planning import assessment  # noqa: E402

from . import concept_gate, picker  # noqa: E402

from .models import (  # noqa: E402
    AssessInputs, AssessRequest, ConstraintVerdict, Match, ParsedProfile, ProjectionCard, ScenarioAssessment,
    Alignment, ShortlistMatch,
)

LIMIT = 3
PROFILE_KEYS = {"cities": "cities", "minAreaSqft": "min_area_sqft", "maxAreaSqft": "max_area_sqft", "minSeats": "min_seats",
                "maxSeats": "max_seats", "budget": "budget", "requireActiveListing": "require_active_listing",
                "requireScanModel": "require_scan_model", "requireRestaurantUse": "require_restaurant_use"}
ASSESS_KEYS = set(AssessInputs.model_fields)
SRC = "api-listing-data"


def city_name(m: Match) -> str:
    return m.city.split(",")[0].strip()


def profile_from_brief(brief, pool: list[Match]) -> tuple[cf.Profile, dict]:
    cities = sorted({city_name(m) for m in pool if city_name(m)})
    return intake.parse_brief([e.answer for e in brief], cities)


def to_parsed(p: cf.Profile, why: dict | None = None) -> ParsedProfile:
    return ParsedProfile(cities=list(p.cities) if p.cities else None, minAreaSqft=p.min_area_sqft, maxAreaSqft=p.max_area_sqft,
                         minSeats=p.min_seats, maxSeats=p.max_seats, budget=p.budget,
                         requireActiveListing=p.require_active_listing, requireScanModel=p.require_scan_model,
                         requireRestaurantUse=p.require_restaurant_use, matchedText=why or {})


def from_parsed(pp: ParsedProfile) -> cf.Profile:
    return cf.Profile(cities=tuple(pp.cities) if pp.cities else None, min_area_sqft=pp.minAreaSqft, max_area_sqft=pp.maxAreaSqft,
                      min_seats=pp.minSeats, max_seats=pp.maxSeats, budget=pp.budget,
                      require_active_listing=pp.requireActiveListing, require_scan_model=pp.requireScanModel,
                      require_restaurant_use=pp.requireRestaurantUse)


def site_facts(m: Match, cost_bounds: tuple[float, float] | None) -> cf.SiteFacts:
    """Facts only where the data has them; seat capacity and use permission have no source so stay unknown."""
    f = {"city": cf.Fact(city_name(m), "observed", SRC, str(m.listingId), "", m.city)}
    if m.spaceSquareFeet:
        # The space you would lease: CoStar's listed available space, else the floor area measured from this site's scan.
        # The building's area (m.squareFeet) is deliberately NOT used: it says nothing about the suite.
        scan, est = m.spaceSource == "scan", m.spaceSource == picker.ESTIMATE
        f["listed_space_area_sqft"] = cf.Fact(m.spaceSquareFeet, "estimated" if est else "observed",
                                              "estimate://cafe-kit-demo-area" if est else "matterport-scan-area" if scan else SRC, str(m.listingId), "", m.city,
                                              "assumed demo floor area for this cafe scan, never measured; the scan is not a listing" if est else
                                              "floor area measured from the scan of this model; the scanned space may not be the suite for lease"
                                              if scan else "listed available space; suite identity and freshness unverified")
        # Seats are never listed. ESTIMATE from area using the same stated planning assumptions as the layout and cost tools:
        # low = total area per seat 30 sq ft (dining + kitchen + back of house); high = 70% dining share at 15 sq ft per seat.
        why = f"estimated from {m.spaceSquareFeet:g} sq ft: {SQFT_PER_SEAT_TOTAL:g} sq ft per seat overall (low) to {DINING_SHARE:.0%} dining at {SQFT_PER_SEAT_DINING:g} sq ft per seat (high); planning assumptions, not a code or measured figure"
        for key, seats in (("seat_capacity_low", m.spaceSquareFeet / SQFT_PER_SEAT_TOTAL),
                           ("seat_capacity_high", m.spaceSquareFeet * DINING_SHARE / SQFT_PER_SEAT_DINING)):
            f[key] = cf.Fact(int(seats), "estimated", "estimate://seats-from-area-v1", str(m.listingId), "", m.city, why)
    if m.tourId:
        f["accessible_model_count"] = cf.Fact(1, "observed", SRC, str(m.listingId), "", m.city, "model association only")
    mk = next((c for c in m.factors if c.factorId == "property_market" and c.status == "observed" and c.value), None)
    if mk:
        f["listing_status"] = cf.Fact(mk.value, "observed", mk.source, mk.recordId, mk.asOf, mk.geography,
                                      "snapshot status; not freshness-checked")
    if cost_bounds:
        lim = ("neutral catalog estimate, identical for every site; excludes repairs and hidden defects, "
               "so the high end is not an upper bound")
        f["build_out_cost_low"] = cf.Fact(cost_bounds[0], "estimated", "estimate://neutral-band-v1", "", "", "", lim)
        f["build_out_cost_high"] = cf.Fact(cost_bounds[1], "estimated", "estimate://neutral-band-v1", "", "", "", lim)
    return cf.SiteFacts(str(m.listingId), f)


def _verdicts(res: cf.SiteResult) -> list[ConstraintVerdict]:
    return [ConstraintVerdict(constraint=r.constraint, status=r.status, reason=r.reason,
                              missingFields=list(r.missing_fields), evidence=r.evidence) for r in res.results]


SQFT_PER_SEAT_TOTAL, SQFT_PER_SEAT_DINING, DINING_SHARE = 30.0, 15.0, 0.7
CONSTRAINT_LABELS = {"city": "City", "area": "Suite area", "seats": "Seat capacity", "budget": "Build-out budget",
                     "scan_model": "3D scan available", "active_listing": "Active listing", "restaurant_use": "Restaurant use permitted"}


def alignment(res: cf.SiteResult) -> Alignment:
    label = lambda r: CONSTRAINT_LABELS.get(r.constraint, r.constraint.replace("_", " ").capitalize())  # noqa: E731
    est = lambda r: any(v.get("status") != "observed" for v in r.evidence.values())  # noqa: E731
    return Alignment(total=len(res.results), pass_=sum(r.status == cf.PASS for r in res.results),
                     estimatedItems=[label(r) for r in res.results if r.status == cf.PASS and est(r)],
                     unknown=sum(r.status == cf.UNKNOWN for r in res.results), fail=sum(r.status == cf.FAIL for r in res.results),
                     confirmed=[label(r) for r in res.results if r.status == cf.PASS],
                     unknownItems=[label(r) for r in res.results if r.status == cf.UNKNOWN])


def shortlist(pool: list[Match], profile: cf.Profile, limit: int | None = None, brief_text: str = "", gate: dict | None = None):
    """(shown, counts, excluded, notShown). PASS first, then the space picker's order (food-service concept, scan, area, seats, budget, city),
    then more confirmed requirements, evidenceReadiness, listingId. Each row carries `pick` (reasons; best match is labelled demo)."""
    limit = limit or LIMIT
    concept = picker.detect_concept(brief_text)
    total = len(pool)
    # Concept gate: a food brief only ever sees sites whose use and suite size can host it (cafe scans are exempt).
    pool, gated, notes = concept_gate.apply(pool, profile, concept, picker.food_spells, picker.CAFE_IDS, brief_text)
    if gate is not None:
        gate["summary"] = concept_gate.summary(gated, total, concept)
    bounds = assessment.buildout_bounds() if profile.budget is not None else None
    results = {m.listingId: cf.evaluate(profile, site_facts(m, bounds)) for m in pool}
    counts = {s: sum(r.status == s for r in results.values()) for s in (cf.PASS, cf.FAIL, cf.UNKNOWN)}
    cafe_scan = lambda m: concept == "cafe" and picker.is_cafe_scan(m)  # noqa: E731
    city_fail = lambda m: any(r.constraint == "city" and r.status == cf.FAIL for r in results[m.listingId].results)  # noqa: E731
    kept = [m for m in pool if results[m.listingId].status != cf.FAIL or (cafe_scan(m) and not city_fail(m))]
    n_pass = lambda m: sum(r.status == cf.PASS for r in results[m.listingId].results)  # noqa: E731
    rows = picker.order(kept, results, profile, concept, picker.wants_prior_food(brief_text), n_pass, notes)
    out = [ShortlistMatch(**m.model_dump(), constraintStatus=results[m.listingId].status,
                          constraints=_verdicts(results[m.listingId]), alignment=alignment(results[m.listingId]),
                          missingFields=list(results[m.listingId].missing_fields),
                          pick={"reasons": why, "bestMatch": best, "concept": concept,
                                "label": "Best match (demo pick)" if best else None})
           for m, why, best in rows[:limit]]
    return out, counts, counts[cf.FAIL], max(0, len(kept) - limit)


ASSUMPTION_MAP = {"budget": "budget", "monthly_rent": "monthlyRent", "rent_free_months": "rentFreeMonths",
                  "delay_cost_per_month": "delayCostPerMonth", "planned_open_months": "plannedOpenMonths",
                  "lease_start_delay_months": "leaseStartDelayMonths"}


def run_assess(inp: AssessInputs, city: str | None, state: str | None, extra: dict | None = None) -> dict:
    """extra: legacy assumptions already folded into inp; kept for symmetry. Raises ValueError on bad ids."""
    return assessment.assess(
        city, state, budget=inp.budget,
        equipment=None if inp.equipment is None else [c if isinstance(c, str) else c.model_dump() for c in inp.equipment],
        price_overrides={k: v if isinstance(v, (int, float)) else v.model_dump() for k, v in inp.unitPriceOverrides.items()}, repairs=inp.repairs,
        lease_start_delay_months=inp.leaseStartDelayMonths, monthly_rent=inp.monthlyRent,
        rent_free_months=inp.rentFreeMonths, delay_cost_per_month=inp.delayCostPerMonth,
        planned_open_months=inp.plannedOpenMonths, n=inp.draws, seed=inp.seed)


def effective_inputs(req: AssessRequest, pool: list[Match] | None) -> tuple[AssessInputs, list[str]]:
    """Explicit fields win over legacy `assumptions`, which win over the brief-parsed budget."""
    data = req.model_dump(include=set(AssessInputs.model_fields))
    notes = []
    fields_set = req.model_fields_set
    for a in req.assumptions:
        tgt = ASSUMPTION_MAP.get(a.key)
        if tgt is None:
            notes.append(f"ignored unknown assumption key {a.key!r}")
        elif tgt not in fields_set:
            data[tgt] = a.value
    if data.get("budget") is None and req.brief and pool is not None:
        data["budget"] = profile_from_brief(req.brief, pool)[0].budget
    return AssessInputs(**data), notes


def assess_response(req: AssessRequest, models_available: bool, pool: list[Match] | None) -> ScenarioAssessment:
    inp, notes = effective_inputs(req, pool)
    city = state = None
    if req.listingId is not None and pool is not None:
        m = next((m for m in pool if m.listingId == req.listingId), None)
        if m is not None:
            parts = [x.strip() for x in m.city.split(",")]
            city, state = parts[0], parts[1] if len(parts) > 1 else None
    r = run_assess(inp, city, state)
    cards = []
    for name, key, unit in (("build-out cost (p5/p50/p95)", "buildout", "USD"), ("pre-opening total (p5/p50/p95)", "total", "USD")):
        iv = r.get(key)
        if iv:
            cards.append(ProjectionCard(kind="scenario", status="estimated", metric=name, horizon="pre-opening",
                                        scenario=r["analysisBasis"], point=iv["p50"], lower=iv["p5"], upper=iv["p95"],
                                        unit=unit, method=r["method"]))
    p = r["pOverBudget"] if r["pOverBudget"] is not None else r["pOverBudgetBuildout"]
    if p is not None:
        # The chance of exceeding the stated budget, as its own card so the UI can show it. Full basis (build-out plus
        # rent and delay) when every input is known, else build-out only; the card says which.
        full = r["pOverBudget"] is not None
        cards.append(ProjectionCard(kind="scenario", status="estimated", metric="P(over budget)" if full else "P(over budget), build-out only",
                                    horizon="pre-opening", scenario=r["analysisBasis"], point=p, lower=0.0, upper=1.0, unit="probability",
                                    method=r["method"] + (" Full basis." if full else " Build-out only: rent and delay cost excluded because an input is unknown.")))
    if city is None and req.listingId is not None:
        notes.append("listing not found or data unavailable: utility lines use no area (unknown)")
    return ScenarioAssessment(
        listingId=req.listingId, status="estimated" if p is not None else "unknown", modelsAvailable=models_available,
        assumptions=req.assumptions, projections=cards,
        note="Scenario analysis, not a forecast. " + ("Budget missing: no P(over budget)." if inp.budget is None else ""),
        analysisBasis=r["analysisBasis"], budget=inp.budget, pOverBudgetBuildout=r["pOverBudgetBuildout"],
        pOverBudget=r["pOverBudget"], buildout=r["buildout"], total=r["total"], sensitivity=r["sensitivity"],
        costLines=r["lines"], totals=r["totals"], totalsStatus=r["totalsStatus"], excludedLineIds=r["excludedLineIds"],
        assumptionsUsed=r["assumptionsUsed"], unknownInputs=r["unknownInputs"], notes=r["notes"] + notes,
        method=r["method"], seed=r["seed"], draws=r["draws"])


def _delta(a, b):
    return None if a is None or b is None else round(b - a, 4)


def replan(req, pool: list[Match]) -> dict:
    """Apply profileChange; report site status changes and the change in P(over budget). Raises ValueError."""
    base = from_parsed(req.profile) if req.profile else profile_from_brief(req.brief, pool)[0]
    pchg = {k: v for k, v in req.profileChange.items() if k in PROFILE_KEYS}
    achg = {k: v for k, v in req.profileChange.items() if k in ASSESS_KEYS}
    bad = set(req.profileChange) - set(PROFILE_KEYS) - ASSESS_KEYS
    if bad:
        raise ValueError(f"unknown profileChange keys: {sorted(bad)}")
    native = {PROFILE_KEYS[k]: (tuple(v) if k == "cities" and v else v) for k, v in pchg.items()}
    new_p = dataclasses.replace(base, **native)
    bounds = assessment.buildout_bounds() if (base.budget is not None or new_p.budget is not None) else None
    sites = [site_facts(m, bounds) for m in pool]
    out = cf.replan(base, native, sites)
    before_in = req.assess if req.assess.budget is not None or base.budget is None else req.assess.model_copy(update={"budget": base.budget})
    if before_in.budget is None and base.budget is not None:
        before_in = before_in.model_copy(update={"budget": base.budget})
    after_data = before_in.model_dump() | achg
    if "budget" in pchg and "budget" not in achg:
        after_data["budget"] = pchg["budget"]
    after_in = AssessInputs(**after_data)
    city = state = None
    if req.listingId is not None:
        m = next((m for m in pool if m.listingId == req.listingId), None)
        if m is not None:
            parts = [x.strip() for x in m.city.split(",")]
            city, state = parts[0], parts[1] if len(parts) > 1 else None
    b, a = run_assess(before_in, city, state), run_assess(after_in, city, state)
    p = {k: {"before": b[key], "after": a[key], "delta": _delta(b[key], a[key])}
         for k, key in (("buildoutOnly", "pOverBudgetBuildout"), ("full", "pOverBudget"))}
    p["budgetBefore"], p["budgetAfter"] = before_in.budget, after_in.budget
    p["note"] = "null = unknown (budget or rent/delay inputs missing); not zero."
    return {"change": req.profileChange, "changed": out["changed"], "countsBefore": out["counts_before"],
            "countsAfter": out["counts_after"], "pOverBudget": p, "note": out["note"]}
