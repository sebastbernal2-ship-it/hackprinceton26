> NOTE (merge into hackprinceton main): written by a teammate for their own checkout. Unverified. `Code/` in the paths below is now `modeling/`, and `run_all.py` runs from any working folder. Secrets/keys are `.env` names only.

# HackPrinceton 2026 – Matterport renovation planner: handoff context

Paste this into a new coding session to continue. Repo: `C:\Users\dmsch\Documents\GitHub\hackprinceton26`
(branch `Model-testing`; nothing from this session has been committed — the user commits/pushes himself).

## Goal
CoStar/Matterport track. From a Matterport scan, build an **editable model of the house**: separate furniture from the
building, show the empty house photorealistically, let the user move/remove furniture and remove walls, and report
the consequences (room areas, collisions, rough cost / load-bearing warnings). Demo house: model `zvKHR9DHNjJ`
(5836 La Mirada Ave, Los Angeles; 39 scan spots, 1 floor). Defurnished view id: `ew3wiyc2wzr94eymaex3kqd5a`.

## Secrets
`.env` in the repo root (gitignored): `MATTERPORT_API_KEY`, `MATTERPORT_API_TOKEN` (GraphQL Basic auth),
`MATTERPORT_SDK_KEY` (Showcase SDK; allowed on localhost), `VEXCEL_API_KEY`. Never commit keys.
`modeling/showcase/config.js` is generated from `.env` and gitignored. `Code/MatterportTest.py` (line ~616) still hardcodes
a CoStar zip password – remove before pushing.

## One command runs everything
`python run_all.py` (settings dict at the top). Steps, in order (skips steps whose output exists; `--from X`, `--only X`,
`--force`, `--list`):
1. `download` – `Code/download_assets.py`: every Matterport visual unmodified → `assets_<sid>/` (panoramas furnished +
   defurnished, 2 coarse meshes, floor plans, photos, drone, envmap…).
2. `matterpak` – `Code/matterpak.py`: downloads the MatterPak if unlocked (never unlocks/buys), or uses a zip in the repo
   root / `assets_<sid>/matterpak/`. Its textured OBJ (334,793 tris, 46 jpg textures, **already in our model frame**)
   → `assets_<sid>/tiles/furnished_mesh.{obj,npz,json}` + `furnished_tex/`. (cloud.xyz point cloud only with `--cloud`.)
3. `fetch` / 4. `tiles` – `Code/fetch_tiles.py`, `Code/tiles_mesh.py`: 3D Tiles route. **Not available for this key**
   (“ModelAssets has no 'tilesets' field”; 0 objectAnnotations). Kept for keys that have it. Do NOT query Matterport's
   internal `my.matterport.com/api/mp/...` endpoint (blocked as unauthorized access).
5. `pipeline` – `Code/pano_pipeline.py`: panorama furniture detection (furnished minus defurnished panos, plan-calibrated
   poses) → `pano_<sid>/objects.json` (boxes with layer furniture/surface/floor_covering/wall/ceiling, confidence).
6. `meshdiff` – `Code/mesh_furniture.py`: furnished mesh minus empty mesh (uses the MatterPak mesh when present; empty =
   coarse `001_obj_50k_defurnished_50k.obj`) → clusters fused with pano boxes → `pano_<sid>/mesh_diff/objects_fused.json`.
   Last run: 26 pano+mesh, 21 mesh-only, 159 pano-only objects.
7. `prepare` – fills `mesh_diff/` (objects.json = fused, plan.json, labels, crops, panos.json).
8. `tileobjects` – `Code/tile_objects.py`: cuts each object out of the furnished full mesh (inside padded box, not near
   the empty house, minus floor-level skirts and plan-wall surface) → textured GLB per object
   `mesh_diff/objects_tiles/obj_###.glb` (local frame: box centre x,y; floor z; z up; unrotated) + `scene_tiles.json`.
   Last run: **59/105 objects cut** (dining table+chairs, L-sofa+coffee table, round table+chairs, desk look good).
9. `bake` – `Code/texture_bake.py`: refits pano headings against mesh edges (±10°, 1–9° corrections →
   `poses_refined.json`), vertex-colours the empty house and box models, exports 4096px equirect panos + `pano_poses.json`.
10. `carve` – `Code/shape_carve.py`: silhouette carving (experimental, poor: defurnished panos are regenerated/warped so
    masks are noisy).
11. `sdk` – writes `modeling/showcase/config.js`. 12. `serve` – local no-cache server at http://localhost:8000.

