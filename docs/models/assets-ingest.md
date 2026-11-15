# Asset ingest (upload and identify)

Slice `assets/ingest`. Proposes DRAFT catalog Assets; nothing is auto-confirmed and no price is ever set (`priceRef` stays null).

## Entry points
- `python -m assets.ingest --images DIR --profile ID [--reference-scale TEXT]` and/or `--scan objects.json`. Prints JSON.
- `POST /api/assets/ingest` (multipart: `image` x1..6, optional `referenceScale`, `profileId`, `measuredW/D/H` in metres)
  returns `{proposals, mode, notice}`. Types: jpg/jpeg/png/webp checked by extension and magic bytes, 5 MB each, server-generated
  stored names under `assets/ingest/.uploads/` (gitignored). Requires `python-multipart`.
- `assets/ingest/from_scan.py`: `objects.json` boxes (`box.size_lwh_m`, metres) -> assets, `source: extracted`, `dimsStatus: estimated`.
  Malformed boxes are skipped and reported, labels mapped by keyword (unknown -> `other`).

## Honesty rules
- Vision output (model `claude-sonnet-5-5`, `ANTHROPIC_API_KEY` from env/.env, never printed) is always `dimsStatus: estimated`.
  A `referenceScale` only adds a note; numbers stay estimates. `measured` is used only when the user supplies all of w, d, h and the
  image yields exactly one proposal ("User-stated explicit measurement").
- No key, no images, or a failed call -> `mode: fixture`, notice starts `SAMPLE DATA`, proposals tagged `sample`.
- Clearance values are generic placeholders; `clearanceBasis` says so (assumption, not code or datasheet).
- `provenance.confidence` is the model's own number, not calibrated.
