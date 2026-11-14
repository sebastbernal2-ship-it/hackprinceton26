# Candidate evidence and diligence scoring (experimental)

## Purpose

`data/build_diligence_scores.py` creates a reproducible, interpretable scorecard for the current Italian restaurant + gelato research queue. It ranks evidence availability for human review and summarizes unresolved diligence. It does **not** estimate restaurant success, probability of lease suitability, revenue, safety, code compliance, or a recommendation.

## Comparison, scoring, and model choice

A future product may need comparison across candidates, but current evidence does not justify ranking them. `data/build_candidate_comparison.py` currently emits an exploratory evidence inventory, not a scored comparison. The profile weights are provisional and are not applied to unknown or unvalidated fields. Until operator requirements and validated preference-relevant evidence exist, component scores and weighted index are blank and score coverage is zero. Do not infer fit or opportunity from the populated context columns.

This is not a claim that only categorical models are possible. Depending on the decision, useful future approaches could include continuous utility scoring, Pareto/multi-objective ranking, interval/range estimates, constraint optimization, or supervised ML. The method should follow the decision and available labels. We currently lack validated outcomes (operator-confirmed fit, build-out cost, permits, lease decisions), and the candidate set is selected. Thus a trained outcome-prediction model is not currently defensible. Keep evidence and assumptions explicit; use ML later if representative, consented labels and evaluation data support it.

## Current score components

Historical experimental evidence-readiness formula (not a current candidate ranking; do not interpret as validated):

- Direct property listing + accessible Matterport link: up to 20.
- A source listing marked Active: up to 25. This is a snapshot status, not present-day freshness or confirmation.
- Listed area in a broad exploratory 1,500–4,000 sq ft band: 20; 1,000–6,000 sq ft: 12; otherwise 0. This band is unvalidated and should be changed when the operator gives requirements.
- Historical linked tenant locations classified as food services: 5 each, up to 20. This is coarse historic context only.
- Matterport defurnished spatial-location metadata exists: 15. This does not establish measured geometry or suite match.

Diligence burden (0–100) counts unresolved high-impact questions: suite-to-scan identity, permitted food-service use, hood/exhaust/fire suppression, grease management, utility/plumbing capacity, gelato cold chain, accessibility/egress, and Vexcel/aerial evidence; each contributes 10. Missing verified sprinkler data and absence of an accessible scan/active listing can also add burden. This is a checklist index, not a risk probability. The current queue may place nearly all candidates in the same high-burden band because these external diligence items are not verified yet; that is a signal to gather evidence, not differentiate sites.

## Data handling and interpretation

- Scores are derived locally from source IDs and explicit fields; no tenant names are emitted.
- Missing facts are unknown, never negative evidence or safety.
- Active listing status is time-sensitive and must be confirmed with broker.
- Historical tenant industry does not prove the current business or space configuration.
- Property-level Matterport links and address-component overlap do not prove the listing suite is shown.
- Do not publish a single “best site” ranking from this exploratory scorecard.

## Next validation before product use

Collect operator requirements (service style, seats, menu, gelato sourcing/production, budget, area), verify at least one suite and scan with broker/sponsor, ground-truth dimensions, and obtain expert-reviewed infrastructure/use findings. Record provenance, reviewer, date, method, and confidence for every label. Build a calibrated model only if a sufficient representative labeled dataset exists; validate out-of-sample and report uncertainty and subgroup coverage.
