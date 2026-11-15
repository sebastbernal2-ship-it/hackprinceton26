# Structure, climate and expansion lens

Screening priors and scenario analysis only. Not an engineering assessment, not a forecast.

## Endpoints (`services/api/app/structure_routes.py`)
- `GET /api/structure/{listingId}`: kit fields, FEMA zone/BFE, USGS ASCE7-22 design values, elevation, tiered flags, fill rates.
- `GET /api/structure/{listingId}/scenarios`: sourced scenario table plus 2030/2050/2070 exposure view.
- `POST /api/structure/expansion`: body `{listingId?, plan (Matterport plan.json), baseRoomIds, city?, state?}`; returns room adjacency
  graph, expansion candidates and the growth timeline.

Data comes from `data/derived/structure/{properties,climate_fetch}.json`, written by `python -m structure.fetch_sources --kit ... --cands ...`
(gitignored; override dir with `STRUCTURE_DIR`). Missing snapshot -> 404, never defaults.

## Screening tiers
Tier = highest severity among evaluated flags per lens; unknown flags never lower it. Thresholds (all in `structure/screening.py`):
- USGS SDC D/E/F = elevated, C = moderate (observed from the USGS service, ASCE 7 Table 11.6-1; site class D default, not site-specific soils).
- FEMA NFHL zone A*/V* = elevated; otherwise low (observed).
- LA code eras (assumption, verify with LADBS): masonry pre-1934; multi-story wood pre-1978; reinforced concrete pre-1977; steel pre-1995 (moderate).
- Houston (assumption): pre-1980 = pre-modern wind/flood era; expansive clay/subsidence is a regional prior only, flagged moderate for every Houston site, so Houston tiers are dominated by that assumption. No reachable public Harris County subsidence layer was found.

## Climate scenarios (published numbers only)
- NOAA 2022 SLR scenarios (Low..High) from the CO-OPS API, Galveston (Houston proxy, inland site) and Los Angeles gauges, 2030/2050/2070, with published CI.
- Cal-Adapt LOCA (CMIP5, RCP4.5/8.5, not SSP) annual mean daily max temperature change vs 1976-2005, 4 models; range across models.
- Heat-day counts, design wind, pluvial flood, Houston temperature: `no sourced projection`. HVAC capacity is not in the kit: unknown.
- Exposure applies static SLR upper bound against site elevation (USGS EPQS). It says nothing about rainfall or surge flooding.

## Expansion
Adjacency from room polygons (collinear overlap >= 0.3 m within 0.3 m), shared-wall thickness hint (>=0.20 m thick, <=0.13 m thin; assumption). Hint only.
CoStar signals are same-property occupancy counts and expiry-date fill; expiry dates are sparse. Growth timeline uses `planning/financials.py` lines;
phases without a cost line (seating, expansion buildout) are unknown, not zero; phase month offsets are adjustable assumptions.
