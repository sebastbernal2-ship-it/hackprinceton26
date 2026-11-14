# Factor implementation status

Status as of 2026-11-14, branch `phase3/merged`. Coverage figures below are from each adapter's own live run over the 65 local candidate sites (41 Houston, 24 Los Angeles), as reported by the adapter builders; the verifier re-ran every unit test suite but did NOT re-run the live fetches (they need network and the gitignored site CSV). Adapter output reaches `factor-cards.csv` only after `data/run_factor_adapters.py` (or `crime_safety_la/adapter.py`) writes `data/derived/<adapter>/observations.json`; absent that file the card stays unknown. Terms/licences are unverified unless a stream says otherwise.

| Stream | Implemented locally | Reproducible evidence | External/confirmation blocker | Next measurable deliverable |
|---|---|---|---|---|
| Property-market | CoStar-derived candidate and listing joins; pilot validation record | Local normalized outputs; listing grain, dates, rates and tenant joins need row-level audit | CoStar terms and broker currentness; no claim of available space | Profile all listing/suite rows with IDs, dates, rate basis and join disposition |
| Schools-education | Adapter: NCES CCD directory 2024 via Urban Institute API (open public schools within 1 mile, nearest distance) | Live run: 65/65 sites derived; 57 have >=1 school within 1 mi, 8 have 0 (reported as 0, a real count); 5 unit tests | ODC-By attribution carried in `source`; public schools only, straight-line radius, not attendance zone; no quality/safety claims | Add private schools and attendance zones only if the operator needs them |
| Traffic-access | Adapter: TxDOT AADT (Houston) and Caltrans AADT (LA state highways), nearest station within 3 km | Live run: 65/65 observed (41 TX, 24 CA); 21 of 65 sites >1 km from the station; TX history median 8 years; CA single year; 6 unit tests | TxDOT terms bar redistribution/commercial use (fetched counts must stay local); neither source gives an open licence; LA city streets not covered; nearest-station is not routed or directional | Confirm TxDOT consent for any published use; add LADOT/city counts |
| Crime-safety | Houston: 0.5 mi partial-year 2026 aggregate (31 sites with counts from the earlier pipeline). LA: adapter on LAPD NIBRS 2026-01-01..06-30, 0.5 mi | LA live run: 24/24 LA sites have counts (min 5, median ~822, max 3,696); Houston sites get an unknown from the LA adapter; context only, never a rate or cross-city comparison; adapter tests pass | `k7nn-b2ep` licence field null (unverified); NIBRS entry lag and 100-block rounding blur edges | Reconcile definitions before any side-by-side display (currently unsupported) |
| Income-demographics | Adapter: Census geocoder to tract, joined to local ACS tract tables (median household income, population, median age) | Live run: 65/65 geocoded to 60 tracts; 195/195 cards estimated with margin of error, 0 unknown; 6 unit tests | Census terms unverified; requires local ACS tables under `data/derived/income_demographics/acs`; tract is not an operator-approved trade area | Approve ACS vintage and trade-area definition |
| Signage-visibility | Adapter: recorded CoStar frontage (observed) plus LA sign-area ceiling and projecting-sign eligibility derived from cited rules | Live run: 42/65 sites have usable frontage (Houston 27, LA 15); 15 LA sites derived, 9 LA unknown; Houston 0 derived by design; overlay and sightline unknown for all 65; 11 unit tests | LAMC text read from a third-party mirror (official host 403), edition unknown; Houston table column order inferred; frontage is not visibility; Vexcel still blocked | Re-read LAMC on the official host; imagery after sponsor approval |
| Climate-weather | Adapter: Open-Meteo archive (ERA5/ERA5-Land, 2023-2025): annual mean temp/precip, hot and freeze days, monthly means/precip, grid-cell distance | Live run: 65/65 fetched, 7 metrics non-unknown for every site (455 cards); 24 distinct grid cells; site to cell-centre distance 0.7-6.2 km; 4 unit tests | CC BY 4.0 non-commercial free tier (429 rate limits; needs pacing); reanalysis grid not station data; 3-year window is not a normal; no intervals | Legal check of terms before production; NOAA normals not fetched |
| Natural-hazards | Adapter: FEMA NFHL flood zone at the site point (layer 28), SFHA flag, BFE only when real | Live run: 65/65 observed, 0 unknown. Houston 41: zone X 35, AE 5, AO 1; LA 24: zone X 24; 6 unit tests | Terms unverified; asOf is retrieval date (panel currency unknown); point query not parcel footprint; zone X means minimal mapped hazard, not safe; no pluvial, wildfire or seismic evidence | Add other hazards and parcel geometry |
| Mobility-tourism | Source suggestions only | No site-specific feed | Tourism/ridership data licensing and site-scale validity | Define source coverage and one dated comparable sample per city |
| Spatial-interior | Matterport inventory and pilot metadata | Pilot model-derived dimensions; not ground truth | Suite-to-scan identity unresolved; listing and scan area fields materially disagree | Obtain plan/survey and authorized suite identity, then document dimensional comparison |
| Aerial-site | Vexcel documented 403 | No imagery observations | Sponsor approval/access; do not probe alternate endpoints | Record approved imagery coverage/date and human-reviewed labels |
| Infrastructure-permits | Pilot zoning/equipment planning artifacts | No authoritative parcel permit verification | Exact parcel/jurisdiction and local authority confirmation | Dated permit/zoning lookup checklist for pilot and second candidate |
| Costs-timeline | Concept planning artifacts | No itemized costs or labels | Operator scope, bids, market inputs | Intake quantities and obtain dated quote ranges by work package |
| Labor-supply | Adapter: BLS API v1 OEWS wages/employment (4 occupations, 2025) and CES food-services employment trend (1990-2026) per metro | Live run: 65/65 mapped, 13 observations per site, 845/845 observed; metro-level only, identical within a metro; 6 unit tests | BLS terms pages returned 403 (licence unverified); v1 daily cap unverified; single OEWS year, so no wage trend; no intervals | Role set from operator menu; site-level commute evidence
| Operator-preferences | Italian restaurant + gelato concept known | No complete operator intake | Owner answers and consent | Capture constraints/preferences with unknown allowed; versioned response record |

