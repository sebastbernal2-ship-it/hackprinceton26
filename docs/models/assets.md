# Asset catalog

Sparse catalog of placeable equipment/furniture so layouts can be tried at different sizes and shapes.

- Contract: `contracts/asset.schema.json` (generated from `assets/models.py`). Every asset carries `dimsStatus`
  (`measured | catalog | estimated`); generated variants are `estimated` (mirrored inherits the parent's status).
- Prices are never stored here: `priceRef` is an id in `data/financial/catalog.json` (validated) or null. Variants have
  no price (not a SKU) except mirrored, which keeps the parent's.
- Clearances are labelled assumptions (`clearanceBasis`), not code determinations.
- Storage: `assets/library/*.json` (committed seed, 16 assets) and `assets/profiles/<profileId>/` (gitignored).
  Listing returns the profile's assets first, then the library.
- Seed dimensions: widths/depths taken from the financial-catalog labels where they exist (sink 84 in, range 36 in,
  hood 12 ft x 48 in, hand sink 17x15 in, gelato 49 in); everything else is a nominal class size. No spec sheet was
  fetched, so ALL seed assets are `estimated`; replace with measured/catalog values as sources are read.
- Variants (`assets/variants.py`): `corner_l` (armA/armB/depthA/depthB, inside corner at (depthB, depthA)), `island`
  (clearance on four sides), `wall_run` (length within dimRanges.w), `scaled` (only allowedSizes if present, else
  dimRanges, else refused), `mirrored`. Each writes a procedural extruded GLB (`assets/glb.py`, pure python).
- API: `GET/POST /api/assets`, `GET/PATCH /api/assets/{id}`, `POST /api/assets/{id}/variants` (ingest is a separate router).
- Footprint frame: x = width, y = depth (front at y=0), metres, closed ring, origin at min corner.
