# API contract

HTTP JSON under `/api`, served by `services/api` (FastAPI, port 8000). JSON Schemas for
`FactorCard` and `Match` are generated from the pydantic models:
`cd services/api && python export_schemas.py` (a test fails if they are stale).

## Endpoints
- `POST /api/matches {brief:[{question,answer}]}` -> `{dataAvailable, matches: Match[]}`. Empty list and
  `dataAvailable:false` when the local CoStar CSVs are absent. No fit ranking: the brief only narrows by an
  explicitly named city; order is by listingId; at most 3.
- `GET /api/property/{listingId}` -> `Match` (404 if unknown or data absent)
- `POST /api/next-question {history}` -> `{question|null, stub:true}`
- `POST /api/tour-agent {message,placedCount,tourId}` -> `{reply, action, stub:true}`
- `GET /api/health`

## Data source
`COSTAR_NORMALIZED_DIR` (default `data/normalized/costar`) must hold `restaurant-site-candidates.csv` and
`factor-cards.csv`; read-only, local, git-ignored. Fields the source lacks stay empty: `photo`/`tourId` are `""`,
`rentPerSquareFootYear` is `null` (missing is not zero), `blurb` is the candidate basis.

## evidenceReadiness
`round(100 * observed / total)` over the property's factor cards. Only `status == "observed"` counts; derived,
estimated and unknown add nothing; no cards gives 0. It measures how much evidence is verified, not fit or
quality. It replaces the old `confidence` field.
