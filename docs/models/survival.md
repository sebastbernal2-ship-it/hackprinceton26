# Exploratory survival model (S1)

Status: exploratory descriptive market prior. It is not a per-site success prediction, not a forecast, and not an input to any score or ranking.

## Question
For food-and-beverage tenancies recorded in the CoStar kit, how long do tenancy spells last before a recorded closure or bankruptcy, by market (Houston, Los Angeles), property type, class, size, lease type, employee count and start year? The kit is dominated by office and multifamily buildings, so this is market context, not evidence about restaurant sites.

## Data and outcome coding
`location-occupancy` spells joined to `company-detail` (`profile.industryType` = AccommodationAndFoodServices) and `commercial-property` (market via `researchMarketId` 14/20). Spells start 2012 or later and no later than the as-of date (2026-11-09, end of the kit window).
- Failure (type 1): `expirationReason` = ClosedLocationOrBankrupt (4). This is CoStar's research label, not independently verified.
- Other exit (type 2, competing risk): the occupancy ended for any other reason, including MovingOutNewAddressUnknown (10), which is NOT counted as failure.
- Censored (type 0): no `toDate`, or a `toDate` after the as-of date (a scheduled end is not an observation).
- `businessStatus` is never used (it encodes the outcome).
Missing covariates are imputed with the training median plus a missing-indicator; unknown stays a separate category (class, lease type).

## Method
Two penalized cause-specific Cox models (failure; other exit) give a cumulative incidence of failure at 1, 2, 3 years (Aalen-Johansen form). Penalizer is chosen on the validation split by 2-year Brier score; grouped (by `propertyId`) 5-fold CV C-index on train is reported for stability. Split by start year: train 2012-2020, validation 2021-2023, test 2024-2026. The test model is refit on train+validation.
Baseline: marginal Aalen-Johansen cumulative incidence from train+validation (C-index 0.5 by construction); a market-only baseline is also reported. Metrics: Harrell C-index (cause-specific), IPCW time-dependent AUC and IPCW Brier score at each horizon, calibration by predicted-risk tertile versus Aalen-Johansen observed incidence. Intervals are percentile bootstraps resampling properties (clusters). Houston and Los Angeles are evaluated separately with the pooled model.
A horizon is evaluated only if the evaluation split has at least 5 failures by that horizon and censoring survival of at least 0.2; otherwise it is reported as not evaluable, never as zero.

## Gate (declared before looking at test results)
Cards are emitted only if, on the test split, the C-index bootstrap lower bound exceeds 0.5 and the Brier skill versus the naive baseline is positive at both 1 and 2 years (both horizons evaluable). Otherwise nothing is emitted and `cards.json` is deleted.

## Real result (CoStar kit, 500-rep bootstrap)
738 spells (train 417, val 165, test 156); 89 recorded failures (66/20/3). Validation (model fit on train): C-index 0.698 (95% CI 0.54-0.82); Brier skill vs baseline 0.052 / 0.086 / 0.081 at 1/2/3y, with bootstrap lower bounds 0.012 / -0.003 / -0.022; calibration-in-the-large gap -0.050 / -0.016 / -0.003.
Test split: only 3 failures (1 by 1y); 137 of 156 spells are censored. C-index 0.739 with bootstrap CI 0.19-1.00, and no horizon is evaluable. The gate FAILED, so no cards were emitted. Validation was also used to tune the penalizer, so its numbers are optimistic. Houston and LA test results are likewise not evaluable (2 and 1 failures).
Conclusion: the model shows some ranking signal on validation but cannot be shown to beat the naive baseline on held-out recent data. Do not surface it.

## Outputs and reproducibility
`forecasting/artifacts/survival/` (gitignored): `metrics.json`, `manifest.json` (sha256 of the three input files, code hash, config, split counts, covariates, `manifest_hash`) and, only if the gate passes, `cards.json`.
```
PYTHONPATH=. uv run --no-project --with numpy --with pandas --with lifelines python -m forecasting.survival.train
uv run --no-project --with pytest --with numpy --with pandas --with lifelines --with pydantic pytest forecasting/survival/tests
```
Cards are ProjectionCard-compatible (`kind: fitted`, `status: estimated`, citation, trainingWindow, validation, method), with `scenario` set to "exploratory descriptive market prior - not a per-site success prediction", one card per market x property-type segment (at least 30 spells) and horizon. They carry bootstrap intervals and are segment averages over past tenancies. Crime and other context are not used.

## Limitations
Small samples (89 failures); right-censoring is heavy for recent starts; failure label depends on CoStar research coverage; start-year is a covariate and the temporal split by start year does not stop later outcomes of train spells from being observed after the test start; the kit covers Houston and LA only; cross-market comparison of levels is not supported by this analysis.
