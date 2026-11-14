> Note: this README is stale. It was written for the earlier pano pipeline and does not describe every script here (e.g. tiles, mesh, texture bake, studio/editor3d) and references files such as `planner.html` that are not present. Verify by reading the code.

# Code

## Current pipeline: furniture from Matterport panoramas

| File | What it does |
|---|---|
| `pano_pipeline.py` | Floor plan + furnished/defurnished panoramas -> furniture boxes on the plan (`objects.json`), crops, debug images |
| `planner.html` | Offline floor-plan furniture planner: open the `pano_<sid>` output folder, move/rotate/relabel, collision checks, export |
| `MatterportTest.py` | Hackathon explorer notebook (API, panos, rooms, splat, MatterPak) |
| `FloorPlanExport.py` | Downloads Matterport floor-plan images/DXF to `floorplans/` |

Run from the repo root:

```powershell
$env:MATTERPORT_API_KEY="..."; $env:MATTERPORT_API_TOKEN="..."
python Code\pano_pipeline.py                 # writes pano_zvKHR9DHNjJ\
python Code\pano_pipeline.py --wall-items    # also keep art / mirrors / TVs
```

Then open `Code\planner.html` in a browser and pick the `pano_<sid>` folder.
Check `pano_<sid>\debug\*.jpg` first: red = predicted floor line, blue = ceiling line, green = detected furniture.

## archive/ (alternative approaches, not used by the current pipeline)

| File | Why it's parked |
|---|---|
| `interior_pipeline.py` | Same idea from the MatterPak point cloud - MatterPak not downloadable yet for our models (`--scan` finds one that is) |
| `MatterportSplatTest.py` | Builds a nerfstudio splat training set from panoramas (needs GPU; face orientation unverified) |
| `fetch_and_bundle.py`, `splat_to_bundle.py` | Shrink the exterior drone splat into a small AI-readable bundle |

## Data not in git

`costar_kit/` and `models_index.csv` (repo root) come from the hackathon track and are git-ignored.
Keys go in environment variables or a `.env` file (also ignored).
