# Slice S2: time-series projection cards

Code: `forecasting/series/`. Output: `ProjectionCard`-compatible JSON (`contracts/projection-card.schema.json`; the
pydantic model in `services/api/app/models.py` is authoritative and every card is validated against it).

## Method
- Models (numpy only): seasonal-naive (baseline; last value for annual series), seasonal mean, log-linear (or
  linear) trend with seasonal dummies, additive Holt-Winters ETS.
- Prediction interval: point +/- the empirical 80% quantile of absolute h-step errors the same model made on earlier
  data inside the training window. It never uses the test point.
- Rolling-origin backtest (expanding window, horizon h, step 3 months or 1 year) compares every model on the same
  origins. The best non-baseline model is chosen by out-of-sample MAE.
- Gate: a `fitted` `estimated` card is emitted only if best MAE < seasonal-naive MAE, the 80% interval coverage is
  within 0.15 of 0.80, and there are >= 8 origins. Otherwise the card is `unknown` (no numbers), `fitted` with the failing
  metrics, so the contract marks it `hidden` with `hiddenReason` set to the specific reason. Unknown is not zero.
- Cards are statistical extrapolation of history ("status quo"), not scenario analysis; they assume no structural break.

## Series
| Series | Source | Notes |
|---|---|---|
| LA crime monthly counts | LA Open Data Socrata 63jg-8b9z + 2nrs-mtv8, aggregated by `date_occ` | Context only, never scored or compared across cities. Final month dropped if <70% of recent median (reporting lag). 2024 has a records-system transition. |
| Houston NIBRS monthly | local `data/raw/houston-police` | Skipped unless >= 24 months. The local file covers 2026-01..2026-06 (6 months). |
| BLS metro average hourly earnings | BLS public API v1 (POST), series SMU06310800500000003, SMU48264200500000003 | v1 allows ~25 requests/day; fetch caches per series. |
| Monthly mean temperature | Open-Meteo archive (ERA5), 1991-2025, LA and Houston points | Reanalysis grid cell, not station data. |
| TxDOT AADT | TxDOT AADT Annuals layer, Harris County, trailing contiguous run per station, >= 5 yrs | Per-station; gaps are missing, not zero. |

## Published (cite-only)
`config/published_sources.json`, written by `python -m forecasting.series.run published`: CA DOF, Texas Demographic
Center, Cal-Adapt, NOAA sea-level scenarios, BLS employment projections. Each records URL, horizon, retrieval date,
HTTP status, sha256 and whether the stated horizon was found in the fetched page. Cards from them are `published`,
`unknown` (values not ingested) and carry a citation.

## Run
```
uv run --no-project --with numpy --with pydantic python -m forecasting.series.run fetch
uv run --no-project --with numpy --with pydantic python -m forecasting.series.run run   # data/derived/series/cards.json
uv run --no-project --with pytest --with numpy --with pydantic pytest forecasting
```
Raw and derived outputs are git-ignored.
