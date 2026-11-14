# Inspection (vision walkthrough bot)

Produces `DefectFinding[]` for a listing from two sources:

1. `inspection/vision.py`: sends interior images to `claude-sonnet-5-5` (Anthropic SDK, `ANTHROPIC_API_KEY` from env or `.env`) with a strict restaurant-risk prompt. Output is validated/coerced (`inspection/schema.py`); invalid values degrade to `severity: unknown`, `category: other`. With no key/SDK or no images it returns `mode: "fixture"` synthetic samples, labelled `[SAMPLE]`.
2. `inspection/geometry.py`: deterministic rules over `plan.json` from `modeling/pano_pipeline.py`. Thresholds live in `T` and are ASSUMPTIONS (not code or sourced standards); the same rules apply to every site.

Honesty rules: findings are model observations, not confirmed defects. `modelConfidence` is the model's own number, not a probability. Images cannot prove hidden defects; every finding has a `verificationStep` for an on-site inspector.

`inspection/cost_link.py` fills `costLineItemIds` from `inspection/category_cost_map.json` (empty until catalog ids are filled in).

Run: `python -m inspection.run --images <dir> [--plan plan.json] --listing-id <id> --out data/derived/inspection` (needs `anthropic`, `python-dotenv`). Output is gitignored (`data/derived/`).
API: `GET /api/property/{id}/inspection` reads `$INSPECTION_DIR/<id>.json` (default `data/derived/inspection`); else `mode: none` (or fixture when `INSPECTION_FIXTURE=1`).
