# Candidate evidence and diligence scoring (experimental)

## Purpose

`data/build_diligence_scores.py` creates a reproducible, interpretable scorecard for the current cafe research queue. It ranks evidence availability for human review and summarizes unresolved diligence. Historical food-service evidence is broad context, not cafe precedent or fit. It does **not** estimate business success, probability of lease suitability, revenue, safety, code compliance, or a recommendation.

## Comparison, scoring, and model choice

A future product may need comparison across candidates, but current evidence does not justify ranking them. `data/build_candidate_comparison.py` currently emits an exploratory evidence inventory, not a scored comparison. The profile weights are provisional and are not applied to unknown or unvalidated fields. Until operator requirements and validated preference-relevant evidence exist, component scores and weighted index are blank and score coverage is zero. Do not infer fit or opportunity from the populated context columns.

This is not a claim that only categorical models are possible. Depending on the decision, useful future approaches could include continuous utility scoring, Pareto/multi-objective ranking, interval/range estimates, constraint optimization, or supervised ML. The method should follow the decision and available labels. We currently lack validated outcomes (operator-confirmed fit, build-out cost, permits, lease decisions), and the candidate set is selected. Thus a trained outcome-prediction model is not currently defensible. Keep evidence and assumptions explicit; use ML later if representative, consented labels and evaluation data support it.

## Exploratory descriptive survival analysis (allowed, labelled)

The statement above that a trained outcome-prediction model is not defensible applies to per-site success, fit or opportunity prediction. It does not bar exploratory descriptive survival analysis of recorded tenancy spells (`docs/models/survival.md`) if all of these hold: outputs are labelled "exploratory descriptive market prior" and "not a per-site success prediction"; they are segment-level (market, property type), never attached to a candidate as a score or rank; they carry bootstrap intervals, a method statement, training window, citation and limitations; they are emitted only if held-out validation beats a naive baseline (otherwise nothing is emitted); the kit's office/multifamily dominance is stated; and they are not combined into any weighted index. Crime and safety context remain unscored.

## Current score components

Historical experimental evidence-readiness formula (not a current candidate ranking; do not interpret as validated):

- Direct property listing + accessible Matterport link: up to 20.
- A source listing marked Active: up to 25. This is a snapshot status, not present-day freshness or confirmation.
- Listed area in a broad exploratory 1,500–4,000 sq ft band: 20; 1,000–6,000 sq ft: 12; otherwise 0. This band is unvalidated and should be changed when the operator gives requirements.
- Historical linked tenant locations classified as food services: 5 each, up to 20. This is coarse historic context only.
- Matterport defurnished spatial-location metadata exists: 15. This does not establish measured geometry or suite match.

Diligence burden (0–100) counts unresolved questions: suite-to-scan identity, permitted food-service use, menu-dependent cooking systems, refrigeration, utility/plumbing capacity, accessibility/egress, and Vexcel/aerial evidence; each contributes 10. Missing verified sprinkler data and absence of an accessible scan/active listing can also add burden. This is a checklist index, not a risk probability. Hood, fire-suppression, gas, and grease checks depend on the eventual menu and equipment; they are not presumed requirements.

## Data handling and interpretation

- Scores are derived locally from source IDs and explicit fields; no tenant names are emitted.
- Missing facts are unknown, never negative evidence or safety.
- Active listing status is time-sensitive and must be confirmed with broker.
- Historical tenant industry does not prove the current business or space configuration.
- Property-level Matterport links and address-component overlap do not prove the listing suite is shown.
- Do not publish a single “best site” ranking from this exploratory scorecard.

## Next validation before product use

Collect operator requirements (menu, bought versus prepared/baked on site, seats, budget, and area), verify at least one suite and scan with broker/sponsor, ground-truth dimensions, and obtain expert-reviewed infrastructure/use findings. Record provenance, reviewer, date, method, and confidence for every label. Build a calibrated model only if a sufficient representative labeled dataset exists; validate out-of-sample and report uncertainty and subgroup coverage.
