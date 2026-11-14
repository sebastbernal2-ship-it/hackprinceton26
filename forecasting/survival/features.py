"""Covariate design: market, property type, class, sqft, lease type, employees, start year."""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd


@dataclass
class Preprocessor:
    log_sqft_median: float = 0.0
    log_emp_median: float = 0.0
    columns: list[str] = field(default_factory=list)

    def _raw(self, df: pd.DataFrame) -> pd.DataFrame:
        X = pd.DataFrame(index=df.index)
        X["market_la"] = (df["market_id"] == 20).astype(float)
        pt = df["property_type"]
        X["ptype_multifamily"] = (pt == 11).astype(float)
        X["ptype_retail"] = (pt == 6).astype(float)
        X["ptype_other"] = (~pt.isin([5, 11, 6])).astype(float)  # reference: Office
        bc = df["building_class"]
        X["class_a"] = (bc == 1).astype(float)
        X["class_b"] = (bc == 2).astype(float)
        X["class_unknown"] = (~bc.isin([1, 2, 3])).astype(float)  # reference: C
        lt = df["lease_type"]
        X["lease_unknown"] = (lt == 0).astype(float)
        X["lease_other"] = (~lt.isin([0, 1])).astype(float)  # reference: Direct
        ls = np.log1p(df["sqft"])
        X["sqft_missing"] = ls.isna().astype(float)
        X["log_sqft"] = ls.fillna(self.log_sqft_median)
        le = np.log1p(df["employees"])
        X["employees_missing"] = le.isna().astype(float)
        X["log_employees"] = le.fillna(self.log_emp_median)
        X["start_year_c"] = (df["start_year"] - 2018) / 5.0
        return X

    def fit(self, df: pd.DataFrame) -> "Preprocessor":
        self.log_sqft_median = float(np.nanmedian(np.log1p(df["sqft"]))) if df["sqft"].notna().any() else 0.0
        self.log_emp_median = float(np.nanmedian(np.log1p(df["employees"]))) if df["employees"].notna().any() else 0.0
        X = self._raw(df)
        self.columns = [c for c in X.columns if X[c].std() > 0]  # drop constants
        return self

    def transform(self, df: pd.DataFrame) -> pd.DataFrame:
        return self._raw(df)[self.columns]
