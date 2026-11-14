# Reskin: swap a space from one cuisine concept to another

Scenario analysis, not a forecast or a quote. Concept profiles are labelled assumptions, not code determinations.

- `assets/library/*.json`: 67 assets (16 seeds + 51 new). Only `range_6burner_36_cpg_s36n` is dimsStatus `catalog`
  (36 x 32 5/8 x 60 3/8 in and $1,299 read on the product page, 2026-11-14). All other new dims are `estimated`:
  tandoor sizes (24x28x34, 32x32x36 in) were seen in search-result summaries of manufacturer/retailer listings
  (see each provenance.origin), not on the pages themselves; the rest are standard class sizes. No new prices were
  added to `data/financial/catalog.json` (none were fetched), so new equipment has `priceRef: null` and costs as `unknown`.
- `assets/concepts/*.json`: italian, indian, mexican, japanese, diner, coffee_bakery. `qty.perSeats` scales by seats.
- `assets/restyle/engine.py`: `reskin(layout, from, to)` -> removed/added, placements, adjacency check, `CostLineItem`
  deltas (unknown excluded from totals, never 0), feasibility list (`verify with inspector`), material palette.
- `assets/glb.py`: `glb_from_parts` (multi-material procedural GLB), `restyle_glb(glb, palette)` (recolour by material
  name substring; drops textures), `assets/restyle/meshes.py` (procedural visual-only models, written to `assets/library/models`).
- API: `GET /api/concepts`, `GET /api/concepts/{id}`, `POST /api/reskin {listingId|layout, fromConcept, toConcept, seats?}`.
  With `listingId` the listing's true layout is unknown; a reference layout is synthesized from the concept profile
  (30% kitchen, 15 sq ft/seat: assumptions) and flagged `syntheticSource`.
- Not done: generative image-to-3D (no GPU job run).
