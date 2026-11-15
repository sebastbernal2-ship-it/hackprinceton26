"""Cause-specific Cox hazards (closure; other exit) fit on all industries with an industry-group term."""
from __future__ import annotations

import numpy as np
import pandas as pd

from forecasting.survival.model import CompetingCox
from forecasting.survival.features import Preprocessor as _Base

from .data import FOOD, GROUPS, UNKNOWN

INDUSTRY_LEVELS = sorted(set(GROUPS.values()) | {UNKNOWN})


class Pre(_Base):
    """Survival covariates + industry-group dummies (reference = Food & accommodation) + market 'Other'.
    start year is clipped to the training range so test-period years are not extrapolated."""
    use_industry = True

    def _raw(self, df):
        X = super()._raw(df)
        X["market_other"] = (df["market"] == "Other").astype(float)
        X["start_year_c"] = (df["start_year"].clip(upper=getattr(self, "max_year", 2100)) - 2018) / 5.0
        if self.use_industry:
            for g in INDUSTRY_LEVELS:
                if g != FOOD:
                    X["ind_" + g] = (df["industry_group"] == g).astype(float)
        return X

    def fit(self, df):
        self.max_year = int(df["start_year"].max())
        return super().fit(df)


class FoodOnlyPre(Pre):
    use_industry = False


class HazardCox(CompetingCox):
    def __init__(self, penalizer=0.05, pre_cls=Pre):
        super().__init__(penalizer)
        self.pre_cls = pre_cls

    def fit(self, df):
        self.pre = self.pre_cls().fit(df)
        X = self.pre.transform(df)
        self.m1 = self._fit_one(X, df["years"], df["etype"] == 1)
        self.m2 = self._fit_one(X, df["years"], df["etype"] == 2)
        # coarse grid up to 6y keeps prediction cheap and exact at the evaluated horizons
        g = np.unique(np.concatenate([self.m1.baseline_cumulative_hazard_.index.values, self.m2.baseline_cumulative_hazard_.index.values]))
        self.grid = g[g <= 6.0]
        self.H1, self.H2 = self._step(self.m1), self._step(self.m2)
        return self
