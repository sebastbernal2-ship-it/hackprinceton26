# Business peers: k-nearest-neighbour model card

Status: built for real and evaluated honestly. It is a descriptive peer model, not a validated predictor. Where it shows skill it is small, partial, and not explained by proximity or by "same kind". Read "How to describe this accurately" before quoting it.

## What it is (and is not)
For a target site and concept (default `cafe`), it finds the most similar food-service tenancies in the CoStar kit and aggregates how they fared: share still operating after 1, 2, 3 and 5 years, share closed within 2 years, median tenure, share still open. It returns the neighbours themselves (anonymised id, distance, same-kind flag, outcome), with 5th to 95th percentile bootstrap intervals.

It is not a per-site forecast, not a success or fit score, not a ranking, and not a model of restaurant revenue. It did not exist before this change: the earlier claim that the team "used kNN on the business side" had no code behind it (the only `knn` in the repo was a mesh-fusion parameter). This is that model, built after the fact, with its evaluation reported as found.

## Data
- Source: local CoStar kit (`location-occupancy` joined to `company-detail` where `profile.industryType` = 17, AccommodationAndFoodServices, and `commercial-property`). Same spell definitions as `triage/lineage` and `forecasting/survival` (company-location merged per building; open, clear failure = `expirationReason` 4, other exit = everything else; scheduled future ends are not observations; as-of 2026-11-09).
- Unit: one tenancy spell. Included: started 2012 or later (older spells are left-truncated: only survivors are recorded), Houston or Los Angeles, with coordinates, not lodging or corporate (name heuristic below).
- Size: 596 spells in 271 buildings: 77 clear closures, 173 other exits, 346 open. By inferred kind: quick service 130, cafe/coffee 94, full service 92, bar 37, dessert/drink 25, bakery 10, unclassified 208.
- Coverage limit that dominates everything: the kit lists only Matterport-covered buildings (3,339; 83% multifamily). Peers are sparse. For the 65 candidates the median number of food peers within 0.5 mi is 1, within 1 mi 5, within 3 mi 37. For the Bayou Café site the nearest real kit food tenancy is about 2 miles away.
- Food "kind" is derived from the company name by keyword rules (`forecasting/peers/kinds.py`); CoStar has no cuisine field and its business subtype is uninformative for restaurants. 35% of spells match no keyword ("unclassified"). Kind accuracy was not measured. Industry code 17 also contains hotels and corporate housing, which the same heuristic removes (67 spells).
- Names are never stored in the artifacts or returned by the API; peers have salted-hash ids.

## Features and distance metric
For target t and peer j (`peers_knn.py`, docstring):

`d2 = (D_mi/h)^2 + w_kind (1 - s_kind)^2 + w_size ln(sqft_j/sqft_t)^2 + w_class ((class_t - class_j)/3)^2 + w_age ((year_t - year_j)/50)^2 + w_ptype [property type differs]`

- `D_mi`: haversine miles between building coordinates; `h`: bandwidth (a hyper-parameter).
- `s_kind`: similarity of the peer's kind to the target concept, from an assumed matrix (`CONCEPT_SIMILARITY`; cafe vs cafe/coffee 1.0, vs bakery 0.75, vs dessert/drink 0.5, vs quick service 0.25, ...). Direct competitor = similarity 0.75 or more, partial = 0.4 to 0.75.
- Size, class, age, property type are building or space attributes. A missing attribute adds no distance (unknown is not a difference). Peers in the other market are excluded.
- Neighbours: the k smallest `d2`; kernel weight `exp(-d2/2)` relative to the nearest, normalised. Outcome statistics are weighted Kaplan-Meier (any end) and weighted Aalen-Johansen (clear closure, other exits as a competing outcome), shrunk toward the unweighted same-market prior by `m` pseudo-neighbours. A horizon with fewer than 3 effective neighbours whose status is known at that horizon is "not evaluable" and shows the market prior, flagged.
- Intervals: percentile bootstrap resampling neighbours by building (300 reps). They capture neighbour sampling noise, not model bias.

## Selection of k and the metric (cross-validation)
Protocol, fixed before looking at held-out numbers (`forecasting/peers/fit.py`):
1. "As-of" prediction: for a target spell starting at t0, only peers that started before t0 are used, and a peer that ended after t0 is censored at t0. The target itself is always excluded.
2. Tuning window: targets starting 2015 to 2019 (212 spells). Random search over 306 configurations (k in 3..80, bandwidth 0.5 to 8 mi, weights, shrinkage), objective Brier(closed within 2y) + Brier(ended within 2y). Among configurations within 0.002 of the best, the smoothest is taken (largest k, bandwidth, shrinkage): differences below that are noise at this sample size.
3. Held-out window: targets starting 2020 to 2024 (226 spells with an observable 2-year outcome; 20 closed within 2 years, 69 ended within 2 years). Never used to choose anything.
4. Baselines: same-market prior (as-of, unweighted Aalen-Johansen), global prior, global median tenure; also the held-out window's own base rate as an unattainable floor.
5. Metrics: Brier and AUC for "closed within 2 years" and "ended within 2 years"; MAE of completed tenure. Confidence intervals: 95% cluster bootstrap by building.

Selected (k by cross-validation): k = 80, bandwidth h = 8 mi, w_kind = 0, w_size = 0, w_class = 0, w_age = 0.5, w_ptype = 2, shrinkage m = 5. In plain words: cross-validation preferred a smooth, market-wide, building-type-weighted average over a tight local neighbourhood, and gave "same kind" no weight. Tuning-window objective by k (other values fixed): k=3 0.191, 5 0.188, 10 0.185, 20 0.183, 40 0.184, 80 0.185 (flat from 10 up).

