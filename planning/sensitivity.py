"""One-at-a-time and flip analysis over named multiplicative knobs.

Every run reuses the same seed (common random numbers) so differences come from the knob, not sampling noise.
Flip analysis answers: what multiplicative change to one assumption moves P(over budget) across `threshold`."""
from __future__ import annotations

from dataclasses import dataclass, replace

from . import monte_carlo
from .scenario import Line, Scenario
from .timeline_model import Task

LABEL = "scenario analysis, not a forecast"


def _scale(v, f):
    return None if v is None else v * f


def knobs(s: Scenario) -> dict:
    """name -> f(scenario, factor) -> scenario. Unknown values stay unknown under scaling."""
    k = {
        "budget": lambda sc, f: replace(sc, budget=_scale(sc.budget, f)),
        "monthly_rent": lambda sc, f: replace(sc, monthly_rent=_scale(sc.monthly_rent, f)),
        "contingency": lambda sc, f: replace(sc, contingency_low=_scale(sc.contingency_low, f),
                                             contingency_high=_scale(sc.contingency_high, f)),
        "delay_cost_per_month": lambda sc, f: replace(sc, delay_cost_per_month=_scale(sc.delay_cost_per_month, f)),
        "all_task_durations": lambda sc, f: replace(sc, tasks=tuple(
            Task(t.name, _scale(t.low, f), _scale(t.mode, f), _scale(t.high, f), t.basis, t.source) for t in sc.tasks)),
    }
    for i, ln in enumerate(s.lines):
        k[f"quantity:{ln.item_id}"] = (lambda i: lambda sc, f: replace(sc, lines=tuple(
            Line(l.item_id, _scale(l.quantity, f)) if j == i else l for j, l in enumerate(sc.lines))))(i)
    return k


@dataclass(frozen=True)
class OATRow:
    knob: str
    factor_low: float
    factor_high: float
    p_over_at_low: float | None
    p_over_at_high: float | None
    median_total_at_low: float | None
    median_total_at_high: float | None


@dataclass(frozen=True)
class Flip:
    knob: str
    flips: bool
    factor: float | None  # smallest-magnitude factor tested that crosses threshold (bisection, ~1e-2 resolution)
    direction: str  # "increase" | "decrease" | "none"


@dataclass(frozen=True)
class SensitivityResult:
    status: str  # "estimated" | "unknown"
    baseline_p_over: float | None
    threshold: float
    oat: tuple[OATRow, ...]
    flips: tuple[Flip, ...]
    unknown_inputs: dict
    label: str = LABEL


def _p(s, n, seed):
    r = monte_carlo.run(s, n, seed)
    return r.p_over_budget, (r.total.p50 if r.total else None)


def analyse(s: Scenario, n: int = 2000, seed: int = 0, delta: float = 0.2, threshold: float = 0.5,
            bounds: tuple[float, float] = (0.25, 4.0), steps: int = 10) -> SensitivityResult:
    base = monte_carlo.run(s, n, seed)
    if base.p_over_budget is None:
        return SensitivityResult("unknown", None, threshold, (), (), base.unknown_inputs
                                 if any(base.unknown_inputs.values()) else {"budget": ["budget"]})
    base_over = base.p_over_budget >= threshold
    rows, flips = [], []
    for name, fn in knobs(s).items():
        lo_p, lo_m = _p(fn(s, 1 - delta), n, seed)
        hi_p, hi_m = _p(fn(s, 1 + delta), n, seed)
        rows.append(OATRow(name, 1 - delta, 1 + delta, lo_p, hi_p, lo_m, hi_m))
        best = None
        for direction, (a, b) in (("decrease", (1.0, bounds[0])), ("increase", (1.0, bounds[1]))):
            edge_p, _ = _p(fn(s, b), n, seed)
            if edge_p is None or (edge_p >= threshold) == base_over:
                continue
            lo, hi = a, b  # lo keeps baseline side, hi is flipped side
            for _ in range(steps):
                mid = (lo + hi) / 2
                p, _ = _p(fn(s, mid), n, seed)
                if (p >= threshold) == base_over:
                    lo = mid
                else:
                    hi = mid
            cand = (abs(hi - 1.0), direction, hi)
            if best is None or cand < best:
                best = cand
        flips.append(Flip(name, best is not None, best[2] if best else None, best[1] if best else "none"))
    return SensitivityResult("estimated", base.p_over_budget, threshold, tuple(rows), tuple(flips), base.unknown_inputs)
