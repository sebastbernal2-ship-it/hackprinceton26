"""Cause-specific Cox models (failure, other exit) -> cumulative incidence of failure."""
from __future__ import annotations

import warnings

import numpy as np
import pandas as pd
from lifelines import CoxPHFitter

from .features import Preprocessor


class CompetingCox:
    def __init__(self, penalizer: float = 0.1):
        self.penalizer = penalizer

    def _fit_one(self, X: pd.DataFrame, years, event):
        d = X.copy()
        d["T"], d["E"] = np.asarray(years), np.asarray(event).astype(int)
        m = CoxPHFitter(penalizer=self.penalizer)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            m.fit(d, duration_col="T", event_col="E")
        return m

    def fit(self, df: pd.DataFrame) -> "CompetingCox":
        self.pre = Preprocessor().fit(df)
        X = self.pre.transform(df)
        self.m1 = self._fit_one(X, df["years"], df["etype"] == 1)
        self.m2 = self._fit_one(X, df["years"], df["etype"] == 2)
        g = np.unique(np.concatenate([self.m1.baseline_cumulative_hazard_.index.values, self.m2.baseline_cumulative_hazard_.index.values]))
        self.grid = g
        self.H1 = self._step(self.m1)
        self.H2 = self._step(self.m2)
        return self

    def _step(self, m):
        bh = m.baseline_cumulative_hazard_.iloc[:, 0]
        idx = np.searchsorted(bh.index.values, self.grid, side="right") - 1
        return np.where(idx >= 0, bh.values[np.clip(idx, 0, None)], 0.0)

    def risk(self, df: pd.DataFrame) -> np.ndarray:
        """Cause-specific hazard ratio for failure (ranking marker)."""
        return self.m1.predict_partial_hazard(self.pre.transform(df)).values

    def cif(self, df: pd.DataFrame, horizons) -> dict:
        X = self.pre.transform(df)
        r1 = self.m1.predict_partial_hazard(X).values[:, None]
        r2 = self.m2.predict_partial_hazard(X).values[:, None]
        H1, H2 = self.H1[None, :] * r1, self.H2[None, :] * r2
        H1m = np.concatenate([np.zeros((len(df), 1)), H1[:, :-1]], axis=1)
        H2m = np.concatenate([np.zeros((len(df), 1)), H2[:, :-1]], axis=1)
        inc = np.exp(-(H1m + H2m)) * (H1 - H1m)
        cum = np.cumsum(inc, axis=1)
        out = {}
        for t in horizons:
            i = np.searchsorted(self.grid, t, side="right") - 1
            out[t] = cum[:, i] if i >= 0 else np.zeros(len(df))
        return out


def grouped_folds(groups, k=5, seed=0):
    """Deterministic GroupKFold-like split by propertyId."""
    rng = np.random.default_rng(seed)
    u = np.unique(groups)
    rng.shuffle(u)
    fold_of = {g: i % k for i, g in enumerate(u)}
    f = np.array([fold_of[g] for g in groups])
    return [(np.where(f != i)[0], np.where(f == i)[0]) for i in range(k)]
