"""Quarterly candidate series derived from the local CoStar kit (data/costar/series_fetch.py).

KIT-SAMPLE series (tenancy and sale records of the kit's properties), not CoStar market statistics. Quarters
with fewer than MIN_N observations, or with none, are MISSING (never zero); each series is modelled on its
trailing contiguous run of valid quarters. Incomplete final quarters of count series are dropped.
Horizons: short 1 and 4 quarters; medium 8 and 12 only if the run has >= MEDIUM_MIN_QUARTERS quarters.
"""
from __future__ import annotations

import csv
import statistics
from pathlib import Path

from .core import Spec, make_card

ROOT = Path(__file__).resolve().parents[2]
CSV = ROOT / "data" / "derived" / "costar" / "kit_quarterly_series.csv"
MIN_N = 3
LAST_QUARTER = "2026Q3"  # kit has scheduled future-dated tenancies; only quarters up to the as-of date are observed
MEDIUM_MIN_QUARTERS = 40
HORIZONS = (1, 4, 8, 12)
COUNT_SERIES = {"lease_commencements", "leased_sqft", "sale_comps"}
LABEL = {"lease_commencements": "Lease commencements per quarter in kit sample",
         "leased_sqft": "Leased square feet commencing per quarter in kit sample",
         "contract_rate_median": "Median contract rent in kit sample",
         "sale_comps": "Sale comps per quarter in kit sample",
         "sale_price_median": "Median single-property sale price in kit sample"}
METRO = {"houston": "Houston, TX", "los-angeles": "Los Angeles, CA"}


def qidx(q):
    return int(q[:4]) * 4 + int(q[5]) - 1


def qstr(i):
    return f"{i // 4}Q{i % 4 + 1}"


def load(path=CSV):
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


def trailing_run(rows, series, last=LAST_QUARTER, min_n=MIN_N):
    """rows of one (metro, series) -> (first_quarter, values, info). Missing/thin quarters end the run."""
    d = {r["quarter"]: (int(r["n"]), float(r["value"])) for r in rows if r["quarter"] <= last}
    valid = {q: v for q, (n, v) in d.items() if n >= min_n}
    info = {"quarters_observed": len(d), "quarters_valid": len(valid), "thin": len(d) - len(valid)}
    if not valid:
        return None, [], info
    end = qidx(max(valid))
    i = end
    while qstr(i) in valid:
        i -= 1
    vals = [valid[qstr(k)] for k in range(i + 1, end + 1)]
    if series in COUNT_SERIES and len(vals) > 7 and vals[-1] < 0.7 * statistics.median(vals[-7:-1]):
        vals, end = vals[:-1], end - 1  # incomplete final quarter (reporting lag)
        info["dropped_tail"] = True
    info["run"] = len(vals)
    return qstr(end - len(vals) + 1), vals, info


def spec_for(name, h, series):
    return Spec(f"{name}_h{h}", season=4, transform="log", horizon=h, min_train=24, inner_min=16, step=1,
                models=("ets", "loglin", "seasonal_mean"), also_beat=("naive",), max_ratio=0.95)


def run_costar(path=CSV):
    """Returns (cards, report). cards: list of (id, card, reason); report: list of dicts (aggregates only)."""
    rows = load(path)
    by = {}
    for r in rows:
        by.setdefault((r["metro"], r["series"]), []).append(r)
    cards, report = [], []
    for (metro, series), rs in sorted(by.items()):
        first, vals, info = trailing_run(rs, series)
        n = len(vals)
        last_q = qstr(qidx(first) + n - 1) if vals else None
        for h in HORIZONS:
            sid = f"costar:{metro}:{series}:h{h}"
            rep = {"id": sid, "n_quarters": n, **info, "horizon": h}
            if h >= 8 and n < MEDIUM_MIN_QUARTERS:
                rep.update(status="unknown", reason=f"medium horizon needs >= {MEDIUM_MIN_QUARTERS} quarters, have {n}")
                report.append(rep)
                continue
            if n < 24 + h + 8:
                rep.update(status="unknown", reason=f"only {n} contiguous valid quarters; too short for backtest at h={h}")
                report.append(rep)
                continue
            card, reason = make_card(
                vals, spec_for(f"{metro}_{series}", h, series),
                metric=f"{LABEL[series]} ({METRO[metro]}); kit sample, not a market statistic",
                unit=rs[0]["unit"], scenario="scenario/estimate: historical pattern continues, no structural break",
                horizon_text=f"{h} quarter{'s' if h > 1 else ''} ahead ({qstr(qidx(last_q) + h)})",
                window=(first, last_q), geography=METRO[metro],
                citation={"source": "CoStar Matterport kit sample (local), derived quarterly series",
                          "recordId": f"{metro}/{series}", "asOf": LAST_QUARTER, "geography": METRO[metro],
                          "limitations": f"Derived from the kit's sampled properties; quarters with n<{MIN_N} are missing, not zero; "
                                         f"not a CoStar market rent, vacancy or absorption series."})
            from .cards import finalize
            card = finalize(card, reason)
            cards.append((sid, card, reason))
            v = {x["name"]: x["value"] for x in card["validation"]}
            ratio = next((x["value"] for x in card["validation"] if x["name"].startswith("mae_ratio") and x["name"].endswith("seasonal_naive")), None)
            rn = next((x["value"] for x in card["validation"] if x["name"].endswith("_vs_naive")), None)
            cov = v.get("abs_error_of_80pct_interval_coverage")
            rep.update(status=card["status"], reason=reason, origins=int(v.get("backtest_origins", 0)),
                       mae_ratio_vs_seasonal_naive=ratio, mae_ratio_vs_naive=rn, abs_cov_err=cov)
            report.append(rep)
    return cards, report
