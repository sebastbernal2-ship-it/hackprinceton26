# modeling/

Matterport-based 3D tooling: turn a Matterport model (furnished + defurnished) into an empty-room mesh
and movable furniture objects, plus two browser viewers. Everything under `modeling/` is owned by the modeling slice.

Status honesty: the Matterport pipeline needs Matterport API keys and was not run end to end here (no keys were used in the merge session; only `run_demo.sh`'s export step was exercised, on synthetic data).
Only the pure-geometry pieces are covered by tests (`pytest`, see below). All outputs are *estimates*
from mesh differencing and panorama inference, not observations. Unknown labels stay null.

## Setup

```
python -m venv .venv && . .venv/bin/activate
pip install -r modeling/requirements.txt
cd modeling && python -m pytest        # no network, no keys
```

## Environment variable names (values go in a local, uncommitted `.env` or your shell; never commit them)

| Name | Needed by | Required |
|---|---|---|
| `MATTERPORT_API_KEY`, `MATTERPORT_API_TOKEN` | `FloorPlanExport.py`, `download_assets.py`, `fetch_tiles.py`, `matterpak.py`, `pano_pipeline.py`, `MatterportTest.py` | yes, for those scripts |
| `ANTHROPIC_API_KEY` | `pano_pipeline.py --label` (vision labels) | only with `--label` |
| `VEXCEL_API_KEY` | `download_assets.py`, `MatterportTest.py` (lot orthophoto) | optional |
| `HACKATHON_SITE`, `HACKATHON_SITE_USER`, `HACKATHON_SITE_PASSWORD` | `download_assets.py`, `MatterportTest.py` | optional |
| `COSTAR_KIT_ZIP`, `COSTAR_KIT_URL`, `COSTAR_ZIP_PASSWORD` | `MatterportTest.py` | notebook only |

## Files

Scripts expect to be run from a working directory that holds `assets_<modelid>/` and `pano_<modelid>/`
(they create them). Docstrings in several scripts still show `python Code\...` paths and mention
`run_all.py` / `mesh_furniture_v2.py`, which do not exist here: call the scripts by their real names.

| File | What it does |
|---|---|
| `pano_pipeline.py` | Floor plan + furnished/defurnished panoramas -> furniture boxes (`objects.json`, crops, debug images) |
| `download_assets.py` | Downloads the assets the Matterport API / hackathon site serve for one model |
| `fetch_tiles.py` | Downloads 3D Tiles (furnished and defurnished) and Matterport object annotations. `--help` works without keys |
| `matterpak.py` | Downloads/extracts a MatterPak if already unlocked and converts its OBJ (does not unlock/purchase) |
| `tiles_mesh.py` | Converts downloaded 3D Tiles to meshes in the model frame (x east, y north, z up) |
| `mesh_furniture.py` | Furnished-minus-empty mesh differencing, clustering, fusion with pano boxes; writes `objects_fused.json`, `scene.json` |
| `segment_furniture.py` | Splits the furnished mesh into furniture pieces by connected geometry; writes `objects.json`, `scene_tiles.json` |
| `tile_objects.py` | Cuts per-object textured GLBs from the tiles mesh, labels with Matterport annotations |
| `shape_carve.py` | Silhouette-carved shapes per object |
| `texture_bake.py` | Colours the empty room and objects from panoramas |
| `export_scene_for_ui.py` | Converts `objects.json` or `scene.json` into a small `tour_scene/1` JSON (metres, x east, y north, z up) for the frontend tour; skips malformed objects and reports them |
| `FloorPlanExport.py` | Downloads Matterport floor-plan images/DXF |
| `MatterportTest.py` | Hackathon explorer notebook (jupytext py:percent) |
| `studio.html` | Browser viewer/editor (prefers `scene_refined.json` closed models). Imports `./vendor/three.module.min.js` (vendored three.js r170, MIT; see `vendor/VERSION.txt`). Also needs a generated `showcase/config.js` and loads the Matterport SDK from Matterport's CDN, so it is not offline-capable |
| `editor3d.html` | Standalone 3D editor with its own embedded three.js copy; includes the new-room tool and wall removal |
| `run_demo.sh <model_id>` | Minimal chain for one model: `pano_pipeline.py` -> `plan.json` + `objects.json` (+ optional mesh fusion with `WITH_MESH=1`) -> `tour_scene.json`. Needs `MATTERPORT_API_KEY`, `MATTERPORT_API_TOKEN`. Never unlocks or buys anything |
| `run_all.py` | Davd's full step runner (download, matterpak, fetch, tiles, pipeline, meshdiff, prepare, tileobjects, refine, bake, carve, walk, sdk, serve). Adapted to run from any working folder: `MODEL_ID=<id> python modeling/run_all.py --list` (or `--model`). `--only`, `--from`, `--force` as before |
| `complete_objects.py`, `variants/variant_{a,b,c,d}_*.py` | Closed, tear-free furniture models: builds variants A (Poisson-like rebuild) and D (legged templates), picks per piece, decimates, writes `scene_refined.json`. Local only, no keys. Needs `scene_tiles.json` from `tile_objects.py`/`segment_furniture.py` |
| `refine_objects.py` | Older cleanup/prediction pass; still imported by `variants/` for its helpers (`read_glb`, `sample`, ...) |
| `eval_models.py` | Objective check of furniture GLBs (fraction of viewing rays that see through tears or hit doubled surfaces). Local, no keys |
| `walk_export.py`, `walk.html` | Packs the furnished MatterPak mesh into `assets_<id>/walk/{mesh.bin,meta.json}` for a first-person walk-through (`walk.html?model=<id>`). Local, numpy only; needs `furnished_mesh.npz` from `matterpak.py`/`tiles_mesh.py` |
| `expansion/` | Room-extension prototypes (a_parametric, b_scanreuse, c_housedna, d_roofshell) + `BRIEF.md`, `test_case.json`. Prototype quality, hard-wired to Davd's demo house; their generated inputs (`house_dna.json`, `scan.json`, screenshots) were not ported - regenerate with `analyse_house.py` / `gen_assets.py` (need local `assets_<id>/`, `pano_<id>/`) |
| `docs/HANDOFF.md` | Davd's session handoff. Treat as unverified; file paths in it say `Code/` which is now `modeling/` |
| `vendor/` | Vendored three.js build, license, version note |
| `tests/` | pytest suite (synthetic data only) |
| `requirements.txt`, `pytest.ini` | Dependencies and test config |

## Typical flow (needs keys)

```
python fetch_tiles.py --model <id> && python tiles_mesh.py
python pano_pipeline.py --model <id>
python mesh_furniture.py --pano-dir pano_<id>
python export_scene_for_ui.py pano_<id>/mesh_diff/objects_fused.json -o tour_scene.json
```

Check each script's `--help` for the exact flags; this flow is assembled from the code and not run end to end.


## What a consumer can use (frontend / inspection)

All in metres, model frame x east, y north, z up. Everything is an estimate; unknown labels are null.

- `pano_<id>/plan.json` (and `demo_<id>/plan.json`): walls (a, b, thickness, type) and rooms from Matterport's floor plan. This is Matterport's data (observed by Matterport), not our inference.
- `pano_<id>/objects.json` / `mesh_diff/objects_fused.json`: oriented furniture boxes, `source` pano / mesh / pano+mesh, confidence, optional label.
- `demo_<id>/tour_scene.json` (`tour_scene/1`): the same objects in a small frontend-friendly schema.
- `pano_<id>/mesh_diff/scene_tiles.json` + `objects_tiles/*.glb` (and `scene_refined.json` + `objects_complete/*.glb` after `complete_objects.py`): per-object textured models. Refined models contain predicted (unseen) surfaces, marked by a material named "predicted"; a scan cannot prove what is hidden.
- `assets_<id>/walk/` : walk-through mesh for `walk.html`.

Run tests: `cd modeling && python -m pytest` (or `uv run --no-project --with pytest --with numpy --with scipy --with pillow --with requests --with matplotlib pytest modeling`).
