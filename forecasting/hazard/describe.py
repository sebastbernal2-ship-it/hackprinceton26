"""Descriptive tenure table: median tenure and 1/2/3-year survival (Kaplan-Meier, any exit ends a spell)
and 1/2/3-year closure incidence (Aalen-Johansen), by industry group x market, bootstrap over properties."""
from __future__ import annotations

import numpy as np
import pandas as pd

from forecasting.survival.metrics import aj_cif

MIN_N = 30


def km(time, event, ts):
    """Kaplan-Meier S(t) at ts and median (nan if not reached). event: bool any exit."""
    o = np.argsort(time, kind="stable")
    t, e = time[o], event[o]
    n = len(t)
    ut, first = np.unique(t, return_index=True)
    at_risk = n - first
    d = np.add.reduceat(e.astype(int), first)
    s = np.cumprod(1 - d / at_risk)
    def at(x):
        i = np.searchsorted(ut, x, side="right") - 1
        return 1.0 if i < 0 else s[i]
    below = np.flatnonzero(s <= 0.5)
    med = float(ut[below[0]]) if len(below) else float("nan")
    return [at(x) for x in ts], med


def cell_stats(g: pd.DataFrame):
    t, et = g["years"].values, g["etype"].values
    s, med = km(t, et > 0, (1, 2, 3))
    c = [aj_cif(t, et, h) for h in (1, 2, 3)]
    return np.array([med, *s, *c])


COLS = ["median_tenure_y", "surv_1y", "surv_2y", "surv_3y", "closure_1y", "closure_2y", "closure_3y"]


def table(df: pd.DataFrame, by=("industry_group", "market"), n_boot=200, seed=0, min_n=MIN_N) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    out = []
    for key, g in df.groupby(list(by)):
        if len(g) < min_n:
            continue
        pt = cell_stats(g)
        props = g["propertyId"].values
        idx = {p: np.flatnonzero(props == p) for p in np.unique(props)}
        keys = list(idx)
        bs = []
        for _ in range(n_boot):
            sel = np.concatenate([idx[keys[i]] for i in rng.integers(0, len(keys), len(keys))])
            bs.append(cell_stats(g.iloc[sel]))
        bs = np.array(bs)
        row = dict(zip(by, key if isinstance(key, tuple) else (key,)))
        row.update(n_spells=len(g), n_properties=len(keys), n_closures=int((g["etype"] == 1).sum()))
        for j, c in enumerate(COLS):
            v = bs[:, j]
            ok = ~np.isnan(v)
            row[c] = pt[j]
            # unknown is never 0: an interval needs the quantity defined in >=90% of resamples
            row[c + "_lo"] = np.percentile(v[ok], 2.5) if ok.mean() >= 0.9 else np.nan
            row[c + "_hi"] = np.percentile(v[ok], 97.5) if ok.mean() >= 0.9 else np.nan
        out.append(row)
    return pd.DataFrame(out)