## Viewers
- **`modeling/studio.html` (v7, main demo)** at http://localhost:8000/modeling/studio.html: Matterport's embedded viewer
  (bootstrap sdk.js 3.1.0, `MP_SDK.connect(iframe, key)`, loads the defurnished view) + a transparent three.js overlay
  (`modeling/vendor/three.module.min.js`) drawing our furniture, camera-synced from `Camera.pose` (projection matrix is
  row-major → `.transpose()`; verified 0 px error vs `Conversion.worldToScreen`). Our empty mesh is an invisible depth
  occluder. Overlay only shown at aligned scan spots / floor plan (dollhouse shows Matterport's exterior splat → opt-in).
  Model frame (x east, y north, z up) → Showcase (x, z, −y). Starts inside via a retrying `Sweep.moveTo` (Matterport's
  intro orbit rejects moves). Model priority: Matterport-cut GLBs (`scene_tiles.json`) → baked boxes → carved shapes.
  Edit mode: drag on floor, Q/E rotate, Del, Ctrl+Z; collisions in red; exports edits.json / sdk_sweeps.json.
- `modeling/editor3d.html`: offline three.js editor (wall removal + room merging + impact panel, photo projection at scan
  spots). Does **not** load the GLB furniture yet.
- The self-hosted Bundle SDK (Scene API) **hangs on this model** (error 620624 at the exterior splat) → not used.

## Known issues / next steps (prioritised)
1. Cleaner cuts: sofa/desk still carry skirts and neighbours (box-based cut). Ideas: connected components + keep the
   largest, tighter boxes from the mesh cluster, use `cloud.xyz` / mesh normals, stricter wall band.
2. 46 objects still not cut (too few triangles / wrong pano boxes); many pano-only boxes are false positives → filter
   by mesh support, label objects (pano_pipeline `--label` with a vision model).
3. Some cuts are doors/curtains/wardrobes (tall, 2.3–2.7 m) → classify or drop.
4. editor3d.html: load the GLBs; unify studio + editor (wall removal in studio as an overlay).
5. Empty-house realism in editor3d: bake real texture atlases instead of vertex colours; use 2048px cube faces directly.
6. New-room/extension tool on the plan with styling sampled from the house (designed, not built).
7. Demo story: “scan → editable model with furniture separated → edit in language/with mouse → quantified impact”.

## Gotchas
- User's VS Code sometimes overwrites files with stale open tabs; the device-commit tool caches by staged filename –
  write new staged names and verify with sha1sum.
- Shells in this environment cannot reach api.matterport.com; the user runs network steps on his own machine.
- Matterport console noise is harmless: `events.matterport.com … ERR_BLOCKED_BY_CLIENT/PROXY`, `Uncaught (in promise)` from showcase.js.
- Obsolete files were moved to `_to_delete/obsolete/` (gitignored), incl. planner.html, old mesh_furniture, splat_remove.

## Teammate branch sync (2026-11-14)

What main already contains and what was deliberately left on the teammate branches:

- `origin/Model-testing` (Davd): everything is ported through be9f2e2 (walk.html v4, scene_agent.py, fetch_catalog.py, vendored GLTFLoader). Not taken: `run_*.log`, `docs/restaurant_models_scan.json` (19k-line scan of sponsor models), `Code/scan_restaurants.py` (reads the sponsor kit and `.env` ad hoc), `CLAUDE.local.md`, `.claude/launch.json`.
- `origin/expansion-model-testing` (Davd): fully ported already (diff against main is path rewrites plus main's `estimate_floor_z` fix). Not taken: `shots/` PNGs (about 40 MB), `house_dna.json` and `d_roofshell/scan.json` (derived from a sponsor scan; regenerate with `analyse_house.py`).
- `origin/frontend_dev` (Afnan Ahmed): ported earlier, file by file. History holds about 154 MB of sponsor data, never merge it.
- `origin/final_frontend` (Afnan Ahmed): one commit adding `foreground_final/`, a separate Next.js app (deepagents planner, own cost engine, ML models, Vexcel/Gemini imagine, saved sites). It does not use `services/api`, and ships `public/sites` (141 MB), `docs/spikes` (23 MB), `data/sites`, `data/ml` and replays built from the CoStar kit. Not merged: it duplicates and conflicts with `foreground/` (typed API client, evidence labels, stepper), and its `layout-catalog.ts` prints catalogue prices that main refuses to invent. The small shared files (`gemini-rooms`, `matterport-scan`, `scan` route, `brief`, `refine`) are older than main's hardened versions.
