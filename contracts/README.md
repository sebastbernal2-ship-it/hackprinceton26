# API contract

HTTP JSON under `/api`, served by `services/api` (FastAPI, port 8000). JSON Schemas for
`FactorCard`, `Match`, `ProjectionCard`, `AssumptionInput`, `ScenarioAssessment`, `MatchesResponse`, assess request and replan are generated from the pydantic models:
`cd services/api && python export_schemas.py` (a test fails if they are stale).

## Endpoints
- `POST /api/matches {brief:[{question,answer}]}` -> `{dataAvailable, matches: ShortlistMatch[], profile, counts,
  excludedCount, notShownCount, note}`. The brief is parsed deterministically (keywords/numbers, no LLM:
  `integration/intake.py`) into a profile (cities, budget, sqft range, seat range, must-haves: active listing,
  scan, restaurant use). Each site is tested with `integration/constraint_filter`. Order: PASS first, then UNKNOWN
  by `evidenceReadiness` desc, then listingId; at most 3 shown. FAIL sites are excluded and counted in
  `excludedCount`. Each match carries `constraintStatus`, `constraints[]` (status, reason, missingFields, evidence) and
  `missingFields`. No fit score. Seat capacity and use permission have no data source, so those constraints are UNKNOWN.
  A single sqft or seat number is read as a minimum. `dataAvailable:false` with an empty list when CSVs are absent.
- `GET /api/property/{listingId}` -> `Match` (404 if unknown or data absent)
- `POST /api/next-question {history}` -> `{question|null, stub:true}`
- `POST /api/tour-agent {message,placedCount,tourId}` -> `{reply, action, stub:true}`
- `GET /api/property/{listingId}/projections` -> `{listingId, modelsAvailable, projections: ProjectionCard[], note}`
  (404 if unknown). Stub: empty list, never zero-filled.
- `POST /api/assess {listingId?, budget?, equipment?: [id | {id,quantity}], unitPriceOverrides?: {id: number | {low,high}},
  repairs?: {category: qty}, leaseStartDelayMonths?, monthlyRent?, rentFreeMonths?, delayCostPerMonth?, plannedOpenMonths?,
  draws?, seed?, assumptions?: AssumptionInput[], brief?}` -> `ScenarioAssessment`, always labelled
  `scenario analysis, not a forecast`. Uses the GET costs lines (`planning/financials.py`), seeded Monte Carlo and
  sensitivity/flip analysis. `pOverBudgetBuildout` compares build-out cost (equipment + install + confirmed repairs) to
  budget; `pOverBudget` (dead rent + delay cost included) is null unless rent, delay cost and planned-open months are
  given. Default task durations are an uncited labelled assumption (`assumptionsUsed`). Missing inputs stay null and are
  listed in `unknownInputs`; never zero. Intervals are p5-p95 spreads of stated ranges, not confidence intervals.
  `sensitivity.flips` give the smallest multiplicative change per assumption that moves P(over budget) across 0.5.
  404 unknown listing, 422 unknown equipment/repair/override id.
- `POST /api/replan {brief?|profile?, assess?, profileChange, listingId?}` -> `{changed[{site_id,from,to,because[]}],
  countsBefore, countsAfter, pOverBudget{buildoutOnly,full:{before,after,delta}}, budgetBefore/After}`. `profileChange`
  keys: cities, minAreaSqft, maxAreaSqft, minSeats, maxSeats, budget, requireActiveListing, requireScanModel,
  requireRestaurantUse, plus assess keys (e.g. leaseStartDelayMonths). Delta is null when either side is unknown.
- `GET /api/health` -> `{status, dataAvailable, modelsAvailable}`; `modelsAvailable` reads env `MODELS_AVAILABLE`
  (1/true), default false.

## ProjectionCard
Model output, never observed: `status` is `estimated` (point, lower, upper all set, `lower <= point <= upper`) or
`unknown` (no numbers). `kind`: `published` requires `citation` (source, recordId, asOf, geography, limitations);
`fitted` requires `trainingWindow` and `validation` metrics, and if any metric has `passed:false` the card is set
`hidden:true` (`hiddenReason`) and clients must not display it; `scenario` is analysis, not a forecast. Every card
needs a `method` statement. The pydantic validators enforce the ordering and kind rules; the JSON Schemas cannot
express them, so the Python models are authoritative.

## Data source
`COSTAR_NORMALIZED_DIR` (default `data/normalized/costar`) must hold `restaurant-site-candidates.csv` and
`factor-cards.csv`; read-only, local, git-ignored. Fields the source lacks stay empty: `photo`/`tourId` are `""`,
`rentPerSquareFootYear` is `null` (missing is not zero), `blurb` is the candidate basis.

## evidenceReadiness
`round(100 * observed / total)` over the property's factor cards. Only `status == "observed"` counts; derived,
estimated and unknown add nothing; no cards gives 0. It measures how much evidence is verified, not fit or
quality. It replaces the old `confidence` field.
