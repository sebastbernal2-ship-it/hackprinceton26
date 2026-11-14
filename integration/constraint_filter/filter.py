"""Three-valued hard-constraint filter. Unknown is never pass and never fail.

Pure functions over (Profile, SiteFacts). No I/O here; see loader.py for the local CSV adapter.
"""
from __future__ import annotations

import dataclasses
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

PASS, FAIL, UNKNOWN = "PASS", "FAIL", "UNKNOWN"
NOT_APPLIED = "NOT_APPLIED"  # profile does not set this constraint; excluded from the roll-up
FACT_STATUSES = ("observed", "derived", "estimated", "unknown")


@dataclass(frozen=True)
class Fact:
    """A site fact with provenance. status 'unknown' (or value None) means we do not know."""
    value: Any = None
    status: str = "observed"
    source: str = ""
    record_id: str = ""
    as_of: str = ""
    geography: str = ""
    limitations: str = ""

    def known(self) -> bool:
        return self.value is not None and self.status != "unknown"


@dataclass(frozen=True)
class SiteFacts:
    site_id: str
    facts: dict[str, Fact] = field(default_factory=dict)

    def get(self, name: str) -> Fact | None:
        f = self.facts.get(name)
        return f if f is not None and f.known() else None


@dataclass(frozen=True)
class Profile:
    """Operator hard constraints. None = not set (constraint not applied)."""
    cities: tuple[str, ...] | None = None
    min_area_sqft: float | None = None
    max_area_sqft: float | None = None
    min_seats: int | None = None
    max_seats: int | None = None
    budget: float | None = None  # ceiling on build-out cost, same currency as the cost facts
    require_active_listing: bool = False
    require_scan_model: bool = False
    require_restaurant_use: bool = False


@dataclass(frozen=True)
class ConstraintResult:
    constraint: str
    status: str
    reason: str
    missing_fields: tuple[str, ...] = ()
    evidence: dict[str, dict] = field(default_factory=dict)  # fact name -> value + provenance


@dataclass(frozen=True)
class SiteResult:
    site_id: str
    status: str
    results: tuple[ConstraintResult, ...]

    @property
    def missing_fields(self) -> tuple[str, ...]:
        return tuple(sorted({m for r in self.results for m in r.missing_fields}))

    def by_constraint(self) -> dict[str, ConstraintResult]:
        return {r.constraint: r for r in self.results}


def _ev(site: SiteFacts, *names: str) -> dict[str, dict]:
    out = {}
    for n in names:
        f = site.get(n)
        if f is not None:
            out[n] = {k: v for k, v in dataclasses.asdict(f).items() if v not in ("", None)}
    return out


def _unknown(name: str, why: str, missing: tuple[str, ...], site: SiteFacts) -> ConstraintResult:
    return ConstraintResult(name, UNKNOWN, why, missing, _ev(site, *missing))


def _range(name: str, fact: str, unit: str, lo, hi, site: SiteFacts) -> ConstraintResult:
    f = site.get(fact)
    if f is None:
        return _unknown(name, f"{fact} unknown; cannot test the {unit} range", (fact,), site)
    try:
        v = float(f.value)
    except (TypeError, ValueError):
        return _unknown(name, f"{fact} is not numeric ({f.value!r})", (fact,), site)
    basis = "" if f.status == "observed" else f" ({f.status} value)"
    if lo is not None and v < lo:
        return ConstraintResult(name, FAIL, f"{fact} {v:g} below minimum {lo:g} {unit}{basis}", (), _ev(site, fact))
    if hi is not None and v > hi:
        return ConstraintResult(name, FAIL, f"{fact} {v:g} above maximum {hi:g} {unit}{basis}", (), _ev(site, fact))
    return ConstraintResult(name, PASS, f"{fact} {v:g} within [{lo}, {hi}] {unit}{basis}", (), _ev(site, fact))


def _city(p: Profile, site: SiteFacts) -> ConstraintResult:
    f = site.get("city")
    if f is None:
        return _unknown("city", "city unknown", ("city",), site)
    ok = str(f.value).strip().lower() in {c.strip().lower() for c in p.cities}
    return ConstraintResult("city", PASS if ok else FAIL,
                            f"city {f.value} {'in' if ok else 'not in'} {list(p.cities)}", (), _ev(site, "city"))


def _budget(p: Profile, site: SiteFacts) -> ConstraintResult:
    """Interval test: FAIL only if even the low estimate exceeds budget; PASS only if the high estimate fits."""
    lo, hi = site.get("build_out_cost_low"), site.get("build_out_cost_high")
    if lo is None and hi is None:
        return _unknown("budget", "no build-out cost interval for this site",
                        ("build_out_cost_low", "build_out_cost_high"), site)
    if lo is not None and float(lo.value) > p.budget:
        return ConstraintResult("budget", FAIL, f"low build-out estimate {float(lo.value):g} exceeds budget {p.budget:g}",
                                (), _ev(site, "build_out_cost_low"))
    if hi is not None and float(hi.value) <= p.budget:
        return ConstraintResult("budget", PASS, f"high build-out estimate {float(hi.value):g} within budget {p.budget:g}",
                                (), _ev(site, "build_out_cost_high"))
    missing = tuple(n for n, x in (("build_out_cost_low", lo), ("build_out_cost_high", hi)) if x is None)
    why = ("budget lies inside the estimated cost interval" if not missing
           else "only one end of the cost interval is known and it does not decide")
    return _unknown("budget", why, missing, site)


