"""Deterministic low/high cost. Build-out, occupancy (dead rent) and delay costs are kept separate.
Unknown inputs make the dependent component None; they are never treated as zero."""
from __future__ import annotations

from dataclasses import dataclass

from . import timeline_model
from .scenario import Scenario, unknown_inputs

Range = tuple[float, float]


@dataclass(frozen=True)
class LineCost:
    item_id: str
    quantity: float | None
    unit: str
    low: float | None
    high: float | None
    status: str  # "estimated" | "unknown"
    source_url: str
    as_of: str


@dataclass(frozen=True)
class CostEstimate:
    status: str  # "estimated" only when every component and the total are known
    lines: tuple[LineCost, ...]
    equipment_subtotal: Range | None
    permit_fees: Range | None  # None with permit_included False => excluded, not zero
    permit_included: bool
    contingency: Range | None
    buildout: Range | None
    occupancy_dead_rent: Range | None
    delay: Range | None
    total: Range | None
    unknown_inputs: dict
    known_lines_subtotal_partial: Range  # sum over fully known lines only; NOT a total
    label: str = "scenario analysis, not a forecast"


def _mul(a: float | None, b: float | None) -> float | None:
    return None if a is None or b is None else a * b


def estimate(s: Scenario) -> CostEstimate:
    unk = unknown_inputs(s)
    lines = []
    for ln in s.lines:
        it = s.item(ln.item_id)
        lo, hi = (_mul(ln.quantity, it.price_low), _mul(ln.quantity, it.price_high))
        lines.append(LineCost(ln.item_id, ln.quantity, it.unit, lo, hi, "estimated" if lo is not None else "unknown",
                              it.source_url, it.as_of))
    partial = (sum(l.low for l in lines if l.low is not None), sum(l.high for l in lines if l.high is not None))
    sub = None
    if lines and all(l.low is not None for l in lines):
        sub = (partial[0], partial[1])
    permit = None
    if s.permit_schedule is not None and sub is not None:
        permit = (s.permit_schedule.total_fee(sub[0]), s.permit_schedule.total_fee(sub[1]))
    contingency = buildout = None
    need_permit = s.permit_schedule is not None
    if sub is not None and s.contingency_low is not None and s.contingency_high is not None and (permit or not need_permit):
        base = (sub[0] + (permit[0] if permit else 0.0), sub[1] + (permit[1] if permit else 0.0))
        buildout = (base[0] * (1 + s.contingency_low), base[1] * (1 + s.contingency_high))
        contingency = (buildout[0] - base[0], buildout[1] - base[1])
    tl = timeline_model.estimate(s.tasks)
    occ = delay = None
    if tl.status == "estimated":
        if s.monthly_rent is not None and s.rent_free_months is not None:
            occ = tuple(s.monthly_rent * max(0.0, t - s.rent_free_months) for t in (tl.low, tl.high))
        if s.delay_cost_per_month is not None and s.planned_open_months is not None:
            delay = tuple(s.delay_cost_per_month * max(0.0, t - s.planned_open_months) for t in (tl.low, tl.high))
    total = None
    if buildout and occ and delay:
        total = tuple(buildout[i] + occ[i] + delay[i] for i in (0, 1))
    return CostEstimate("estimated" if total else "unknown", tuple(lines), sub, permit, s.permit_schedule is not None,
                        contingency, buildout, occ, delay, total, unk, partial)
