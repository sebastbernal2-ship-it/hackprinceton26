# Hedonic asking rent (estimate)

`forecasting/rent/` fits log asking rent per sq ft per year on CoStar-kit for-lease listings, per metro (Houston, Los Angeles), with
`ridge + submarket fixed effects`. Features: log available sf, log GBA, year built, stories, parking ratio, building rating,
listing-date trend, lat/lon, property type, class, lease service type, submarket. Unknown numerics get a missing flag (never 0).
Rent: `rateBasis` 1 monthly x12, 2 yearly; rate 0 or unknown basis = unknown (dropped); spaces collapsed to the listing median.
The local presence index was not used (not needed to beat the baselines, and not yet validated as a rent driver).

Run: `PYTHONPATH=. python -m forecasting.rent.run` (writes gitignored `forecasting/artifacts/rent/{report,predictions}.json`).
API: `GET /api/rent/{listingId}` (ProjectionCard + asking-vs-expected flag + top feature contributions), `GET /api/rent/summary`.

## Pre-declared gate (per metro segment; held-out rows only)
G1 n >= 30 (and >= 10 temporal test rows); G2 MAE(log) <= 0.95 x best baseline (submarket median, metro median) on spatial block
CV (5 folds over 0.05-degree lat/lon cells) AND on the temporal holdout (latest 25% by dateOnMarket); G4 80% split-conformal interval
coverage in [0.70, 0.90] on both splits. Gradient boosting is only adopted if it passes the gate and beats ridge by 3% spatial MAE.
A failing segment emits nothing: the API returns an `unknown` card. Expectations for rated listings are spatial out-of-fold, so the
flag is never in-sample. Everything is labelled scenario/estimate of ASKING rent, not contract rent or an appraisal.

## Results (kit snapshot 2026-11-14; see report.json for numbers)
Houston and Los Angeles all-type fits both FAIL the gate (Houston: temporal holdout lost to the submarket median; LA: temporal
interval over-covered, 0.95, outside the declared band). Retail/mixed segments (16 and 11 rated listings) are too thin. No rent
estimates are emitted. Rated listings are few (334 of 1,022 kit listings), so this is a data limit, not a tuning problem.
