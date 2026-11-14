"""Scenario inputs shared by the cost, Monte Carlo and sensitivity modules."""
from __future__ import annotations

from dataclasses import dataclass

from .price_catalog import ITEMS, CatalogItem, TieredFeeSchedule
from .timeline_model import Task


@dataclass(frozen=True)
class Line:
    item_id: str
    quantity: float | None  # None = unknown


@dataclass(frozen=True)
class Scenario:
    lines: tuple[Line, ...]
    contingency_low: float | None  # fraction, e.g. 0.10; a stated assumption
    contingency_high: float | None
    tasks: tuple[Task, ...]
    monthly_rent: float | None
    rent_free_months: float | None
    delay_cost_per_month: float | None  # carrying cost per month beyond planned_open_months
    planned_open_months: float | None
    budget: float | None  # pre-opening spend ceiling (build-out + dead rent + delay cost)
    permit_schedule: TieredFeeSchedule | None = None  # None = permit fees excluded (noted, not zero)
    catalog: tuple[CatalogItem, ...] | None = None  # defaults to price_catalog.ITEMS

    def item(self, item_id: str) -> CatalogItem:
        if self.catalog is not None:
            return {c.item_id: c for c in self.catalog}[item_id]
        return ITEMS[item_id]


def unknown_inputs(s: Scenario) -> dict[str, list[str]]:
    """Unknown inputs grouped by the component they block: buildout, time, occupancy, delay."""
    build, time_ = [], []
    for ln in s.lines:
        it = s.item(ln.item_id)
        if ln.quantity is None:
            build.append(f"quantity:{ln.item_id}")
        if not it.known:
            build.append(f"price:{ln.item_id}")
    if s.contingency_low is None or s.contingency_high is None:
        build.append("contingency")
    time_ += [f"task:{t.name}" for t in s.tasks if not t.known]
    if not s.tasks:
        time_.append("tasks")
    occ = [n for n, v in (("monthly_rent", s.monthly_rent), ("rent_free_months", s.rent_free_months)) if v is None]
    delay = [n for n, v in (("delay_cost_per_month", s.delay_cost_per_month),
                            ("planned_open_months", s.planned_open_months)) if v is None]
    return {"buildout": build, "time": time_, "occupancy": occ, "delay": delay}
