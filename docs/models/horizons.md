# Horizon table

`GET /api/horizons/{listingId}` returns, per property, a table of 11 metrics (rows) by 6 horizon buckets (`now`, `12m`, `3_5y`, `2030`, `2050`, `2070`).
Builder: `forecasting/horizons/build.py`. Contract: `contracts/horizon-table.schema.json`. Nothing is estimated in this slice.

Each cell has a `state`:
- `observed`: a snapshot value (factor card, FEMA zone/elevation). Only in the `now` column.
- `fitted`: a ProjectionCard (`kind: fitted`) re-validated with the pydantic contract, not hidden, every validation metric passed (the gate on a held-out split lives in the producing slice; failed gates emit no cards and the cell says so). Labelled scenario/estimate.
- `published`: a cite-only source or a published scenario (NOAA SLR, Cal-Adapt LOCA), with citation and retrieval date.
- `cannot_say`: with a reason. Unknown is never zero.
- `pending`: the upstream artifact has not been produced yet (series, survival, rent, hazard).

Rules enforced (tested with synthetic cards in `services/api/tests/test_horizons.py`): a fitted card fills a cell only if its citation geography names exactly the listing's city (no mixed or cross-city cards); more than one matching card with no site-to-series link (e.g. TxDOT stations) is refused rather than picked; population sources must name the listing's state and cover the bucket's years; Houston sea-level is `cannot_say` (inland; Galveston gauge is not site-level); heat-day counts have no sourced projection.

Inputs (override with env): `data/derived/series/cards.json`, `forecasting/artifacts/{survival,rent,hazard}/cards.json` (+ `metrics.json` gate), `config/published_sources.json`, `data/derived/structure/{properties,climate_fetch}.json`, `data/normalized/costar/factor-cards.csv`. Rent and hazard cards are matched by metric text and horizon text; the format is a ProjectionCard list, as for series and survival.

## What we can and cannot forecast (65 candidates x 66 cells = 4,290)

Counts from `python -m forecasting.horizons.build` run on 2026-11-14 against the local snapshots. The series, survival, rent and hazard artifacts did not exist yet, so fitted = 0 and their cells are `pending`:

| state | cells |
|---|---|
| observed | 72 (65 FEMA/elevation, 7 crime context) |
| published | 428 (population cite-only 284; LA sea-level scenarios 72; LA warming scenarios 72) |
| fitted | 0 (artifacts pending) |
| pending | 975 |
| cannot_say | 2,815 |

Reading: today we can only cite published scenarios for long horizons (and only for LA climate), and population sources. Heat days, Houston sea level and everything beyond 12 months from a fitted model are `cannot_say`. Rerun after the series/survival/rent/hazard slices land to move `pending` cells to `fitted` or `cannot_say`.
