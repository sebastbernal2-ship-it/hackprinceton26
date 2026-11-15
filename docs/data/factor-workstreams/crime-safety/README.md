# Crime and safety context

**Decision question:** What responsibly sourced, geographically comparable incident context may a user want to inspect?

**Sources:** Houston Police Department NIBRS public view at <https://www.houstontx.gov/police/cs/xls/>; LA County/LAPD public crime data and California DOJ if their definitions, coverage, and permitted use are suitable. A residential Houston NIBRS prototype existed upstream on `origin/frontend_dev` but was removed from this repo.

**Preliminary:** Local Houston file `data/raw/houston-police/NIBRSPublicView2026.csv`; Jan 1–Jun 30 2026 snapshot; aggregated 0.5-mile incident counts for 31 Houston retail candidates. LA has no equivalent output. Not included in score. Raw incident detail stays local/ignored.

**Prep:** establish comparable time period, geography, offense taxonomy, geocoding coverage, reporting completeness, and normalization denominator before comparing. Add counts and data coverage as separate UI fields; consider multiple radii/time windows as sensitivity analysis.

**Do not claim:** crime rate, site safety, risk probability, or cross-city ranking. Incident density is not population/exposure-adjusted; policing/reporting/geocoding create bias. Do not let crime count silently penalize a candidate.

## LA adapter: `crime_safety_la` (verified 2026-11-14)

Code: `data/factors/crime_safety_la/adapter.py` (`fetch(site)`, `observations(site, raw)`, `fetch_city_monthly()`); tests in `data/tests/factors/crime_safety_la/` (synthetic fixtures). Run: `uv run --no-project python data/factors/crime_safety_la/adapter.py <checkout-with-local-data>`; cache and outputs go to gitignored `data/derived/crime_safety_la/`.

**Source:** LAPD NIBRS Offenses Dataset, `data.lacity.org/resource/k7nn-b2ep` (Socrata, no key used). It uses NIBRS offense codes, the same taxonomy as the Houston file, so the Houston violent/property code sets and 0.5 mi haversine (`build_local_context.miles`) are reused. The older legacy-UCR file `2nrs-mtv8` ends 2024-12-30 and is used only for the city monthly series.

**Licence/terms:** the portal metadata for `2nrs-mtv8` reports CC0 1.0. The API metadata for `k7nn-b2ep` returned no licence field (null), so its terms are UNVERIFIED; confirm on the portal page before redistribution. No attribution text was found.

**Window:** occurrence date 2026-01-01 to 2026-06-30, matching the Houston snapshot. Per offense row, the count is `totaloffensecount` (Houston uses Offense Count).

**Verified by running (2026-11-14):**
- Connectivity OK; 110,010 offense rows in the window, 20 with missing or 0,0 coordinates (excluded).
- Sites: 65 total. 24 LA sites have counts (24/24 non-zero; min 5, median about 822, max 3,696 offenses within 0.5 mi). The 41 Houston sites get a single `unknown` card (not covered by this adapter; unknown, not zero).
- The per-site bounding-box query matched a brute-force pass over the full window for all 24 sites (0 mismatches).
- City monthly aggregates saved: 2,672 rows (NIBRS series by month and NIBRS code, plus legacy UCR monthly totals).
- Tests: `pytest data/tests` 28 passed.

**Differences vs Houston NIBRS (do not compare across cities):**
- Location is LAPD's public 100-block-rounded point (`hndrdth_lat/lon`); Houston uses its own map coordinates. Rounding blurs 0.5 mi edges.
- LA covers City of Los Angeles LAPD jurisdiction only; a site near the boundary misses offenses reported to other agencies.
- LA is by occurrence date but the dataset is incremental: entry lag may make the recent end of a window undercounted. Records are included "from any date" entered in RMS.
- LA counts include Group A and Group B offenses (all NIBRS rows); the Houston file is the HPD public view, whose coverage was not re-verified here.
- Monthly NIBRS counts are not complete before about 2025 (RMS began 2024-03-07; Jan 2024 about 700 rows vs about 18,000 per month from 2025). Use the legacy UCR series for 2020-2024; its taxonomy differs (UCR vs NIBRS) and it cannot be joined to NIBRS counts without a bridge. Trend fitting should use 2025 onward for NIBRS.

**Limitations:** counts are reports, not rates, not population-adjusted, no safety score, never used in scoring or ranking. Cards are `derived` (aggregated from observed offense records); unknown stays unknown.
