# Factor implementation status

Status is based on local repository artifacts inspected 2026-11-14. A listed source or script is not evidence of validated coverage. No source was fetched during this increment.

| Stream | Implemented locally | Reproducible evidence | External/confirmation blocker | Next measurable deliverable |
|---|---|---|---|---|
| Property-market | CoStar-derived candidate and listing joins; pilot validation record | Local normalized outputs; listing grain, dates, rates and tenant joins need row-level audit | CoStar terms and broker currentness; no claim of available space | Profile all listing/suite rows with IDs, dates, rate basis and join disposition |
| Schools-education | Source suggestions only | No verified site sample | Operator relevance and official boundary/school extracts | Document exact dated official extracts and spatial join for approved candidates |
| Traffic-access | CoStar frontage and local aggregates exist | Frontage is not traffic; no transport-feed sample | Official counts/transit data and candidate/geographic coverage | Sample dated station/service observations with units and distance method |
| Crime-safety | Houston-only partial 2026 incident aggregate; context only | Existing local-context pipeline; no LA comparison | Compatible LA source/geography/period unavailable | Preserve Houston coverage and explicitly show LA unknown; validate aggregation provenance |
| Income-demographics | Source suggestions only | No joined sample | Census API key/access and operator-approved trade area | Approved ACS vintage and geography joins with suppression/missingness report |
| Signage-visibility | Partial frontage context | No dated visibility observation | Vexcel 403; authorized imagery and permits needed | Human-reviewed dated observation after sponsor approval |
| Climate-weather | NOAA source suggestions; no site series | No verified local series | NOAA token/query and station selection | Compatible station sample with period, distance, units and missingness |
| Natural-hazards | FEMA source identified | No parcel overlay; NRI portal reported 403 | Parcel geometry and accessible authoritative layer | Dated jurisdiction/parcel overlay with resolution and unknowns |
| Mobility-tourism | Source suggestions only | No site-specific feed | Tourism/ridership data licensing and site-scale validity | Define source coverage and one dated comparable sample per city |
| Spatial-interior | Matterport inventory and pilot metadata | Pilot model-derived dimensions; not ground truth | Suite-to-scan identity unresolved; listing and scan area fields materially disagree | Obtain plan/survey and authorized suite identity, then document dimensional comparison |
| Aerial-site | Vexcel documented 403 | No imagery observations | Sponsor approval/access; do not probe alternate endpoints | Record approved imagery coverage/date and human-reviewed labels |
| Infrastructure-permits | Pilot zoning/equipment planning artifacts | No authoritative parcel permit verification | Exact parcel/jurisdiction and local authority confirmation | Dated permit/zoning lookup checklist for pilot and second candidate |
| Costs-timeline | Concept planning artifacts | No itemized costs or labels | Operator scope, bids, market inputs | Intake quantities and obtain dated quote ranges by work package |
| Labor-supply | Source suggestions only | No site-level evidence | Role/menu assumptions and official wage/workforce extracts | Dated role wage/commute context with metro-vs-site limitation |
| Operator-preferences | Italian restaurant + gelato concept known | No complete operator intake | Owner answers and consent | Capture constraints/preferences with unknown allowed; versioned response record |

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