## Model and planning workstreams (merged on this branch)

Verified here by running each suite: services/api 16 passed; modeling 14; forecasting 23 (series + survival); planning 31; integration/constraint_filter 11; data/tests 77 (includes every factor adapter). Builders' own accuracy claims (backtest, survival results) are documented in `docs/models/` and were not re-derived by the verifier.

| Workstream | What exists | Honest limits |
|---|---|---|
| Contract (model/slice0-contract) | Projection, assumption, scenario schemas; stub projections and assess endpoints | Stubs return no model output |
| Constraints | Three-valued constraint filter with replan | Operates on supplied facts; unknown is not a pass |
| Planning | Catalog, timeline, cost model, seeded Monte Carlo, sensitivity/flip | Scenario analysis, not a forecast |
| Series | Rolling-origin backtested series cards behind a gate; cite-only published sources | Cards are emitted only if the gate passes |
| Survival | Exploratory CoStar tenancy survival model | Documented gate FAILED on the test split, so no cards are emitted; not a per-site prediction |
| Frontend | Projection types and range-bar components, mock endpoints | `npm run build` and `npm run lint` pass; not exercised against live model output |

Not yet integrated: only `crime_safety_la` has its own writer; the other seven adapters need `python data/run_factor_adapters.py` run with network and local data, which the verifier did not do. Mobility-tourism, spatial-interior, aerial-site, infrastructure-permits, costs-timeline and operator-preferences have no adapter in this merge and remain unknown.

## Shared interpretation and blockers

- Existing CoStar `Active` is a source snapshot, not broker-confirmed availability. Listing absence is unknown, not vacant.
- The pilot tour selection is user-confirmed; suite-to-scan identity and dimensions remain unverified. Listing and scan area fields are distinct, materially discrepant evidence.
- Houston crime panel is partial-year 2026-01-01 through 2026-06-30 and 0.5-mile aggregate; LA is unavailable, not zero. It is not a rate or safety/risk score.
- Vexcel reported 403; no alternate endpoints/auth methods are authorized. Broader Matterport use requires rights confirmation.
- No aggregate neighborhood score, prediction, best-site recommendation, or cross-city crime comparison is supported.

## Next owners/actions

1. Operator: answer the intake fields in `operator-preferences/README.md`; unknown is an accepted answer.
2. Sponsor/broker: confirm CoStar use/retention, present availability, exact suite/model identity, and Matterport rights.
3. Local permitting experts: verify jurisdiction, restaurant use, permits and building systems for selected parcels.
4. Data lead: perform the record-level listing/tenant audit and retain source row IDs, dates, units/rate basis, joins and unknowns.
5. Authorized data owner: approve Vexcel access and imagery terms; absent approval, visibility remains unknown.
