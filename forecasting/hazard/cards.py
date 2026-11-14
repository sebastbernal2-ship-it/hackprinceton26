"""ProjectionCard-compatible dicts (kind fitted, status estimated). Emitted only when the gate passes."""
from __future__ import annotations

import numpy as np

from .data import FOOD
from .model import HazardCox

LABEL = "exploratory market prior, not a per-site prediction"
PTYPES = {"office": 5, "multifamily": 11}
MIN_SEGMENT = 30
LIMITS = ("CoStar kit tenancy records (Houston, Los Angeles; office/multifamily dominated), not restaurant sites; closure = CoStar research label "
          "ClosedLocationOrBankrupt; fitted scenario/estimate, never a guarantee")


def make_cards(spells, res, asof, b=100, seed=0, pen=0.05):
    full = HazardCox(pen).fit(spells)
    food = spells[spells["industry_group"] == FOOD]
    segs = [(mk, pn, (food["market"] == mk) & (food["property_type"] == pt)) for mk in ("Houston", "Los Angeles") for pn, pt in PTYPES.items()]
    segs = [(mk, pn, m.values) for mk, pn, m in segs if m.sum() >= MIN_SEGMENT]
    hs = [t for t in (1, 2, 3) if res["pooled"]["eval"]["horizons"][t]["valid"] and res["pooled"]["eval"]["horizons"][t]["brier_skill"] > 0]
    pt = {(mk, pn): full.cif(food[m], hs) for mk, pn, m in segs}
    rng = np.random.default_rng(seed)
    props = spells["propertyId"].values
    idx = {p: np.flatnonzero(props == p) for p in np.unique(props)}
    keys = list(idx)
    bs = {(mk, pn): {t: [] for t in hs} for mk, pn, _ in segs}
    for _ in range(b):
        s = np.concatenate([idx[keys[i]] for i in rng.integers(0, len(keys), len(keys))])
        try:
            bm = HazardCox(pen).fit(spells.iloc[s])
        except Exception:
            continue
        for mk, pn, m in segs:
            c = bm.cif(food[m], hs)
            for t in hs:
                bs[(mk, pn)][t].append(float(np.mean(c[t])))
    ci = res["pooled"]["bootstrap"]["c_index"]
    cards = []
    for mk, pn, m in segs:
        for t in hs:
            v = bs[(mk, pn)][t]
            if len(v) < 20:
                continue
            p = float(np.mean(pt[(mk, pn)][t]))
            lo, hi = min(float(np.percentile(v, 2.5)), p), max(float(np.percentile(v, 97.5)), p)
            cards.append({
                "kind": "fitted", "status": "estimated",
                "metric": f"Share of food-and-accommodation tenancies in {pn} space in {mk} ending in recorded closure/bankruptcy within {t} year(s) of start (cumulative incidence)",
                "horizon": f"{t} year(s) from tenancy start", "scenario": LABEL,
                "point": round(p, 4), "lower": round(lo, 4), "upper": round(hi, 4), "unit": "proportion",
                "method": (f"{LABEL}. Cause-specific Cox hazards (closure; other exits as a competing risk) fitted on all-industry CoStar tenancy spells "
                           f"starting 2012 or later with an industry-group term, standardized over {int(m.sum())} food-service spells in this segment. "
                           "95% percentile bootstrap over properties of the segment-average incidence (parameter/sampling uncertainty only; individual tenancies vary far more, and test Brier skill is small, about 0.03). Scenario/estimate, not a forecast or guarantee."),
                "citation": {"source": "CoStar hackathon kit (location-occupancy, company-detail, commercial-property)",
                             "recordId": f"hazard-prior:{mk}:{pn}", "asOf": asof.isoformat(), "geography": mk, "limitations": LIMITS},
                "trainingWindow": {"start": "2012-01-01", "end": asof.isoformat(), "geography": "Houston and Los Angeles CoStar markets"},
                "validation": [
                    {"name": "test_c_index_boot_lower", "value": float(ci["lo"]), "threshold": 0.5, "passed": bool(ci["lo"] > 0.5)},
                    {"name": f"test_brier_skill_{t}y", "value": float(res["pooled"]["eval"]["horizons"][t]["brier_skill"]), "threshold": 0.0, "passed": True}],
            })
    return cards
