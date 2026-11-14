# Natural hazards and resilience

**Decision question:** What mapped hazard exposure or historical disruptions should be checked before lease, insurance, and build-out decisions?

**Candidate sources:** FEMA National Flood Hazard Layer/NFHL and National Risk Index (<https://www.fema.gov/flood-maps>; <https://hazards.fema.gov/nri/>); NOAA Storm Events/Climate Data; USGS earthquake hazards; state/local floodplain and wildfire layers. These differ in resolution and purpose.

**Preliminary:** No parcel-level hazard overlay. Houston/LA candidate coordinates exist; parcel geometry/authoritative boundaries not assembled.

**Prep:** collect official layers and effective dates; intersect geocoded candidate point and, where licensed/available, parcel footprint; report zone/category and source resolution, not a binary safe/unsafe. Add flood history/drainage as separate evidence; review insurance/permit implications with qualified parties.

**Do not claim:** a property is safe from flood/storm/fire because a point misses a mapped zone. Map scale, pluvial flooding, changing climate and infrastructure matter. Distinguish hazard, exposure, vulnerability, and risk.

## Implemented: FEMA NFHL flood-zone adapter (verified 2026-11-14)

`data/factors/natural_hazards/adapter.py`: `fetch(site)` queries the public ArcGIS REST endpoint
`https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query` (point, EPSG:4326; 20 s timeout, 3 tries with backoff; JSON cache in gitignored `data/derived/natural_hazards/cache`). `observations(site, raw)` returns factor-card dicts per `contracts/factor-card.schema.json`.

**Verified by running:** unauthenticated GET returned HTTP 200 (no 403). Live run over the 65 local CoStar candidates (41 Houston, 24 LA): 65/65 fetched, 0 failures, 65 `observed`, 0 `unknown`.
- Houston (41): zone X minimal hazard 35; AE (special flood hazard area) 5; AO (SFHA) 1.
- Los Angeles (24): zone X 24.
- Tests: `data/tests/factors/natural_hazards/` (6, synthetic fixtures, offline).

**Semantics:** observed = mapped regulatory zone at the geocoded point. No polygon returned => `unknown` with empty value (never "no hazard"). Zone X is "minimal flood hazard on the map", not "safe".

**Source terms:** the layer metadata returned no copyright or licence text, and the terms page was not fetched; FEMA NFHL is public federal data, but use terms are unverified here. Check FEMA's data-use statement before publishing.

**Limitations:** point only, no parcel footprint; the layer exposes no panel effective date, so `asOf` is retrieval date and map currency is unknown; no pluvial/drainage, flood history, wildfire or seismic evidence (separate sources, not built); LA wildfire/earthquake hazards are not covered by this adapter; not a safety, insurance or suitability finding; no cross-city comparison.
