"""Seeded Monte Carlo over build-out cost and time-to-open, dead rent and delay cost.

Method: each line price ~ triangular(low, mid, high) (mode at midpoint: an assumption, no market distribution is
claimed); contingency ~ uniform(low, high); each task ~ PERT (beta-scaled) and tasks run in series; dead rent =
monthly_rent * max(0, time_to_open - rent_free_months); delay cost = rate * max(0, time_to_open - planned months).
Intervals are 5th-95th percentile spreads of the stated input ranges, not confidence intervals."""
from __future__ import annotations

import random
from dataclasses import dataclass

from .scenario import Scenario, unknown_inputs

LABEL = "scenario analysis, not a forecast"
METHOD = (
    "Seeded Monte Carlo over user/catalog input ranges: line prices triangular(low, midpoint, high), contingency "
    "uniform, task durations PERT-beta in series, dead rent and delay cost from simulated time-to-open. Intervals are "
    "p5-p95 of the simulated spread given those inputs; they are not confidence intervals and not a forecast. "
    "Unknown inputs block the dependent outputs; they are never treated as zero."
)


def percentile(sorted_vals: list[float], p: float) -> float:
    if not sorted_vals:
        raise ValueError("empty")
    k = (len(sorted_vals) - 1) * p / 100.0
    f = int(k)
    c = min(f + 1, len(sorted_vals) - 1)
    return sorted_vals[f] + (sorted_vals[c] - sorted_vals[f]) * (k - f)


@dataclass(frozen=True)
class Interval:
    p5: float
    p50: float
    p95: float


def _interval(vals: list[float]) -> Interval:
    v = sorted(vals)
    return Interval(percentile(v, 5), percentile(v, 50), percentile(v, 95))


@dataclass(frozen=True)
class MCResult:
    status: str  # "estimated" (all components known) | "partial" | "unknown"
    n_draws: int
    seed: int
    buildout: Interval | None
    time_to_open_months: Interval | None
    dead_rent: Interval | None
    delay_cost: Interval | None
    total: Interval | None
    p_over_budget: float | None  # None when total or budget unknown
    unknown_inputs: dict
    label: str = LABEL
    method: str = METHOD


def _pert(rng: random.Random, lo: float, mode: float, hi: float) -> float:
    if hi == lo:
        return lo
    a = 1 + 4 * (mode - lo) / (hi - lo)
    b = 1 + 4 * (hi - mode) / (hi - lo)
    return lo + (hi - lo) * rng.betavariate(a, b)


def run(s: Scenario, n: int = 10_000, seed: int = 0) -> MCResult:
    unk = unknown_inputs(s)
    ok_b, ok_t = not unk["buildout"], not unk["time"]
    ok_o = ok_t and not unk["occupancy"]
    ok_d = ok_t and not unk["delay"]
    rng = random.Random(seed)
    priced = [(s.item(l.item_id), l.quantity) for l in s.lines] if ok_b else []
    B, T, O, D, TOT, over = [], [], [], [], [], 0
    for _ in range(n):
        if ok_b:
            sub = 0.0
            for it, q in priced:
                sub += q * rng.triangular(it.price_low, it.price_high, (it.price_low + it.price_high) / 2)
            lines_sub = sub
            fee = s.permit_schedule.total_fee(lines_sub) if s.permit_schedule is not None else 0.0
            c = rng.uniform(s.contingency_low, s.contingency_high)
            b = (lines_sub + fee) * (1 + c)
            B.append(b)
        if ok_t:
            t = sum(_pert(rng, k.low, k.mode, k.high) for k in s.tasks)
            T.append(t)
            if ok_o:
                O.append(s.monthly_rent * max(0.0, t - s.rent_free_months))
            if ok_d:
                D.append(s.delay_cost_per_month * max(0.0, t - s.planned_open_months))
        if ok_b and ok_o and ok_d:
            tot = B[-1] + O[-1] + D[-1]
            TOT.append(tot)
            if s.budget is not None and tot > s.budget:
                over += 1
    full = bool(TOT)
    status = "estimated" if full else ("partial" if (B or T) else "unknown")
    return MCResult(
        status, n, seed,
        _interval(B) if B else None, _interval(T) if T else None,
        _interval(O) if O else None, _interval(D) if D else None,
        _interval(TOT) if TOT else None,
        over / n if full and s.budget is not None else None, unk)
