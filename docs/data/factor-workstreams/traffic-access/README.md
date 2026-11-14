# Traffic, access, and parking

**Decision question:** Can intended customers, staff, delivery drivers, and suppliers reach and use the site at relevant times?

**Candidate sources:** CoStar property retail frontage/parking fields; TxDOT traffic counts and Houston-area transportation GIS; LADOT/L.A. GeoHub, Caltrans traffic counts, METRO and LA Metro transit GTFS feeds; OpenStreetMap for network geometry (license attribution required).

**Preliminary:** Candidate coordinates and some CoStar frontage/parking fields exist. CoStar property includes traffic-count fields on some frontage entries; coverage has not been measured. No public traffic/transit feed fetched, no routing, time-of-day analysis, or entrance/driveway validation. Do not treat raw daily traffic as likely customers.

**Prep:** summarize CoStar frontage traffic-count completeness, source/date, and units; inventory official count station feeds; measure nearest station/road class; validate candidate driveway/access and parking; inspect GTFS stops/service by weekday/time. Keep counts distinct from modeled access.

**Do not claim:** visibility, safe access, customer conversion, or travel times from straight-line distance. Traffic volume is not footfall or sales.

## Verified adapter (run 2026-11-14)

Adapter: `data/factors/traffic_access/adapter.py` (`fetch`, `observations`); tests: `data/tests/factors/traffic_access/` (synthetic fixtures). Cache: `data/derived/traffic_access/cache` (gitignored).

**Sources reached (no key, tiny requests succeeded):**
- Houston: TxDOT "AADT Annuals (Public View)" ArcGIS layer (`TxDOT_AADT_Annuals_(Public_View)`, layer 0). Fields give latest AADT (`AADT_RPT_YEAR`, 2025 on this run) plus 19 prior years; year mapping HIST_nn = year - nn confirmed against field aliases.
- Los Angeles: Caltrans Traffic Volumes AADT (`CHhighway/Traffic_AADT`, layer 0). Layer metadata states it is the 2024 export, state highway network only, count year Oct 1-Sep 30. One year only (no trend); back/ahead AADT per post mile. LADOT/city street counts were not found or wired; local streets are not covered.

**Coverage over the 65 candidate sites** (nearest station with reported AADT within 3000 m, straight-line): 65/65 observed (41 TX, 24 CA), 0 unknown, 0 fetch errors. Distance to station: TX min/median/max 33/661/1980 m; CA 176/904/2890 m. 10 of 41 TX and 11 of 24 CA are more than 1 km away, so the station is often not the site's own road. TX history length median 8 years (min 1, max 20).

**Terms:** TxDOT item license: informational use, no warranty, "may not be used for commercial purposes or resold", distribution to third parties without TxDOT consent prohibited. Do not commit or republish fetched counts; confirm terms before any commercial product use. Caltrans: informational only, no warranty, no liability. No explicit open licence text was found for either.

**Limitations:** AADT is a modeled annual average on state-system roads, not footfall, visibility, access, or sales. Nearest-by-straight-line is not routed and does not resolve direction or driveway. No station in range returns unknown, never zero. Not verified: ACTIVE/CATEGORY filtering (reported in limitations text only), transit, parking, LA city counts, repeatability of the services over time.
