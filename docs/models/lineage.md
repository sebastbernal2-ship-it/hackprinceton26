# Restaurant lineage and day/night presence (triage)

Status: observed tenancy history plus an exploratory market prior. Screening context, not an assessment, not a forecast, not a score input.

## Lineage
Source: CoStar kit `location-occupancy` joined to `company-detail` where `profile.industryType` = 17 (AccommodationAndFoodServices), per building (all kit buildings with food history, not only candidates). Occupancies of one company location in one building are merged into one tenant. Ending: open (no `toDate`, or `toDate` after 2026-11-09), clear failure (`expirationReason` 4 = ClosedLocationOrBankrupt, CoStar's research label), or other exit (everything else; MovingOutNewAddressUnknown is not failure). Successor = another food tenant in the same building starting within 365 days after the end (30 days overlap allowed); in multi-tenant buildings this can be a neighbouring space. Churn flag = at least 3 food tenants and median completed tenure < 2 years (screening rule, unvalidated). Median tenure uses completed tenancies only (biased short). Tenants are "Tenant 1, 2..." unless `names=true`.

Survival context: descriptive Kaplan-Meier (Greenwood CI) of time to tenancy end and Aalen-Johansen clear-failure incidence with a cluster bootstrap, over spells starting 2012+. Labelled "exploratory market prior, not a per-site prediction". The S1 Cox model failed its gate (docs/models/survival.md), so it is not reused. Horizons with fewer than 10 spells still at risk are null (not evaluable), never 0.

## Presence
Two points within 0.25 and 0.5 miles of a candidate: DAY = sum of `numEmployees` over distinct current tenant locations in kit buildings (fill rate reported, by industry); NIGHT = apartment units x residents per unit (assumed 1.5/2.0/2.5) + hotel rooms x occupancy (kit value, else assumed 0.5/0.65/0.8) x 1.5 guests. Shape from day share (>=0.65 day-heavy, <=0.35 night-heavy, else mixed; "unknown" if either side is unobserved). Kit buildings are only the Matterport property list, so every count is a lower bound. Not foot traffic and not a 24-hour clock.

## API and reproduction
`GET /api/lineage/{listingId}[?names=true]`, `GET /api/lineage/summary`, `GET /api/presence/{listingId}`; they read gitignored artifacts in `LINEAGE_DIR` (default `data/derived/lineage`), 503 if not built.
```
uv run --no-project python -m triage.lineage.build --kit data/raw/costar/full-kit --candidates data/normalized/costar/restaurant-site-candidates.csv --out data/derived/lineage
```
