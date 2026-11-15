# Asset ingest (upload and identify)

Slice `assets/ingest`. Proposes DRAFT catalog Assets; nothing is auto-confirmed and no price is ever set (`priceRef` stays null).

## Entry points
- `python -m assets.ingest --images DIR --profile ID [--reference-scale TEXT]` and/or `--scan objects.json`. Prints JSON.
- `POST /api/assets/ingest` (multipart: `image` x1..6, optional `referenceScale`, `profileId`, `measuredW/D/H` in metres)
  returns `{proposals, mode, notice, provider?, model?}`. JPEG/PNG/WebP are checked by extension and magic bytes, 5 MiB each.
  Alternatively ONE `.mp4`/`.webm`/`.mov` video (<= 60 MB, magic bytes checked; not mixed with images): up to 6 well-spread sharp
  frames are sampled with OpenCV (`capture/frames.py`, no ffmpeg install), identified like images, and each proposal's notes say
  "Extracted from video frames at t=...s"; the response adds `source: "video"` and `frames: [{t}]`. Needs `opencv-python-headless`
  on the server (503 otherwise); an undecodable clip is 422. Frames and the clip live only in the temp dir, removed on success and failure. Images are held in a
  server-generated temporary directory under `assets/ingest/.uploads/` only while the vision call runs, then deleted on success or
  failure. Empty uploads return 422. Requires `python-multipart`.
- `assets/ingest/from_scan.py`: `objects.json` boxes (`box.size_lwh_m`, metres) -> assets, `source: extracted`, `dimsStatus: estimated`.
  Malformed boxes are skipped and reported, labels mapped by keyword (unknown -> `other`).

## Vision providers (first match wins)
1. OpenAI-compatible: `VISION_BASE_URL` + `VISION_MODEL` (optional `VISION_API_KEY`, `VISION_TIMEOUT` s default 120,
   `VISION_RETRIES` default 2). POSTs `{base}/chat/completions` with images as `data:` URIs and a JSON-schema response format
   (one fallback request without it if the server answers 400/422). Retries timeouts, connection errors, 429 and 5xx. Intended for a
   local/open model, e.g. a vLLM server for Qwen3-VL reached over an SSH tunnel.
2. Anthropic (`ANTHROPIC_API_KEY`, model `claude-sonnet-5-5`).
3. None -> labelled fixture samples.
Keys are read from env/.env and never printed. Tested only against a local stub OpenAI-compatible server and fakes, never a live model.

## Honesty rules
- Vision output is always `dimsStatus: estimated`; origin is `vision:<model>`. A `referenceScale` only adds a note. `measured` is used
  only when the user supplies all of w, d, h and the media yields exactly one proposal.
- `mode: live` means a provider answered with a parseable proposals array (possibly empty). `mode: failed` means a configured
  provider errored, timed out, or returned malformed/empty output: `proposals` is empty and `notice` starts `IDENTIFICATION FAILED`.
  Failures never become samples and never look like extraction.
- `mode: fixture` (no provider configured): notice starts `SAMPLE DATA`, proposals are tagged `sample`, origin `fixture`. They are
  not derived from uploaded media, the UI hides Confirm, and `POST /api/assets` rejects them (422).
- Optional `style` (materials, `#rrggbb` colors, finish, styleTags, `inferred: true`) is read from the photo by the model; it is a
  guess, editable in the review UI, and not a spec. Absent when the model gave nothing.
- Clearance values are generic placeholders; `clearanceBasis` says so (assumption, not code or datasheet).
- `provenance.confidence` is the model's own number, not calibrated.
