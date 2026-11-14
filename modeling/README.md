# modeling/

Matterport-based 3D tooling: turn a Matterport model (furnished + defurnished) into an empty-room mesh
and movable furniture objects, plus two browser viewers. Everything under `modeling/` is owned by the modeling slice.

Status honesty: the Matterport pipeline needs Matterport API keys and was not run end to end here.
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
| `studio.html` | Browser viewer/editor. Imports `./vendor/three.module.min.js` (vendored three.js r170, MIT; see `vendor/VERSION.txt`). Also needs a generated `showcase/config.js` and loads the Matterport SDK from Matterport's CDN, so it is not offline-capable |
| `editor3d.html` | Standalone 3D editor with its own embedded three.js copy |
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
