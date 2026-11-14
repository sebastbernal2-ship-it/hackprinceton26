# Data workspace

See the [data preparation protocol](../docs/data/README.md). Registry CSVs are coordination templates, not verified coverage. Raw and normalized sponsor data should remain local or in approved access-controlled storage until usage and retention rights are confirmed.

## Local source inputs and tools

The encrypted full kit is extracted locally under `data/raw/costar/full-kit/`. Its password belongs only in the gitignored `data/raw/costar/.zip-password`. A full JSON parse and Draft 2020-12 JSON Schema validation pass succeeded for all 139,915 records across the eight provided JSONL datasets (zero failures). This validates structural conformance, not real-world accuracy, source rights, or individual facts.

- `python3 data/prepare_starter.py` normalizes starter CSVs while preserving original source fields and adding canonical city, source-derived site ID, source row, and version. Outputs are ignored; raw inputs remain unchanged.
- `python3 data/build_site_candidates.py` joins commercial property records to starter Matterport IDs and creates a retail/mixed-use investigation shortlist.
- `python3 data/enrich_site_candidates.py` adds direct-property listing/occupancy evidence and joins tenant industry classifications by source ID, without emitting tenant names. Food-services industry is coarse historical evidence, not proof of an Italian restaurant or active use.
- `python3 data/check_matterport_models.py` performs bounded, resumable read-only model lookups. Results are local checkpoints.
- `python3 data/check_publication_address_links.py` compares publication address components for linked Matterport models in the exploratory queue. Component overlap is heuristic, not confirmation.
- `python3 data/build_operator_review.py` creates detailed listing-space/model-ID review records for candidates with historical food-service tenants. It includes bounded defurnished-view location/floor metadata and address diagnostics. All 32 distinct models linked to the current exploratory queue returned HTTP 200 for the defurnished-view metadata query; nine returned locations. All six models in the food-service-history subset returned location/floor metadata. Location IDs do not validate dimensions or suite identity.
- `python3 data/build_exploration_shortlist.py` creates a human-review queue using an exploratory 1,000–6,000 sq ft band. This is not a fit ranking or recommendation.
- `python3 data/build_diligence_scores.py` creates transparent evidence-readiness and diligence-burden indicators, with local-context columns but no crime scoring. Listing-status normalization is covered by `data/tests/test_listing_status.py`. Read [scoring methodology](../docs/data/scoring-methodology.md); these are not predictive probabilities or site recommendations.
- `python3 data/build_candidate_comparison.py` produces an exploratory evidence inventory from `data/comparison-profile.json`. Until operator requirements and verified evidence exist, scored fields and index are blank and score coverage is zero. Source listing status and historical/context counts are not fit, opportunity, or safety scores. Crime is contextual only, not weighted. See [15-stream implementation status](../docs/data/factor-workstreams/implementation-status.md).
- `python3 data/build_factor_cards.py` creates `data/normalized/costar/factor-cards.csv`: one row per site and each of the 15 factor streams, with observed/unknown status, available value, source, record, date, geography, time window, method, coverage, uncertainty, and interpretation. Unknown values remain blank. Factor-card status logic is covered by `data/tests/test_factor_cards.py`. This is an inventory, not validation or ranking.
- `python3 data/build_catalog.py` creates a standalone browser UI at `data/normalized/costar/catalog.html`. Open that local file in a browser to search/filter candidates and expand all 15 factor evidence cards. It is intentionally alphabetical rather than ranked because no validated ranking is currently available. Rebuild the cards first.
- `python3 data/build_local_context.py` adds 1-mile CoStar commercial peer counts and Houston-only 0.5-mile HPD NIBRS incident counts. See [local context methodology](../docs/data/local-context-methodology.md); crime remains contextual and is not scored. Raw police data is kept ignored/local.

The current working concept is an Italian restaurant with gelato; see [concept profile](../docs/data/restaurant-concept-profile.md). Property-level matching does not prove a suite matches the scan. No listing record or historic tenant record proves current availability or suitability; verify with the broker and qualified local professionals.


## Tests

`python3 -m pytest data/tests` runs with no sponsor data, secrets, or network. Fixtures in `data/tests/fixtures` are tiny synthetic files (invented IDs and coordinates). They cover: starter-to-property Matterport joins and access-check filtering, listing-status normalization and active-lease-space filtering, factor-card status/missingness logic, and the 0.5-mile haversine incident aggregation (including the boundary, offense-count weighting, and zero-vs-unknown). Fixture datasets use `.json` arrays because `*.jsonl` is gitignored. The scripts that call the Matterport API (`check_matterport_models.py`) and the operator/catalog builders are not covered by tests.

## Verified vs claimed

Verified means re-run by a person or agent against local `data/raw` on 2026-11-14, reporting aggregate counts only. It confirms the script runs and the numbers below; it does not confirm real-world accuracy.

Verified by local run:
- The eight kit JSONL files hold 139,915 non-empty lines in total (1,747 apartment-listing; 1,022 commercial-listing-summary; 3,339 commercial-property; 6,120 commercial-sale-comp; 49,575 company-detail; 74,093 location-occupancy; 1,899 residential-listing-features; 2,120 residential-listings).
- `build_site_candidates.py` writes 65 GeneralRetail candidates (41 Houston, 24 Los Angeles; no MixedUse in this snapshot). 59 have at least one linked Matterport model ID, and 59 have at least one accessible one.
- The model access-check log holds 13,000 records over 12,994 distinct model IDs: 12,994 HTTP 200 and 6 HTTP 504. 12,993 of the 200s carry a result.
- `enrich_site_candidates.py`: 45 of 65 candidates have a directly linked listing record; 41 have a listing whose status is Active (snapshot status, not current availability); 22 have at least one historical food-service tenant location.
- `build_local_context.py`: 65 rows; 101,878 Houston police events aggregated (weighted by Offense Count), source dates 2026-01-01 to 2026-06-30. Of the 41 Houston candidates, none are blank after the zero-vs-unknown fix (previously 10 were blank because zero nearby incidents was not written as 0).
- `build_factor_cards.py` on the existing 18-site review queue: 270 cards (18 sites x 15 factors), 31 observed and 239 unknown.
- The refactors of `build_site_candidates.py`, `enrich_site_candidates.py` (except the max-sqft filter), and `build_factor_cards.py` produce byte-identical output to the pre-refactor scripts on the local data.

Claimed in docs, not re-verified here:
- The JSON Schema (Draft 2020-12) validation of all kit records with zero failures; only the line counts above were re-checked.
- The Matterport figures in the operator-review bullet (32 models linked to the exploratory queue, nine with locations, six in the food-service subset) and any other live-API result. `check_matterport_models.py` and `build_operator_review.py` need credentials and were not run.
- Pilot-tour observations (model floor area versus marketed suite area, room labels): they depend on a pilot property ID that is deliberately not recorded here.
- Everything about real-world accuracy: that a listing is currently available, that a tenant is currently operating, or that a model matches a suite.