def _listing(p: Profile, site: SiteFacts) -> ConstraintResult:
    f = site.get("listing_status")
    if f is None:
        return _unknown("active_listing", "listing status unknown (missing listing is not vacant)", ("listing_status",), site)
    ok = str(f.value).strip().lower() == "active"
    return ConstraintResult("active_listing", PASS if ok else FAIL, f"listing status {f.value}", (), _ev(site, "listing_status"))


def _scan(p: Profile, site: SiteFacts) -> ConstraintResult:
    f = site.get("accessible_model_count")
    if f is None or float(f.value) <= 0:
        # no linked model is an inventory gap, not evidence that no scan exists
        return _unknown("scan_model", "no accessible scan model linked; absence is not a negative",
                        ("accessible_model_count",), site)
    return ConstraintResult("scan_model", PASS, f"{int(float(f.value))} accessible model(s) linked "
                            "(suite identity not verified)", (), _ev(site, "accessible_model_count"))


def _use(p: Profile, site: SiteFacts) -> ConstraintResult:
    f = site.get("restaurant_use_permitted")
    if f is None:
        return _unknown("restaurant_use", "restaurant use not verified with an authority",
                        ("restaurant_use_permitted",), site)
    ok = f.value is True or str(f.value).lower() == "true"
    return ConstraintResult("restaurant_use", PASS if ok else FAIL, f"restaurant_use_permitted={f.value}", (),
                            _ev(site, "restaurant_use_permitted"))


def _checks(p: Profile, site: SiteFacts) -> list[ConstraintResult]:
    out: list[ConstraintResult] = []
    if p.cities:
        out.append(_city(p, site))
    if p.min_area_sqft is not None or p.max_area_sqft is not None:
        out.append(_range("area", "listed_space_area_sqft", "sqft", p.min_area_sqft, p.max_area_sqft, site))
    if p.min_seats is not None or p.max_seats is not None:
        out.append(_range("seats", "seat_capacity", "seats", p.min_seats, p.max_seats, site))
    if p.budget is not None:
        out.append(_budget(p, site))
    if p.require_active_listing:
        out.append(_listing(p, site))
    if p.require_scan_model:
        out.append(_scan(p, site))
    if p.require_restaurant_use:
        out.append(_use(p, site))
    return out


def evaluate(profile: Profile, site: SiteFacts) -> SiteResult:
    rs = _checks(profile, site)
    st = FAIL if any(r.status == FAIL for r in rs) else UNKNOWN if any(r.status == UNKNOWN for r in rs) else PASS
    return SiteResult(site.site_id, st, tuple(rs))  # no constraints set -> vacuously PASS


def evaluate_all(profile: Profile, sites: list[SiteFacts]) -> dict[str, SiteResult]:
    return {s.site_id: evaluate(profile, s) for s in sites}


def replan(profile: Profile, change: dict[str, Any], sites: list[SiteFacts]) -> dict:
    """Apply a profile change (field -> new value); report which sites change status and why."""
    unknown_keys = set(change) - {f.name for f in dataclasses.fields(Profile)}
    if unknown_keys:
        raise ValueError(f"unknown profile fields: {sorted(unknown_keys)}")
    new = dataclasses.replace(profile, **change)
    before, after = evaluate_all(profile, sites), evaluate_all(new, sites)
    changed = []
    for sid, a in after.items():
        b = before[sid]
        if a.status == b.status:
            continue
        bc, ac = b.by_constraint(), a.by_constraint()
        why = [{"constraint": c, "from": bc[c].status if c in bc else NOT_APPLIED, "to": ac[c].status if c in ac else NOT_APPLIED,
                "reason": ac[c].reason if c in ac else "constraint no longer applied",
                "missing_fields": list(ac[c].missing_fields) if c in ac else []}
               for c in sorted(set(bc) | set(ac))
               if (bc[c].status if c in bc else NOT_APPLIED) != (ac[c].status if c in ac else NOT_APPLIED)]
        changed.append({"site_id": sid, "from": b.status, "to": a.status, "because": why})
    count = lambda rs: {s: sum(r.status == s for r in rs.values()) for s in (PASS, FAIL, UNKNOWN)}
    return {"change": change, "changed": changed, "counts_before": count(before), "counts_after": count(after),
            "note": "Scenario analysis over stated constraints, not a forecast or recommendation."}


def profile_from_requirements(path: str | Path) -> Profile:
    """Build a Profile from data/concept-requirements.json (only fields it actually states)."""
    d = json.loads(Path(path).read_text())
    prov = d.get("provisional_assumptions_for_iteration_only", {})
    area = prov.get("target_suite_area_sqft") or {}
    return Profile(
        cities=tuple(d["user_confirmed"]["cities"]) or None,
        min_area_sqft=area.get("min"), max_area_sqft=area.get("max"),
        min_seats=prov.get("required_seats"), budget=prov.get("budget"),
        require_active_listing=True, require_scan_model=True, require_restaurant_use=True)
