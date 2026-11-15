# Foreground demo sites: field paths, decisions, caveats

Source: CoStar hackathon kit (read-only). As-of date used for "current" durations: 2026-11-09 (kit's sold-window end).

## Files in this folder

| File | What |
|---|---|
| `build.py` | `python -I build.py <kit_dir> <out_dir>` -> `all_eligible.json` (236 properties). Std-lib only, streams the JSONL files. |
| `score.py` | Scoring used to rank; `python -I score.py 30 detail` prints a review table. |
| `detail.py` | `python -I detail.py <propertyId> ...` dumps spaces, scans, suite history, food history. |
| `pick.py` | Hand-picked 25 + top 12 (the `PICKS` dict, with primary suite, primary scan, rationale, caveat) -> `candidates.json`, `top12.json`. |
| `all_eligible.json` | Every property with >=1 Matterport model that is GeneralRetail or has an active retail-use lease space. |
| `candidates.json` | 25 candidates (13 Houston, 12 LA), top 12 first. |
| `top12.json` | The 12 recommended demo sites (6 Houston, 6 LA). |

## Pipeline and exact field paths

### 1. Properties: `data/commercial-property.jsonl`
- key `id`; address from `primaryAddress.{streetNumber, streetNumberEndRange, streetDirection, streetName, streetType, streetSuffix, city, state, postcode, latitude, longitude}`
- market: `primaryAddress.researchMarketId` 14 = Houston, 20 = Los Angeles
- `propertyType` (enum PropertyType: 5 Office, 6 GeneralRetail, 9 MixedUse, 11 Multifamily, 1 Hospitality, 2 Industrial, 7 Flex); `propertySubtype` (PropertySubtype: 18 GeneralRetail_Restaurant, 20 Storefront, 21 StorefrontRetailOrOffice, 14 Freestanding, 12 FastFood, 7 Bar, 23 Supermarket, 58 MultiFamily_Apartments)
- building SF: `rentableBuildingAreaSquareFeet`, fallback `grossBuildingAreaSquareFeet` (`buildingSFBasis` says which)
- year built: `constructionEvents[]` where `eventType == 2` (ConstructionComplete) -> `year`; renovated = `eventType == 4`
- also kept: `numStoriesAboveGrade`, `parkingRatio`, `zoningDescription`, `primarySubmarketId`, `primaryPhoto.attachmentUri`, `buildingName`
- No MixedUse properties exist in the kit (types present: 2,765 Multifamily, 289 Office, 122 Industrial, 65 GeneralRetail, 55 Hospitality, 31 Flex, 5 Specialty, 5 Land, 2 Healthcare).

### 2. Matterport: `commercial-properties.csv` (authoritative id list)
- columns `PropertyId`, `MatterportModelId` (file has a UTF-8 BOM: open with `utf-8-sig`); skip empty model ids.
- Captions joined by (`propertyId`, `videoKey`) from attachments where `videoExternalReferenceType in (36, 234)`:
  - property `attachments[]`, `propertyApartment.models[].attachments[]`, `propertyApartment.models[].units[].attachments[]`
  - listing `attachments[]` (keyed by the listing's `propertyId`)
- Captions are the only way to know WHAT a scan shows ("Suite 104 - 2,946SF" vs "1BR, 1BA - 606SF" vs "Pool").
- `matterportModelIdsForSuite` (per space) = scans whose caption names the available suite (`Suite <suite>`) or its exact SF (`2,946SF`). `matterportScanRelation` in `selection` is my manual label: exact-suite / same-center-other-suite / adjacent-suite / center-tour / building-lobby / building-office-suite / no-retail-scan.

### 3. Listings: `data/commercial-listing-summary.jsonl`
- Keep `listingStatus == 1` (Active) with a non-null `forLeaseSummary` (lease `listingType`: 14 PropertyDirectSpaceForLease, 19 CommercialSublease, 16 BuildingParkDirectSpaceLease, 17 ShoppingCenterDirectSpaceForLease, 21 PropertyCoworking).
- Iterate `forLeaseSummary.spaces[]`; property = `spaces[].propertyId` (fallback listing `propertyId`; matters for types 16/17).
- Drop spaces with `dateOffMarket`. `isLeasePending` kept as a flag (excluded from "fit" spaces).
- Food-suitable filter: `spaces[].spaceUse in (5 Retail, 3 OfficeRetail)`, or `spaceUse == 0` in a GeneralRetail property. (SpaceUse: 1 Office, 2 OfficeMedical, 3 OfficeRetail, 4 Medical, 5 Retail, 6 Flex, 7 Industrial.) Result: 494 spaces on 208 properties; 228 spaces carry a rate.
- Size: `squareFeetMax` (advertised), `squareFeetMin` (min divisible), `squareFeetMaxContiguous`.
- Rent: `rateLow`, `rateHigh` (0 = no rate given), `rateBasis` (1 Monthly, 2 Yearly). **$/SF/yr = rate x 12 when rateBasis == 1, else rate.** Use the per-space basis, not the city: LA is mostly monthly but 18 LA spaces are yearly and 3 Houston spaces are monthly. All rates fell in a sane $5-150/SF/yr band after conversion, so they are per-SF (listing-level `askingRateMeasurementType` 1 = SquareFeet). `monetaryUnit` 1 = USD on every candidate space.
- Service type: `spaces[].serviceType` (ServiceType: 13 TripleNet=NNN, 7 FullService=FSG, 9 ModifiedGross=MG, 12 DoubleNet, 10 Net, 4 PlusElectric, 6 PlusUtilities, 11 Negotiable, 14 ToBeDetermined; 11/14/0 mean none quoted). The listing-level `forLeaseSummary.serviceType` is often 0, do not rely on it.
- Other per-space fields kept: `id`, `suite`, `floorName` (FloorName: 23 Ground, 24 FirstFloor, 20 Basement...), `spaceType` (1 Relet, 2 New, 3 Sublet), `dateOnMarket`, `availableOnDate`, `leaseTermType`, `floorPlan.attachmentUri`, `notes[].value` (space notes), listing `notes[].value`.
- Restaurant-readiness keywords regex on space notes (`restaurant|kitchen|hood|grease|vented|cafe|coffee|food|bar|patio|second.gen|2nd.gen|dining|drive.thru`) -> `restaurantKeywordsInSpaceNotes`. Listing-level notes are kept separately because they describe the neighbourhood ("dining nearby") and give false positives.
- Do NOT use listing rollups (`forLeaseSummary.askingRateLow/High`, `totalAvailableSquareFeet`) for these sites: they blend the office floors of the same building.

### 4. Tenants: `data/location-occupancy.jsonl` + `data/company-detail.jsonl`
- join `propertyId`; tenant = `tenantLocationId` -> company-detail `id` (null = unknown tenant).
- current tenant count = occupancies with `toDate == null`.
- move-in = `moveInDate`, fallback `fromDate` (`moveInSource` records which); move-out = `toDate`; duration in years to move-out or to 2026-11-09.
- `expirationReason` (LocationOccupancyExpirationReason: 4 ClosedLocationOrBankrupt, 10 MovingOutNewAddressUnknown, 1 MoveIntoAnotherProperty, 2 UnableToConfirm...). `ClosedLocationOrBankrupt` is the hard "graveyard" signal; "MovingOutNewAddressUnknown" is the usual value for a restaurant that simply disappeared.
- suite and size: `spaces[].suite`, `spaces[].squareFeetOccupied`. Lease dates: `leaseDeal.signDate`, `leaseDeal.expirationDate`.
- **There is no SIC or NAICS field in the kit.** Food classification (`classify()` in build.py):
  1. `profile.industryType == 17` (AccommodationAndFoodServices), minus hotels (`profile.businessType == 27`, `profile.businessSubtype == 82`, or hotel words in the name) and minus names matching a not-food regex (investments, housing, entertainment, group...).
  2. name regex on `name`, `profile.companyName`, `brandProfiles[].locationName`: strong food words (restaurant, cafe, pizza, grill, deli, sushi, donut, chain names...) -> `name-regex`.
  3. `profile.locationBio` mentioning restaurant/menu/food/coffee adds `bio-regex` (supporting evidence only).
  4. unknown tenant with occupancy `industryType == 17` -> "Unknown tenant (Accommodation/Food industry)".
  5. weak words only (market, bar, lounge, tea, liquor, wine...) -> `name-regex-weak`: kept in `foodHistoryRecords`, excluded from counts.
- `matchBasis` is stored on every entry; `confidence` = high when a name or bio match exists, medium when industry code only (e.g. "Twiz", "Binning Ripps" in office towers may not be restaurants).
- `foodHistory` = stints: consecutive records of the same tenant name with a gap <= 120 days are merged (renewals and suite moves create new occupancy records; Hooters at 6922 Hollywood is 4 records, 1 stint). Raw records stay in `foodHistoryRecords`.
- Closed stints of <= 0.05 yr (a day or two) are data artifacts: moved to `foodHistoryArtifacts`, not counted.
- `spaces[].suiteTenantHistory` = every past/current occupancy (any industry) whose suite equals the available suite (normalised: strip "Suite/Ste/#", non-alphanumerics, upper-case). This is the exact-space graveyard. Many suite-level rows are "Unknown tenant".

### 5. Sales: `data/commercial-sale-comp.jsonl`
- join `entities[].propertyId`; `soldDate`, `soldForPrice`, `salePriceStatus` (SalePriceStatus: 3 Confirmed, 5 FullValue, 7 Unconfirmed, 8 Allocated), `entities[].allocatedPrice`; `isPortfolio` = more than one entity. `lastSale` = latest by `soldDate`; `saleCompCount` = all.
- Active for-sale listings on the property are in `activeSaleListings` (`forSaleSummary` scalars).

## Selection rules
- Eligible: >= 1 Matterport model AND (GeneralRetail OR an active retail-use lease space) -> 236 properties; 111 have a rent.
- "Fit" space: rent present, 800 <= `squareFeetMax` <= 6,000, not lease-pending.
- Score (score.py): fit space + rent 5; past food 2 + min(n,3); current food 1; scan of the available suite 4 (else suite/retail-captioned scan 1); >= 2 scans 1; restaurant keywords in space notes 2; retail building 2; quoted service type 1; Multifamily without a suite scan -2.
- Final 25 and the top 12 were then chosen by hand from the ranked list (see `selection.rationale` / `selection.caveat`), balancing 6 Houston / 6 LA and mixing story types: 2nd-gen restaurant with a dead predecessor, long-lived survivor, first-gen space (full build-out cost), NNN vs FSG.

## Caveats
1. **Matterport is the binding constraint.** Only 8 of the 25 have a scan of the actual available suite (Houston: 1018657, 838391, 800827, 13913828, 7875651, 11165863; LA: 20219730, 6819921). Retail podiums of apartment buildings (Nari, Wilshire Vermont, Atelier) are scanned as apartments/pool/gym only. Check each `primaryMatterportModelId` in a browser before the demo.
2. LA has few retail-typed buildings with rent (7); most LA picks are office or multifamily buildings with ground-floor retail spaces.
3. Asking rent is not achieved rent. NNN excludes taxes/insurance/CAM (not given in the listing data: `commonAreaMaintenanceState` is a flag only), so add an NNN load estimate before comparing with FSG/MG sites.
4. Texas is non-disclosure: most Houston `lastSale.soldForPrice` are null. 6819921's 2026 sale of $960k (FullValue) is clearly not the whole building.
5. Available does not mean vacant: e.g. 800827 Suite MM (barber shop) and 5927602 Suite 186 are still occupied.
6. Food classification is heuristic (no SIC/NAICS). Counts in the summary table use the stint list after removing weak matches and artifacts; verify names before putting them on screen.
7. `sfOccupied` on a tenant can exceed the listed suite (tenants recorded against combined suites or old suite numbering, e.g. suite "A" vs today's "104").
8. Occupancy dates before ~2005 often look like researcher entry dates (several tenants in one center sharing the same move-in day); treat long-ago move-in dates as approximate.
