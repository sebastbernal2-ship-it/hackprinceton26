# Climate and recurring weather

**Decision question:** What recurring heat, precipitation, humidity, freeze, wind, and seasonality conditions affect customer access, utilities, comfort, delivery, patio operations, and operating costs?

**Candidate sources:** NOAA Climate Data Online and NCEI normals/extremes (<https://www.ncei.noaa.gov/cdo-web/>; <https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals>); NOAA/NWS station and forecast APIs for short-term conditions. Property coordinates are available.

**Preliminary:** No weather station series or normals fetched. No station-selection/interpolation method validated.

**Prep:** select nearby stations by distance/elevation and completeness; compare 1991–2020 normals plus clearly bounded recent observations; derive transparent counts/durations (hot days, heavy precipitation days, freeze events), missingness, and station distance. Keep long-run climate normals distinct from short-term weather forecast.

**Do not claim:** site-specific future climate or revenue impacts from one station or historical average. Climate projections need scenario/model/time horizon and uncertainty, not extrapolation of recent weather.
