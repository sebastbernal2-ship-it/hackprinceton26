# Schools and education context

**Decision question:** Is school access relevant to this food-business operator's customer, employee, or household needs? It may be irrelevant for a cafe; do not assume school quality drives demand.

## Implemented adapter (verified 2026-11-14)

`data/factors/schools_education/adapter.py`: `fetch(site)` and `observations(site, raw)`; tests in `data/tests/factors/schools_education/` (synthetic fixtures, no network).

- **Source:** NCES Common Core of Data (CCD) school directory, via the Urban Institute Education Data Portal API (`https://educationdata.urban.org/api/v1/schools/ccd/directory/2024/?fips=<state>`). Keyless. One request per state (TX fips 48, CA fips 6), trimmed to six fields, cached under `data/derived/schools_education/cache/` (gitignored). Timeouts 60 s, 3 attempts with backoff.
- **Method:** haversine radius of 1 mile from the site coordinates; schools with CCD status open/new/added/changed-boundary/reopened (1,3,4,5,7) counted; closed/inactive/future excluded.
- **Observations (status `derived`):** count of open public schools within 1 mile; miles to nearest open public school (emitted only if at least one). `unknown` if site coordinates are missing or state is not TX/CA. Zero schools nearby is reported as `0`, a real derived result of the directory, not unknown.
- **Live run, 65 local candidate sites (41 Houston, 24 LA):** directory rows fetched TX 9,774, CA 10,405 (all with coordinates in 2024). All 65 sites got a derived count. 57 of 65 have at least one school within 1 mile; 8 have none. Count per site: min 0, median 5, max 22. Nearest school (57 sites): median 0.37 mi, max 0.98 mi. Full `data/tests` suite: 26 passed.
- **Terms:** Urban Institute portal states all data is licensed under ODC-By v1.0; cite both the portal and the dataset (CCD). Underlying CCD is federal NCES data. Attribution is carried in each observation's `source`.

## Limitations
- Public schools only (CCD); private schools are absent, so counts are not "all schools".
- Directory geocodes may be approximate; a 1-mile straight-line radius is not walking distance or attendance zone. District/attendance boundaries are not used.
- Latest year is 2024 (school year 2024-25); the portal may revise it.
- Locations only: no quality, performance, demographic or demand measures, and nothing here supports "good schools", safety, or customer demand claims. Do not use as a proxy for protected-class composition. Include in comparison only if the user says it matters.
