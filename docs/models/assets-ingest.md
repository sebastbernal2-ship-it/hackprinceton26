# Asset ingest (upload and identify)

Slice `assets/ingest`. Proposes DRAFT catalog Assets; nothing is auto-confirmed and no price is ever set (`priceRef` stays null).

## Entry points
- `python -m assets.ingest --images DIR --profile ID [--reference-scale TEXT]` and/or `--scan objects.json`. Prints JSON.
- `POST /api/assets/ingest` (multipart: `image` x1..6, optional `referenceScale`, `profileId`, `measuredW/D/H` in metres)
  returns `{proposals, mode, notice}`. JPEG/PNG/WebP are checked by extension and magic bytes, 5 MiB each. Images are held in a
  server-generated temporary directory under `assets/ingest/.uploads/` only while the vision call runs, then deleted on success or
  failure. Empty uploads return 422. Requires `python-multipart`.
- `assets/ingest/from_scan.py`: `objects.json` boxes (`box.size_lwh_m`, metres) -> assets, `source: extracted`, `dimsStatus: estimated`.
  Malformed boxes are skipped and reported, labels mapped by keyword (unknown -> `other`).

## Honesty rules
- Vision output (model `claude-sonnet-5-5`, `ANTHROPIC_API_KEY` from env/.env, never printed) is always `dimsStatus: estimated`.
  A `referenceScale` only adds a note; numbers stay estimates. `measured` is used only when the user supplies all of w, d, h and the
  image yields exactly one proposal ("User-stated explicit measurement").
- No key or a failed call -> `mode: fixture`, notice starts `SAMPLE DATA`, proposals tagged `sample`; these are not derived from
  uploaded images and must not be saved. The API rejects an empty upload with 422.
- Clearance values are generic placeholders; `clearanceBasis` says so (assumption, not code or datasheet).
- `provenance.confidence` is the model's own number, not calibrated.
