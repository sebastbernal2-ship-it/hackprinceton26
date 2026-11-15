# Factor research phase plan

## Parallel dispatch

The work below is designed as independent packets with bounded scopes. Run them as parallel worktree slices (see `.claude/workflows/slice-and-verify.js` and [development workflow](../../development/workflow.md)); each packet owns disjoint paths.

## Phase 0 — decisions and shared contract (blocking, one coordinator)

**Goal:** prevent 15 incomparable datasets and scores.

1. Confirm operator intake fields: service style, menu/equipment, gelato production, seats, hours, target size, budget, travel shed, and tradeoffs.
2. Agree candidate universe, spatial join key, canonical site ID, source record IDs, coordinates/CRS, time semantics, and `observed / derived / estimated / unknown` status contract.
3. Decide which factors are descriptive context, hard constraints, user-weighted preferences, operational risks, or future prediction targets. No crime/demographic/hazard signals silently become suitability scores.
4. Set data-use/retention/access policy, raw data storage location, rate limits, reproducible source snapshot protocol.
5. Freeze comparison output contract: per-candidate factor value, unit, source/date/geography, coverage, confidence/method, unknown reason, and sensitivity to profile weights.

**Deliverable:** reviewed `comparison-profile.json` plus source-result schema and decision log. Current versions are provisional.

## Phase 1 — four parallel, source-specific research packets

Each packet should return: official source docs/terms; exact request/download; fields and geography; sample/coverage for a small Houston+LA set; provenance/limitations; no public commit of raw/restricted data; reproducible script and tests; recommendation whether the factor belongs in intake, shortlist context, hard constraint, or deferred research.

### Packet A: operator + property/listing + competition

Owner: product/data lead. Folders: `operator-preferences/`, `property-market/`.
- Conduct concise Socratic intake and version the user's true constraints/preferences.
- Audit CoStar listing status dates, rates/basis, property-vs-suite grain, currentness and historic food tenant evidence.
- Define concept-specific competition/trade-area measure; separate restaurant count from quality/demand.
- Output: verified profile fields, listing freshness indicator, competitor/precedent coverage report, data quality tests.

### Packet B: location access + neighborhood demand

Folders: `traffic-access/`, `income-demographics/`, `schools-education/`, `mobility-tourism/`, `labor-supply/`.
- Start with official comparable datasets for Houston and LA: traffic counts, GTFS/service, ACS/LODES, school locations/boundaries, workforce wages, tourism/pedestrian activity.
- Verify API key/limits, years, units, spatial resolution, geometry and licensing. A metro statistic is not site footfall.
- Output: source coverage matrix and a small two-city candidate sample; no aggregate “neighborhood score” until operator relevance is validated.

### Packet C: climate, hazards, crime, resilience

Folders: `climate-weather/`, `natural-hazards/`, `crime-safety/`.
- Harmonize time windows and geographies for both cities. Test multiple buffers/area denominators and report data completeness.
- Distinguish climate normals/projections, event history, mapped hazard, incident counts, exposure, and vulnerability.
- Output: descriptive factor panel with source date/resolution/uncertainty. No safety/probability ranking and no cross-city comparison unless methods are genuinely comparable.

### Packet D: visibility + permits + interior/site evidence

Folders: `signage-visibility/`, `infrastructure-permits/`, `spatial-interior/`, `aerial-site/`.
- Use pilot and a second candidate; validate Matterport dimensions against plan; obtain exact suite-to-scan identity.
- Map zoning/food permits and infrastructure questions to jurisdiction; keep authoritative verification distinct from CoStar text and image inference.
- Coordinate with teammate for Vexcel access; once available, check coverage/date and human-label one approved site.
- Output: evidence/unknown checklist, suite match confidence, dimension validation note, dated visibility/site observations.

### Cross-cutting modelling packet (after Phase 0)

- Define separate targets: preference utility (user-defined), diligence completeness, cost range, timeline range, and any long-horizon estimate. Do not call all of them “risk score.”
- Prefer constraints + Pareto comparison for tradeoffs; preserve raw factor cards. A single weighted index is optional and sensitivity-tested.
- ML only where a target, reliable labels, sufficient representative observations, permitted use, leakage-safe time split, calibration/uncertainty and evaluation metric exist. Keep deterministic formulas for explicit quantities/cost math.
- Crime, school quality, demographics, and hazard exposure require special fairness/validity review before any ranking role.

## Phase 2 — integrate and test

1. Merge factor results as independent modules; use shared IDs/types, no direct shared-file editing across agents.
2. Produce one candidate evidence brief and side-by-side matrix with observed values, confidence/coverage, source date, and missingness.
3. Test counterfactual preferences: rankings should visibly change only when relevant preference weights/constraints change; uncertainty should reduce confidence, not be silently imputed.
4. Validate with operator and local experts; capture corrections/labels with permission.
5. Decide what to demo live, precompute, or keep explicitly unavailable.

## Acceptance criteria per factor packet

- Public/authorized source and use terms documented.
- Small reproducible query/download completed or exact blocker recorded.
- Values/units/geography/time window and missingness profiled.
- Spatial/time join validated; ambiguous matches remain ambiguous.
- Tests include missing data, edge cases, and source staleness.
- Claims and candidate-facing interpretation reviewed.
- Clear next action and explicit `not in score` decision where appropriate.
