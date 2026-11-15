# Record triage (rt/triage)

Verifies and enriches CoStar property records the way a researcher does by hand, using three modalities: CoStar record, Matterport scan (rooms, labels, heights, floors), Vexcel aerial (parking, rooftop units, docks; filled by the aerial slice at `data/derived/triage/aerial/<propertyId>.json` as `{"parkingSpaces":{"value","confidence","evidenceRef"}, "rooftopUnits":{...}, "loadingDocks":{...}}`).

Screening triage, not an engineering assessment, never "CoStar is wrong" from a scope-mismatched comparison. Confidence labels are rule-based, not probabilities. Unknown stays null, never 0.

## Run
1. `python triage/reconcile/fetch_matterport.py --data-root <checkout with data/>` - one read-only GraphQL request per property (first accessible active model from the existing access log; 65 candidates first), cached under `data/derived/triage/matterport/<propertyId>.json`. Resumable; keys read by name from env/.env.
2. `python -m triage.reconcile.run --data-root <root>` - writes `results.json`, `summary.json`, `queue.json` next to the cache.
3. API: `GET /api/triage/summary`, `/api/triage/property/{listingId}`, `/api/triage/queue?limit=&field=&status=` (503 until step 2 has run; `TRIAGE_DERIVED_DIR` overrides the dir).

## Statuses
`filled` (CoStar blank, evidence fills it), `confirmed`, `conflicting`, `blank-unfillable`, and `unverified` (CoStar value present, no modality could test it; an addition to the four requested statuses so untestable values are not mislabelled "confirmed").

## Rules (each is an assumption)
- **clear_height_ft**: CoStar `structural.ceilingHeightFeet` is a MAXIMUM (kit docs). Compare with the scan's maximum room height, tol = max(1.5 ft, 10%). Within tol: confirmed (medium). Scan taller than CoStar + tol: conflicting. Scan lower: confirmed with LOW confidence (consistent with a max, not a measurement). CoStar blank: filled from the scan max as a derived lower bound (room scope). Office `slabToSlabHeightFeet` is not a clear height and is never used.
- **floors**: CoStar `numStoriesAboveGrade` (else listed floors) vs scanned floors. Equal: confirmed. Scan > CoStar: conflicting (may be basement/mezzanine). Scan < CoStar: unverified (suite scope). CoStar blank: filled as a lower bound.
- **area_sqft**: scan = sum of non-"Void" room floor areas. Scope is suite if within 20% of a listed suite size (lease-listing min/max/total), building if within 20% of GBA/RBA/GLA, else indeterminate. Conflict only when scan > 125% of the largest CoStar area (impossible at any scope). Otherwise unverified.
- **restroom_count / kitchen_present**: count of room labels matching bath/restroom/toilet/WC/lavatory and kitchen/kitchenette/galley/pantry. Labels are partial, so no match is blank-unfillable (unknown), never 0 / false. Counts are for the scanned space only.
- **use_hint**: removed. Room-label buckets vs CoStar propertyType were a low-confidence heuristic with no defensible rule (it produced 41 "conflicting" rows across all scanned properties, mostly mixed-use suite noise), so the field is not emitted rather than shown as unverified.
- **parking_spaces / loading_docks / rooftop_units**: CoStar `parking[].totalSpaces` sum, `numExternalLoadingDocks` (0/null = not recorded), no CoStar rooftop field. With aerial output: parking within max(5, 20%) confirmed else conflicting; docks exact. Aerial values are model estimates (`valueStatus: estimated`). Without aerial output: unverified / pending.

## Review queue
Per property-field items with status conflicting, filled, or (non-aerial) blank-unfillable. Score = status weight (conflicting 100, filled 30, blank 12, aerial-pending 4) + low/medium confidence penalty (12/5) + building-size bump (GBA/20000, max 10). It orders researcher effort; it is not a probability that the record is wrong.
