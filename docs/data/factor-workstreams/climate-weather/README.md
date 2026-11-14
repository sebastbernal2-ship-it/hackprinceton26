# Climate and recurring weather

**Decision question:** What recurring heat, precipitation, humidity, freeze, wind, and seasonality conditions affect customer access, utilities, comfort, delivery, patio operations, and operating costs?

**Candidate sources:** NOAA Climate Data Online and NCEI normals/extremes (<https://www.ncei.noaa.gov/cdo-web/>; <https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals>); NOAA/NWS station and forecast APIs for short-term conditions. Property coordinates are available.

**Verified (run 2026-11-14):** `data/factors/climate_weather/adapter.py` fetched the Open-Meteo Historical Weather API (`archive-api.open-meteo.com`, no key) for all 65 local CoStar candidate sites (41 Houston, 24 Los Angeles): 65/65 sites returned complete daily data for 2023-01-01..2025-12-31 (3 full years) and all 7 cards per site are non-unknown (455 cards). Sites collapse to 24 distinct grid cells; site-to-grid-centre distance min 0.7 km, mean 3.5 km, max 6.2 km. Aggregate ranges (modeled, 2025 / 3-yr avg): Houston mean temp 21.6-22.0 degC, precip 1186-1668 mm, 23-49 days/yr tmax>=35C, 4-6 freeze days/yr; LA mean temp 16.7-18.2 degC, precip 535-670 mm, 3-18 hot days, 0-0.3 freeze days. The first pass hit HTTP 429 for 5 sites after retries; a rerun (cache resumes) completed them. Offline tests: `data/tests/factors/climate_weather/` (4 pass, synthetic fixtures).

**Cards per site:** annual mean temp and annual precipitation for 2025 (status `estimated`: reanalysis model output); hot days (tmax>=35C) and freeze days (tmin<=0C) per year, 12-month mean-temperature and precipitation seasonality (JSON arrays Jan..Dec, usable by forecasting), grid-cell distance (all `derived`). Failed or incomplete (<95%) data yields `unknown` with empty value, never zero.

**Source terms:** Open-Meteo documents free non-commercial API use under CC BY 4.0 with attribution; commercial use needs a paid plan and has rate limits (we saw 429s). Underlying data is ERA5/ERA5-Land (Copernicus). Confirm terms before any production/commercial use; not verified legally here.

**Limitations:** reanalysis grid (~10 km), not station observations, so it does not capture microclimate or urban heat; 3-year window is not a 1991-2020 normal (NOAA normals not fetched); no intervals computed; thresholds are conventions; no site-specific future climate or revenue claim; not a forecast.

**Prep:** select nearby stations by distance/elevation and completeness; compare 1991–2020 normals plus clearly bounded recent observations; derive transparent counts/durations (hot days, heavy precipitation days, freeze events), missingness, and station distance. Keep long-run climate normals distinct from short-term weather forecast.

**Do not claim:** site-specific future climate or revenue impacts from one station or historical average. Climate projections need scenario/model/time horizon and uncertainty, not extrapolation of recent weather.
