# Labor, supplier, and logistics context

**Decision question:** What staffing and inbound supply constraints should the operator investigate for the concept and hours?

**Candidate sources:** BLS OEWS metro occupation wages/employment; Census LEHD/LODES commute flows; city freight/loading rules; USDA/food supplier directories or operator-provided vendor terms. Houston/LA labor markets vary substantially by role and geography.

**Preliminary:** No labor, wage, supplier, or freight data joined to candidate sites.

**Prep:** identify role set from operator menu/service model; obtain metro wage distributions and date; distinguish broad metro supply from site-access evidence; map loading/curb rules and supplier delivery requirements; interview operator on actual vendors and staffing plan.

**Do not claim:** hiring availability, wage offer, supply reliability, or delivery performance from metro aggregates alone.

## Verified adapter (BLS API v1) — run 2026-11-14

Adapter: `data/factors/labor_supply/adapter.py` (`fetch`, `observations`, `timeseries`); tests in `data/tests/factors/labor_supply/` (6 pass; fixture is a trimmed real response plus an injected null marker).

**What was verified by live queries (no key, HTTP POST to `api.bls.gov/publicAPI/v1/timeseries/data/`):**
- OEWS `OEUM<area7>000000<SOC6><datatype2>` for Houston (0026420) and Los Angeles-Long Beach-Anaheim (0031080): SOC 353023, 352014, 353031, 359011 with datatypes 01 (employment), 03 (mean hourly), 08 (median hourly) all return data. The API exposes only one year (2025, period A01; May 2025 reference). So there is no OEWS trend from this source.
- CES `SMU<state><cbsa>7072200001` (food services and drinking places employment, thousands, NSA): monthly 1990-01 to 2026-09 (441 points each; latest values preliminary). This is the only trend series.
- Not found: SOC 353021 (combined food prep/serving) and 311011 return "Series does not exist"; metro average hourly earnings for NAICS 722 (`...03`) do not exist. QCEW series (`ENU...`) probes for the metros returned "does not exist"; QCEW is not used.
- Sample values (aggregate, metro): fast food/counter mean hourly 2025 Houston 13.29, LA 19.75 USD; food services employment 2026-09 Houston 298.8k, LA 544.7k.

**Coverage over the 65 candidate sites:** 65/65 mapped (41 Houston, 24 LA); 13 observations per site, 845/845 observed, 0 unknown. This is metro-level only: every site in a metro gets identical values; there is no site-level signal.

**Terms:** bls.gov pages (terms of service, FAQ) returned HTTP 403 to automated fetch, so licence text was NOT verified. The API itself reports v1 limits of 10 years per request; the documented v1 daily cap (25 queries/day, 25 series/query) is unverified here. Adapter caches under `data/derived/labor_supply/cache` (gitignored, no expiry; delete to refresh) and issues 5 requests per metro. Confirm BLS data-use and citation terms before publication.

**Limitations:** metro aggregates are not site wages, hiring availability, or wage offers; OEWS is a survey estimate with sampling error (RSE not fetched); area names/CBSA definitions changed over time (Houston-Pasadena-The Woodlands); CES latest months are revised; missing series become `unknown`, never zero. No intervals or forecasts are produced.
