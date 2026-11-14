# Pooled tenancy hazard prior (H1)

Status: exploratory market prior, not a per-site prediction. Fitted outputs are scenario/estimates, never a guarantee.

## Why
The food-only survival model (`docs/models/survival.md`) failed its gate: 3 test failures. This model borrows strength from all industries.

## Data and coding
CoStar kit `location-occupancy` joined to `company-detail` (`profile.industryType`, collapsed to 9 groups) and `commercial-property` (market, type, class). Spells start 2012 or later (as in S1): 32,862 spells, not the ~74k raw occupancy rows (pre-2012 starts are excluded to avoid left truncation; ~17k rows lack a company-detail match). Closure (type 1) = `ClosedLocationOrBankrupt`; every other end, including `MovingOutNewAddressUnknown`, is a competing exit (type 2); no `toDate` or a future `toDate` is right-censored. `businessStatus` is never read. Covariates: industry group, market, property type, class, log sqft, lease type, log employees, start year (clipped to the training range), with missing indicators.

## Model
Two ridge-penalized (0.05, fixed) cause-specific Cox models (closure; other exit) on all industries with an industry-group term; cumulative incidence of closure at 1/2/3 y in Aalen-Johansen form (reuses `forecasting/survival`).

## Gate (pre-declared; cutoff chosen after viewing event counts, before any metric)
Train: all-industry spells starting 2012-2020, right-censored at 2021-01-01. Test: food spells starting 2021-01-01 or later (follow-up to 2026-11-09). Naive baseline: marginal Aalen-Johansen of food training spells. Pass = test C-index bootstrap (resampling properties, 300 reps) lower bound > 0.5 AND Brier skill > 0 at 1y and 2y AND at each of those horizons >= 5 closures and censoring survival >= 0.2.

## Results (seed 20261114)
Event counts. Train food: 417 spells, 34 closures (9/18/24 by 1/2/3y). Test food: 321 spells, 23 closures (14/19/21 by 1/2/3y). Pooled model on test: C-index 0.723 (95% CI 0.608-0.840); Brier skill 0.037 / 0.030 / 0.024 at 1/2/3y with bootstrap CIs [0.004, 0.054] / [-0.010, 0.051] / [-0.027, 0.053]. **Gate PASSED, narrowly**: skill is small and the 2y/3y skill intervals include 0.
Food-only model (old design, same covariates and split): C 0.678 (0.561-0.788); skill 0.026 / 0.038 / 0.033. The two overlap; pooling is not shown to be better, only the intervals tighten slightly. Fitted industry hazard ratios for closure versus food are all within about 0.8-1.4 (unknown industry 1.34).
Grouped 5-fold CV by property on the food subset (not temporal; 738 spells, 89 closures): C 0.730 (0.668-0.789); skill 0.025 / 0.021 / 0.029, all CIs above 0.
Sensitivity (not gating): cutoff 2022-01-01 (10 test closures): C 0.790 (0.485-0.940), skill 2y 0.009 (CI -0.105 to 0.075); would FAIL. Cutoff 2024-01-01 (3 test closures): not evaluable, FAIL.
Reading: a weak but consistent ranking signal; the improvement over a market-wide average is a few percent of Brier. Sample needed for a decisive test: roughly 20+ closures per horizon on a held-out recent window with stable C CI, e.g. a 2022+ window needs about 3x the current food closures.

## Cards
12 cards (Houston/LA x office/multifamily x 1/2/3y), `forecasting/artifacts/hazard/cards.json` (gitignored), validated against `ProjectionCard`. Label "exploratory market prior, not a per-site prediction". Intervals are 95% bootstrap over properties of the segment-average incidence and are narrow: they cover parameter uncertainty only, not tenancy-level variability. 3y cards rely on 3y skill that is not significant; treat 1y as the better supported horizon.

## Descriptive table
`descriptive_tenure.csv` (gitignored; cells with >= 30 spells, 200 property bootstraps): median tenure (any exit ends a spell; Kaplan-Meier), 1/2/3y survival, and 1/2/3y closure incidence by industry group x market, with 95% intervals; undefined medians are NaN, never 0. Example: food & accommodation median tenure 4.2y Houston (2.7-5.8), 6.1y LA (4.8-8.5) versus about 2-3y for most other groups. Tenure measures the occupancy record, not business lifetime.

## Run
```
PYTHONPATH=. uv run --no-project --with numpy --with pandas --with lifelines python -m forecasting.hazard.train
uv run --no-project --with pytest --with numpy --with pandas --with scipy --with lifelines --with pydantic pytest forecasting/hazard/tests
```
## Limitations
Closure labels are CoStar research outputs; failures concentrated in earlier starts; Houston/LA only; start-year trend is extrapolation-prone; no per-site use.
