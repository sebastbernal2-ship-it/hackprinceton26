"""PERT three-point durations (months). Tasks run in series; every task needs a cited range or is marked assumption."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Task:
    name: str
    low: float | None  # None = unknown (propagates, never zero)
    mode: float | None
    high: float | None
    basis: str = "assumption"  # "cited" or "assumption"
    source: str = ""

    def __post_init__(self):
        if self.basis not in ("cited", "assumption"):
            raise ValueError("basis must be 'cited' or 'assumption'")
        if self.basis == "cited" and not self.source:
            raise ValueError(f"{self.name}: cited task needs source")
        vals = (self.low, self.mode, self.high)
        if any(v is None for v in vals):
            return
        if not (0 <= self.low <= self.mode <= self.high):
            raise ValueError(f"{self.name}: need 0 <= low <= mode <= high")

    @property
    def known(self) -> bool:
        return None not in (self.low, self.mode, self.high)

    @property
    def mean(self) -> float | None:
        return (self.low + 4 * self.mode + self.high) / 6 if self.known else None


@dataclass(frozen=True)
class TimelineEstimate:
    status: str  # "estimated" | "unknown"
    low: float | None
    pert_mean: float | None
    high: float | None
    unknown_tasks: tuple[str, ...]
    assumption_tasks: tuple[str, ...]


def estimate(tasks: list[Task] | tuple[Task, ...]) -> TimelineEstimate:
    unknown = tuple(t.name for t in tasks if not t.known)
    assumed = tuple(t.name for t in tasks if t.basis == "assumption")
    if unknown or not tasks:
        return TimelineEstimate("unknown", None, None, None, unknown, assumed)
    return TimelineEstimate("estimated", sum(t.low for t in tasks), sum(t.mean for t in tasks),
                            sum(t.high for t in tasks), (), assumed)
