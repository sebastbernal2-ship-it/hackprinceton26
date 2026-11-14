# Series forecasts: CoStar kit quarterly series

`python -m data.costar.series_fetch` then `python -m forecasting.series.run run`. Report (aggregates only) goes to
`forecasting/artifacts/costar_series_report.json`; cards to `data/derived/series/cards.json` (both gitignored).

Series are KIT-SAMPLE series (the kit's sampled properties), not CoStar market statistics. Quarters with n < 3 or
absent are missing, never zero; each series is modelled on its trailing contiguous valid run. Future-dated tenancies
(after 2026Q3) are excluded; an incomplete final quarter of a count series is dropped.

Models: seasonal naive (m=4, baseline), ETS (additive Holt-Winters), log-linear trend + quarter dummies, seasonal mean.
Rolling-origin backtest (min train 24 quarters, step 1). Gate: best model must beat BOTH seasonal-naive and plain naive
on MAE by a margin (ratio < 0.95) and 80% interval coverage within 0.80 +/- 0.15. Horizons 1 and 4 quarters; 8 and 12
only if the run has >= 40 quarters. Selection among 3 models on the backtest is not corrected, and the gate passes
about 1/3 of simulated random walks (see tests); treat estimated cards as scenarios, not forecasts.
