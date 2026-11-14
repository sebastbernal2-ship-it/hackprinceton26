# API contract

HTTP JSON under `/api`, served by `services/api` (FastAPI, port 8000). JSON Schemas for
`FactorCard`, `Match`, `ProjectionCard`, `AssumptionInput` and `ScenarioAssessment` are generated from the pydantic models:
`cd services/api && python export_schemas.py` (a test fails if they are stale).

## Endpoints
- `POST /api/matches {brief:[{question,answer}]}` -> `{dataAvailable, matches: Match[]}`. Empty list and
  `dataAvailable:false` when the local CoStar CSVs are absent. No fit ranking: the brief only narrows by an
  explicitly named city; order is by listingId; at most 3.
- `GET /api/property/{listingId}` -> `Match` (404 if unknown or data absent)
- `POST /api/next-question {history}` -> `{question|null, stub:true}`
- `POST /api/tour-agent {message,placedCount,tourId}` -> `{reply, action, stub:true}`
- `GET /api/property/{listingId}/projections` -> `{listingId, modelsAvailable, projections: ProjectionCard[], note}`
  (404 if unknown). Stub: empty list, never zero-filled.
- `POST /api/assess {listingId?, assumptions: AssumptionInput[]}` -> `ScenarioAssessment`, always labelled
  `scenario analysis, not a forecast`; stub returns `status:"unknown"` with no projections.
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
