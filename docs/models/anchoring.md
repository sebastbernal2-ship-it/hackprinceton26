# Anchoring defect findings in 3D

Ported from the owner's Deja-View `web/src/viewer/guide/hotspots.ts` (depth branch) and
`integrations/guide/gemini.mjs` + `prompts.mjs`, reduced to numpy/Python. Code: `inspection/anchor/`,
`inspection/hotspots.py`. Tests: `inspection/tests/test_anchor.py` (no network).

## Anchor math
Normalized region `{x,y,w,h}` (origin top-left) -> centre pixel -> windowed depth sample (30th percentile of
valid values in a 5x5 window, widened to 13x13 once) -> ray through the pixel -> point at z-depth, moved 5 cm
toward the camera. Camera is OpenGL (looks down -Z, +Y up), quaternion `[x,y,z,w]`, intrinsics in pixels of
`width x height`; depth is z-depth in metres (.npy, H x W or H x W x 1). Pins are clamped to y >= 0.03 m.
Trusted range 0.15 to 8 m. No camera, no depth, or no valid sample -> `anchor.position = null`
(`confidence: "none"`, with `reason`); a position is never guessed.

## CLI
`python -m inspection.anchor --findings f.json --depth-dir d --poses poses.json [--reality r.json] --out out.json
[--include-inferred]`
- Depth for image `X.jpg` is `d/X.npy`; `poses.json` maps image name or stem to a camera dict.
- Each finding gains `anchor` and `reality` (`observed` | `inferred`) plus `realityReason`.
- `reality.json`: `{"images": {name: "observed"|"inferred"}, "imaginedVolumes": [{"min","max"}]}` (room metres).
  Images not listed, listed as inferred, or anchored inside an imagined volume are `inferred`. Without
  reality.json a finding is `observed` only if it is panorama-sourced and has a depth anchor.
- `totals` counts `costLineItemIds` over observed findings only; inferred ones are excluded unless
  `--include-inferred`.

## Gemini provider
`inspection.hotspots.detect_defects(image, client)`: JSON-schema response `{label, box_2d [ymin,xmin,ymax,xmax]
(0-1000), category, severity, evidence_visible, inspector_must_verify}`, low media resolution by default,
`MODEL_SPATIAL` then `MODEL_FAST` on 429/503, mock mode when `GEMINI_API_KEY` is unset. Boxes become
normalized regions; boxless items are dropped (cannot be pinned). `modelConfidence` is 0 (Gemini gives none).
The Anthropic path in `inspection/vision.py` is unchanged. Neither provider has been run live in this slice.
