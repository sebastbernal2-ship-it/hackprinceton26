# Income, demographics, and trade area

**Decision question:** What is the documented size and composition of a potential trade area, and what demand indicators are relevant to the operator's concept?

**Candidate sources:** US Census ACS 5-year API and TIGER/Line geographies (<https://www.census.gov/data/developers/data-sets/acs-5year.html>); Census LEHD/LODES workplace-residence flows; Census Business Builder as discovery only. Candidate coordinates already exist in CoStar.

**Preliminary:** No census tables or demographic estimates fetched/joined. No trade-area boundaries selected. ACS is sample-based and geographic aggregates are uncertain.

**Prep:** choose drive/walk/transit trade areas with operator input; identify ACS income/household/population/employment variables and margins of error; choose census block group/tract methods; calculate coverage and suppression/missingness. Compare alternatives (rings vs network isochrones) and avoid ecological inference.

**Do not claim:** individual income, willingness to pay, likely customers, or sales forecasts from area averages. Avoid protected-class targeting and proxy discrimination; demographic context should not automatically enter a suitability score.
