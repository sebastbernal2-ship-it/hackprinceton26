"""Deterministic brief -> operator Profile. Keyword/number extraction only; no LLM, no guessing.

Reads what the operator wrote and nothing else. Anything not stated stays unset (constraint not applied).
Limits: negations ("no need for a scan") are not understood; a single sqft or seat number is read as a MINIMUM."""
from __future__ import annotations

import re

from .constraint_filter.filter import Profile

_NUM = r"(\d[\d,]*(?:\.\d+)?)"
_MULT = {"k": 1e3, "thousand": 1e3, "m": 1e6, "mm": 1e6, "million": 1e6}
_AREA_U = r"(?:sq\.?\s?ft\.?|sqft|square\s+feet|square\s+foot|sf)\b"
_MIN_W = r"(?:at least|min(?:imum)?(?: of)?|over|more than|no less than)"
_MAX_W = r"(?:under|up to|max(?:imum)?(?: of)?|less than|no more than|at most|below)"


def _n(s: str) -> float:
    return float(s.replace(",", ""))


def _money(text: str):
    """First dollar amount: '$250k', '$1.2 million', '$250,000', or '300k' next to 'budget'."""
    for m in re.finditer(r"\$\s?" + _NUM + r"\s*(k|m|mm|million|thousand)?\b", text):
        return _n(m.group(1)) * _MULT.get(m.group(2) or "", 1), m.group(0).strip()
    for m in re.finditer(r"budget[^.\d$]{0,30}" + _NUM + r"\s*(k|m|mm|million|thousand)\b", text):
        return _n(m.group(1)) * _MULT[m.group(2)], m.group(0).strip()
    # '200k budget', 'under 200k', 'up to 1.2 million': a k/m/million suffix is required so
    # plain numbers such as 'under 3000 sq ft' are never read as money.
    for m in re.finditer(_NUM + r"\s*(k|m|mm|million|thousand)\s+budget\b", text):
        return _n(m.group(1)) * _MULT[m.group(2)], m.group(0).strip()
    for m in re.finditer(_MAX_W + r"\s*" + _NUM + r"\s*(k|m|mm|million|thousand)\b", text):
        return _n(m.group(1)) * _MULT[m.group(2)], m.group(0).strip()
    return None


def _range_or_bound(text: str, unit: str):
    """(min, max, matched) for '1,500-2,500 <unit>', 'under 3000 <unit>', 'at least 1000 <unit>', '1500 <unit>' (min)."""
    m = re.search(_NUM + r"\s*(?:-|–|to)\s*" + _NUM + r"\s*" + unit, text)
    if m:
        return _n(m.group(1)), _n(m.group(2)), m.group(0)
    m = re.search(_MAX_W + r"\s*" + _NUM + r"\s*" + unit, text)
    if m:
        return None, _n(m.group(1)), m.group(0)
    m = re.search(_MIN_W + r"?\s*" + _NUM + r"\s*" + unit, text)
    if m:
        return _n(m.group(1)), None, m.group(0)
    return None


def parse_brief(answers: list[str], known_cities: list[str]) -> tuple[Profile, dict]:
    """Returns (Profile, matched) where matched maps each set field to the text it came from."""
    text = " . ".join(a.lower() for a in answers)
    got: dict = {}
    why: dict[str, str] = {}
    cities = [c for c in known_cities if c and re.search(rf"\b{re.escape(c.lower())}\b", text)]
    if cities:
        got["cities"] = tuple(sorted(cities))
        why["cities"] = ", ".join(got["cities"])
    if (b := _money(text)):
        got["budget"] = b[0]; why["budget"] = b[1]
    if (a := _range_or_bound(text, _AREA_U)):
        got["min_area_sqft"], got["max_area_sqft"] = a[0], a[1]; why["area"] = a[2]
    if (s := _range_or_bound(text, r"(?:seats|seating|covers)\b")):
        got["min_seats"] = None if s[0] is None else int(s[0])
        got["max_seats"] = None if s[1] is None else int(s[1]); why["seats"] = s[2]
    for field, pat in (("require_active_listing", r"\b(active listing|currently (?:listed|available)|on the market|available now)\b"),
                       ("require_scan_model", r"\b(3d|scan(?:ned)?|matterport|virtual tour|walkthrough)\b"),
                       ("require_restaurant_use", r"\b(restaurant use|zoned for (?:a )?restaurant|permitted for restaurant)")):
        if (m := re.search(pat, text)):
            got[field] = True; why[field] = m.group(0)
    return Profile(**got), why
