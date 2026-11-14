# Financials (repair, maintenance, utilities, equipment)

Code: `planning/financials.py`, `planning/price_catalog.py` (`load_financial_catalog`), data in
`data/financial/catalog.json` (public prices only), endpoint `GET /api/property/{id}/costs`
(`services/api/app/costs_routes.py`). Label: scenario analysis, not a forecast or a quote.

## Status semantics
- observed: a public page was fetched on 2026-11-14 and the number seen (vendor search-listing price, EIA table, LADWP Schedule C, a published repair range).
- estimated: no sourced figure; reference point stated in the data file and banded by the same rule for every site
  (cost x0.4/1/2.5, equipment rating x0.6/1/1.6). Reference points are judgement, not sources.
- unknown: no figure (LA sewer, layout inefficiency, "other" defects, repair lines without a confirmed quantity, areas without fetched rates). Excluded from totals, never zero.

## Assumptions (stated, estimated)
12 h/day x 30 days; duty cycles (cooking .15/.3/.5, refrigeration .3/.5/.7); 1,037 BTU/cf. Annual lines count 1/12 in monthly totals.

## Endpoint
`lines[]` (CostLineItem; extra optional `unitLow/unitExpected/unitHigh`), `totals` `{oneTime, monthly}` or null,
`totalsStatus` (complete | partial | none computable), `excludedLineIds`, `statusCounts`, `notice`.
Repair lines need `?repairs=plumbing:2,flooring:300` (confirmed findings); otherwise they are unknown. Utility area is
derived from the listing city; only Houston TX and Los Angeles CA have rates.

## Known gaps
Houston water rate is from secondary summaries (official page 403, PDF unreadable). Angi/Fixr pages mostly blocked, so
most repair unit costs are estimated. Equipment prices are search-listing prices (regular price, not member price), no
freight/install; reach-in refrigerator carried over unverified. Grease trap priced is a small under-sink unit; real
interceptors required by a city may cost far more. Pizza oven is a countertop model. kW not shown for several items (estimated).
Hidden defects cannot be proven by imagery; an on-site inspector must verify every repair scope.

## Flip analysis
`financials.build_scenario(...)` yields a `planning.scenario.Scenario` whose equipment, install allowance and repair
lines use the catalog bands, so `sensitivity.analyse` reports quantity knobs and flips for estimated inputs.
