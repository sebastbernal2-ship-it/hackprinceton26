# Income, demographics, and trade area

**Decision question:** What is the documented size and composition of a potential trade area, and what demand indicators are relevant to the operator's concept?

**Candidate sources:** US Census ACS 5-year API and TIGER/Line geographies (<https://www.census.gov/data/developers/data-sets/acs-5year.html>); Census LEHD/LODES workplace-residence flows; Census Business Builder as discovery only. Candidate coordinates already exist in CoStar.

**Preliminary:** No census tables or demographic estimates fetched/joined. No trade-area boundaries selected. ACS is sample-based and geographic aggregates are uncertain.

**Prep:** choose drive/walk/transit trade areas with operator input; identify ACS income/household/population/employment variables and margins of error; choose census block group/tract methods; calculate coverage and suppression/missingness. Compare alternatives (rings vs network isochrones) and avoid ecological inference.

**Do not claim:** individual income, willingness to pay, likely customers, or sales forecasts from area averages. Avoid protected-class targeting and proxy discrimination; demographic context should not automatically enter a suitability score.

## Verified adapter (run 2026-11-14)

Adapter: `data/factors/income_demographics/adapter.py`; tests: `data/tests/factors/income_demographics/` (synthetic ACS rows plus a hand-trimmed geocoder response).

- **Method:** `fetch(site)` geocodes lat/lon to a census tract with the keyless Census Geocoder (`geocoding.geo.census.gov`, vintage `ACS2023_Current`, 20 s timeout, 3 retries, results cached under `data/derived/income_demographics/cache`, gitignored), then joins the locally downloaded ACS 5-year 2023 tract tables (`data/derived/income_demographics/acs/`). `api.census.gov` is not called. `observations()` emits three factor cards per site (median household income B19013, total population B01003, median age B01002) with 90% margins of error in the value text.
- **Status semantics:** ACS values are `estimated` (sample-based). Census sentinels (-666666666, -333333333, -222222222, -555555555, -888888888, -999999999) become `unknown` with an empty value; a missing margin of error is noted, not invented. Income of 250001 is flagged as top-coded. Geocoder failure or a tract absent from the local table yields `unknown`.
- **Coverage over the 65 local CoStar candidate sites (41 Houston, 24 Los Angeles):** all 65 geocoded to a tract (60 distinct tracts, 0 geocoder errors); all 195 cards (65 x 3) were `estimated`, 0 `unknown`. Sentinel handling is covered only by synthetic tests, not by observed data in these sites.
- **Source terms/licence:** Census data are US Government works; terms and any attribution requirement for the Geocoder/Data API were NOT fetched or verified in this run. Confirm before publication.
- **Limitations:** tract averages describe the area, not the site, its customers, or individuals (no ecological inference); ACS margins of error can be large in small tracts; the geocoder tract uses the Current/ACS2023 vintage and could differ from the table's tract boundaries in rare cases (such a mismatch surfaces as `unknown`); no trade area or ring/isochrone was chosen; demographics must not enter a suitability score automatically.
