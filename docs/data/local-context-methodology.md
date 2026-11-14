# Local commercial and incident context (exploratory)

`data/build_local_context.py` creates 1-mile commercial peer aggregates around 65 GeneralRetail candidates from CoStar commercial properties and a Houston-only 0.5-mile aggregate of Houston Police Department NIBRS public-view records for Houston candidates.

## Source and coverage

- Police source: <https://www.houstontx.gov/police/cs/xls/NIBRSPublicView2026.csv>, retrieved locally on 2026-11-14. Data in this snapshot spans 2026-01-01 through 2026-06-30; it is partial-year.
- Downloaded size: 14,450,078 bytes; SHA-256 `c4487f193b00cc195c4498378230e00424931b52b419ac1bdc138ee4901dcdf7`.
- Dataset columns include occurrence date, NIBRS class/description, offense count, beat/premise, and mapped coordinates. Raw incident-level data remains ignored/local. Derived output contains only aggregated counts and property-level identifiers.
- This is only wired for Houston; Los Angeles is blank/unavailable, not zero.

## Method

- Nearby commercial inventory: count other CoStar commercial-property records with coordinates within 1 mile using Haversine distance. Retail and hospitality use CoStar `propertyType` enum values. Historic food-services presence is based on direct tenant-location/property occupancy IDs joined to company-detail industry enum; no tenant names are emitted.
- Police: filter source rows to City=Houston; weight each record by `Offense Count` (invalid/missing values default to 1, matching the upstream branch's rough handling); parse mapped lat/lon and count events within 0.5 mile. Violent/property groupings use the NIBRS-code sets from Afnan's `origin/frontend_dev:data_scripts/house_report.py`.
- Period is only the source file's observed date range, not a full year. A point-radius count is not a population- or exposure-adjusted crime rate. Geocoding/reporting coverage and classification limitations apply. Do not call it a neighborhood safety score, forecast, causal effect, or risk probability.
- The per-city reference comparison from Afnan's residential script is deliberately not reused: its Houston land-area denominator and residential use case are not validated for commercial-site comparisons.

## Use in the scorecard

The current evidence/diligence scorecard carries peer counts and Houston incident counts as contextual columns, **not score components**. Do not include criminal incident counts in a restaurant suitability or safety score. Use only for transparent user-requested context with source/date/radius/caveats and equal treatment across geographies; no cross-city crime comparison is supported.

## Rebuild

With the full ignored CoStar kit and `data/raw/houston-police/NIBRSPublicView2026.csv` available, run `python3 data/build_local_context.py`, then `python3 data/build_diligence_scores.py`. Outputs stay under ignored `data/normalized/`.