## Results (held-out 2020 to 2024 starts, 226 tenancies)
| Outcome | kNN Brier | Market prior | Global prior | Constant base rate (floor) | kNN minus prior, 95% CI | kNN AUC (95% CI) |
|---|---|---|---|---|---|---|
| Closed within 2 years (20 events) | 0.0832 | 0.0820 | 0.0820 | 0.0807 | +0.0012 (-0.0006, +0.0026) | 0.48 (0.29, 0.65) |
| Tenancy ended within 2 years, any exit (69 events) | 0.2152 | 0.2262 | 0.2279 | 0.2121 | -0.0109 (-0.0215, -0.0003) | 0.72 (0.63, 0.79); prior 0.57 |

- Closure: the kNN is no better than the same-market prior (Brier slightly worse; AUC below 0.5 with a wide interval).
- Any end within 2 years: the kNN is better than the prior with a 95% interval that only just excludes 0 (upper bound -0.0003), AUC 0.72. This is one of two outcomes, looked at after several ablations, and the interval is wide: treat it as suggestive. Calibration is poor: predicted rates 8%, 15%, 24% (lowest to highest third) against observed 13%, 31%, 48%: it ranks, but under-predicts levels (the prior has the same problem, left truncation and as-of censoring bias survival upward).
- Tenure MAE on completed tenancies (n=99): 1.29 years for the kNN vs 1.30 for the global median. No difference.
- Full-period as-of leave-one-out (2015 to 2024, 438 targets, includes the tuning window, so optimistic): closure Brier 0.0650 vs prior 0.0645 (no better); any end 0.1782 vs 0.1856.

Where the skill comes from (ablations on the held-out window): the selected weights with geography switched off (building type and age only) score the same as the full model (any-end Brier 0.2161 vs 0.2152; AUC 0.68 vs 0.72); excluding the target's own building or every peer within 1 mile changes the any-end result very little (Brier 0.2156 and 0.2163); spatial-only (k=20, 2 mi) is not better than the prior (0.2223 vs 0.2262, interval includes 0); kind-only is worse (0.2318). So the modest any-end skill reflects which kinds of buildings hold longer-lived food tenancies (retail vs apartment complexes, building age), not that nearby restaurants of the same kind tell you more than far ones. Local and same-kind peers carry no demonstrated extra information in this kit.

## Leakage and sanity checks
- Self: the target spell is excluded from its own neighbours (tested). Same-building peers are used by default (legitimate for a site in a building with food history); excluding them is reported as an ablation.
- Time: as-of protocol, peers that start after the target are excluded and later outcomes are censored. A hindsight (non-as-of) run is reported only to show the difference it makes (any-end Brier 0.2034 vs 0.2152): that is what leaking the future looks like.
- Permutation: shuffling outcomes across spells while keeping features removes all skill (held-out closure AUC 0.50, any-end AUC 0.52, Brier at or above the prior), so the pipeline does not manufacture skill.
- Selection: hyper-parameters are chosen on 2015 to 2019 targets only; held-out numbers use the frozen configuration. They are still one split of one small dataset, and the choice among outcomes and ablations was not corrected for multiple looks.
- `businessStatus` is never read (it encodes the outcome).

## Limits
- 20 closures in the held-out window; 77 in all. Intervals are wide and several comparisons cannot separate the models.
- Kit buildings only, 83% apartment complexes; absence of a peer is unknown, not zero. Houston and Los Angeles only.
- CoStar's closure label is a research label, not verified; "moved or other exit" is not a closure.
- Name-derived kind; unmeasured accuracy; building coordinates, not storefronts (same-building peers have distance 0).
- Survivorship: spells started before 2012 and tenancies CoStar did not record are missing.
- Not causal. Not adjusted for rent, concept quality, operator, or location quality within a building.

## What it must not be used for
Not for ranking or scoring sites, not for quoting a probability that this cafe will survive, not for underwriting or lending, not as evidence that nearby same-kind restaurants are good or bad news, and not as a substitute for the Houston/LA survival model's own caveats (`docs/models/survival.md`, which also failed its held-out gate).

## How to describe this accurately
"We built a nearest-neighbour peer model over about 600 CoStar food-tenancy records in Houston and Los Angeles. For a candidate site it lists comparable food businesses and how long they lasted, with uncertainty. Tested on held-out 2020 to 2024 openings it was not better than a market average at predicting closures, and only modestly better at predicting whether a tenancy ends within two years, mostly because of building type, not because of nearby same-kind restaurants. We present the neighbours as context, not as a prediction." Do not say it predicts success, that it was validated, or that it uses same-kind restaurants nearby to improve forecasts. For the Bayou Café demo site, the nine nearest food businesses are invented DEMO placeholders and are labelled so.

## Artifacts and reproduction
Gitignored, local: `$DERIVED_DIR/business/` (default `data/derived/business/`): `peers_index.json` (anonymised pool, selected parameters, full evaluation), `context.json`, `sites.json`, `results/<listingId>.json` (one per candidate and cafe scan). Rebuild idempotently (same data gives identical files, about 30 s):
```
uv run --no-project --python 3.12 --with numpy python tools/run_business_models.py
uv run --no-project --python 3.12 --with numpy --with pytest python -m pytest forecasting/peers -q
```
API: `GET /api/property/{listingId}/business-peers[?concept=cafe|bakery|restaurant|bar|quick_service]` (`services/api/app/business_routes.py`; schema `contracts/business-peers.schema.json`). UI: "Nearby businesses: peers and competition" in the Business & financial tab.
