# Crime and safety context

**Decision question:** What responsibly sourced, geographically comparable incident context may a user want to inspect?

**Sources:** Houston Police Department NIBRS public view at <https://www.houstontx.gov/police/cs/xls/>; LA County/LAPD public crime data and California DOJ if their definitions, coverage, and permitted use are suitable. Afnan's `origin/frontend_dev:data_scripts/house_report.py` provides a residential Houston NIBRS prototype.

**Preliminary:** Local Houston file `data/raw/houston-police/NIBRSPublicView2026.csv`; Jan 1–Jun 30 2026 snapshot; aggregated 0.5-mile incident counts for 31 Houston retail candidates. LA has no equivalent output. Not included in score. Raw incident detail stays local/ignored.

**Prep:** establish comparable time period, geography, offense taxonomy, geocoding coverage, reporting completeness, and normalization denominator before comparing. Add counts and data coverage as separate UI fields; consider multiple radii/time windows as sensitivity analysis.

**Do not claim:** crime rate, site safety, risk probability, or cross-city ranking. Incident density is not population/exposure-adjusted; policing/reporting/geocoding create bias. Do not let crime count silently penalize a candidate.
