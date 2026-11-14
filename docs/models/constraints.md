# Hard-constraint filter (slice S4)

Code: `integration/constraint_filter/`. Run tests: `uv run --no-project --with pytest pytest integration/constraint_filter`.
Aggregate run on local data: `python3 -m integration.constraint_filter <repo_root> <normalized_dir>` (prints counts only).

## Semantics
Each constraint returns PASS, FAIL or UNKNOWN with a reason, the exact `missing_fields`, and the evidence facts
(value, status, source, record_id, as_of, geography, limitations). Site roll-up: any FAIL -> FAIL; else any UNKNOWN ->
UNKNOWN; else PASS. A missing or `unknown`-status fact is never pass and never fail. Constraints the profile leaves unset
(null) are not applied (not unknown); with none set the roll-up is vacuously PASS.

| constraint | profile field | site fact(s) |
|---|---|---|
| city | cities | city |
| area | min/max_area_sqft | listed_space_area_sqft |
| seats | min/max_seats | seat_capacity |
| budget | budget | build_out_cost_low/high (interval: FAIL only if low > budget, PASS only if high <= budget, else UNKNOWN) |
| active_listing | require_active_listing | listing_status (property_market card) |
| scan_model | require_scan_model | accessible_model_count (0 -> UNKNOWN: absence of a link is not a negative; suite identity unverified) |
| restaurant_use | require_restaurant_use | restaurant_use_permitted (needs an authority; no source today) |

Estimated-status facts are evaluated but flagged in the reason. Crime is never a constraint.

## replan(profile, change, sites)
Applies a field->value change to the profile and returns the sites whose roll-up status changed, with per-constraint
before/after, reason and missing fields, plus before/after counts. Scenario analysis over stated constraints, not a forecast.

## Limitations
- `listed_space_area_sqft` comes from `candidate-comparison.csv` (listed available area); suite identity/freshness unverified.
- No source yet for seats, build-out cost, or restaurant-use permission, so those constraints are UNKNOWN for every site until
  those workstreams supply facts. Hence no site can currently reach PASS overall.
- Loader reads local gitignored CSVs read-only; nothing from them is committed.
