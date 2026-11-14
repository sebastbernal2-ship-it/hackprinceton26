# Planning engine (slice S3)

Label on every output: **scenario analysis, not a forecast**. Pure Python, no I/O, no LLM arithmetic. Code in `planning/`.

## Modules
- `price_catalog`: items with unit, low/high price, source URL, as-of date. Prices appear only where a public source
  was read. Currently priced: one reach-in refrigerator list price (single listing, low == high, so not a market range)
  and the Webster TX commercial permit + plan review schedule (one city; effective date not stated on the page).
  Every other item is present with `None` prices (unknown). Add prices only with a URL and date.
- `timeline_model`: PERT (low, mode, high) in months, tasks in series. Each task is `cited` (needs source) or
  `assumption`. No task durations are shipped; callers supply them.
- `cost_model`: quantities x catalog low/high, optional permit schedule, contingency (a stated assumption). Reports
  build-out, occupancy (dead rent) and delay cost as separate components, then a total. Any unknown input makes the
  dependent component `None`; `known_lines_subtotal_partial` is labelled partial and is not a total. Omitting the permit
  schedule means permit fees are excluded (flagged by `permit_included=False`), not zero.
- `monte_carlo`: seeded, default 10,000 draws. Line prices triangular (mode at midpoint, an assumption), contingency
  uniform, durations PERT-beta. Outputs p5/p50/p95 for build-out, time-to-open, dead rent, delay cost, total, and
  P(over budget). Intervals are spreads of the stated input ranges, not confidence intervals. Unknowns yield `None`
  or `partial`/`unknown` status.
- `sensitivity`: one-at-a-time +/-20% on named knobs, and flip analysis (bisection on a multiplicative factor,
  common random numbers) finding which single assumption change moves P(over budget) across a threshold (default 0.5).

## Not claimed
Over budget means simulated pre-opening spend (build-out + dead rent + delay) exceeds the budget input. No operating
revenue, break-even, or market forecast. Catalog prices are not representative of any site.

## Tests
`uv run --no-project --with pytest pytest -c planning/pytest.ini planning`
