# Code

## Current pipeline: furniture from Matterport panoramas

| File | What it does |
|---|---|
| `pano_pipeline.py` | Floor plan + furnished/defurnished panoramas -> furniture boxes on the plan (`objects.json`), crops, debug images |
| `splat_remove.py` | Cuts the furniture boxes out of an interior splat: `empty_room.ply`, one `.ply` per object, `report.json` |
| `planner.html` | Offline floor-plan furniture planner: open the `pano_<sid>` output folder, move/rotate/relabel, collision checks, export |
| `download_assets.py` | Downloads every visual the sources serve for a model, unmodified: preview, all Model API assets, furnished + defurnished panoramas, exterior splat + envmap + drone photos, Vexcel ortho -> `assets_<sid>/` |
| `MatterportTest.py` | Hackathon explorer notebook (API, panos, rooms, splat, MatterPak) |
| `FloorPlanExport.py` | Downloads Matterport floor-plan images/DXF to `floorplans/` |

Run from the repo root:

```powershell
$env:MATTERPORT_API_KEY="..."; $env:MATTERPORT_API_TOKEN="..."
python Code\pano_pipeline.py                 # writes pano_zvKHR9DHNjJ\
python Code\pano_pipeline.py --furniture-only   # skip art / mirrors / TVs
```

Then open `Code\planner.html` in a browser and pick the `pano_<sid>` folder.
Objects come in layers (floor covering, furniture, on surfaces, wall-mounted, ceiling); only furniture collides.
`--furniture-only` drops wall-mounted items. Edit in the planner, export `objects.json`, then:

```powershell
python Code\splat_remove.py interior_splat.ply pano_zvKHR9DHNjJ\objects.json --out emptied
```

The splat must be in the Matterport model frame (the exterior drone splat is not).
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

## 3D renovation editor (`Code/editor3d.html`)
Offline, single file (three.js embedded). Open it in a browser and choose `pano_<sid>/mesh_diff`
(produced by `python Code\mesh_furniture_v2.py`). Shows Matterport's empty-room mesh with the furniture
objects on top (green = mesh-verified, amber = mesh-only, blue = panorama guess).
- Left-drag an object to move it, Q/E rotate, Del remove, Ctrl+Z undo; right-drag orbit, Shift+drag pan, wheel zoom.
- "Wall edit mode": click a wall (yellow line) -> Remove wall. The mesh opens, rooms on both sides merge,
  and the Impact panel shows the new open-plan area, rough demolition cost range, and load-bearing warnings
  (exterior walls / spans > 3.5 m; heuristic only).
- Moved furniture that hits a wall or other furniture turns red. "Download edits.json" saves the plan.

## Photoreal pass (`Code/texture_bake.py`)
Run after `mesh_furniture_v2.py`: `python Code\texture_bake.py --obj-edge 0.06` (about 2 minutes; numpy + Pillow).
- Re-fits every panorama heading against the 3D mesh edges (±10° around the pano_pipeline value; corrections were 1–9°),
  saved to `pano_<sid>/poses_refined.json`.
- Colours the empty-room mesh from the 2048-px defurnished panoramas (`mesh_diff/empty_room_textured.obj`, vertex colours)
  and rebuilds each furniture object as a coloured model (flat-topped tables get a slab + legs) from the furnished panoramas
  (`mesh_diff/objects_tex/`, `scene_textured.json`).
- Exports 4096-px equirect panoramas + poses (`mesh_diff/panos/`, `pano_poses.json`) for photo projection in the editor.

In `editor3d.html`: "Stand in a room…" (or `[` `]`) puts you at a scan spot; the walls show the real empty-room photo and
unmoved furniture shows the furnished photo (depth-tested). Delete / move furniture, or "Empty this room", to see the real
empty room behind it. Moved furniture keeps its baked colours.

## Matterport SDK studio (`Code/studio.html`) - main viewer
`python run_all.py` ends with the `sdk` and `serve` steps: it installs Matterport's Bundle SDK into `Code/showcase/bundle`
(from npm `@matterport/webcomponent`, only if missing), writes `Code/showcase/config.js` from `.env` (MATTERPORT_SDK_KEY;
gitignored), serves the repo at http://localhost:8000 and opens the studio. Just the viewer: `python run_all.py --only serve`.

- The house is Matterport's own render of the **defurnished** model ("As scanned" switches to the furnished one).
- Our furniture objects (`mesh_diff/objects.json`, coloured models from `texture_bake.py`, optional carved shapes from
  `shape_carve.py`) are added as Scene objects. Click one, click the floor to move it, Q/E rotate, Del remove, Ctrl+Z undo.
- v8 editing ("Edit furniture" on): hovering a piece outlines it and shows its name ("Chair 3 · Dining Room"); only the real
  model surfaces are clickable and pieces behind walls are ignored; away from furniture the mouse goes to Matterport, so you
  can still walk around. Click again on the same spot for the next piece under the cursor (lamp on a nightstand, etc.).
  Dragging keeps the grab point, snaps flush/parallel to walls and into corners (hold Alt for free movement) and back onto the
  original spot, and shows "moved x m · y m to the nearest wall". Wheel / Q / E rotate (Shift = 5°), R = 90°, arrow keys nudge
  5 cm in screen directions (Shift = 1 cm), angle field in the Selection panel. The list is grouped by room with a search box;
  hovering a row highlights the piece, double-click flies to it. Names come from segment_furniture.py (`kind`: chair, table,
  bed, nightstand, sofa, lamp, ... from the piece's shape).
- Exports `edits.json` and `sdk_sweeps.json` (exact scan positions from the SDK, Model API frame).
- Frames: Model API (x east, y north, z up) -> Showcase (x, z, -y).
- `editor3d.html` stays as the offline editor with wall removal and room-area impact.

Removed as obsolete (moved to `_to_delete/obsolete/`): planner.html (2D, replaced by editor3d/studio), old mesh_furniture.py
(v2 is now `mesh_furniture.py`), probe_geometry.py and test_mesh_download.py (download question answered: Matterport only serves
the planes + defurnished meshes), splat_remove.py (no interior splat exists), the root matterport-viewer.html (merged into studio).

## Matterport full-quality mesh + AI object labels (3D Tiles)
`run_all.py` steps `fetch` -> `tiles` -> ... -> `tileobjects` (all optional; the pipeline continues without them):
- `Code/fetch_tiles.py`  downloads `model.assets.tilesets` (the 3D Tiles Matterport's own viewer renders) for the furnished
  model and the defurnished view, and `model.objectAnnotations` (Matterport's detected objects with labels).
  Field names were taken from the queries inside the Showcase SDK; the script reads the schema first. `--list` shows what exists.
- `Code/tiles_mesh.py`   tiles -> one mesh per version (leaf LOD, node/tile transforms, RTC_CENTER, Draco via `pip install DracoPy`,
  base-colour textures), auto-aligned to our model frame against the defurnished OBJ. Writes `assets_<sid>/tiles/<label>_mesh.{obj,npz,json}`.
- `mesh_furniture.py` (meshdiff step) automatically uses these full-quality meshes when they exist.
  It also checks every panorama-only furniture/surface box against the mesh difference (10 cm footprint cells):
  boxes with < 12% coverage and < 30 evidence points are moved to `objects_rejected` in objects_fused.json (no geometry there),
  and boxes whose evidence lies entirely inside a confirmed (pano+mesh / mesh-only) object get `duplicate_of_<id>`,
  which every viewer/cutter already skips (prevents furniture being drawn twice). Rugs are scored but never rejected.
  Tune with `--min-support` / `--min-support-points` (0 = keep all). Scores are in each object's `mesh_support`.
- `Code/tile_objects.py` cuts each object out of the furnished tiles mesh (inside its box, not part of the empty house), keeps the
  real textures (cropped), saves `mesh_diff/objects_tiles/obj_###.glb` + `scene_tiles.json`, and labels objects from the annotations.
  Each cut is then split into spatially connected pieces (4 cm voxels): the biggest piece centred in the box is kept, plus
  other pieces centred in the box with >= 8% of its area (`--keep-frac`); pieces centred only in the padding (neighbours,
  wall/floor leftovers) are dropped (`--no-pieces` = old behaviour). Cuts taller than 2 m and thinner than 0.45 m get a
  `tall_thin` flag (likely door / curtain / wardrobe front).
- `studio.html` (v6) shows these models first ("Matterport models" toggle), then baked boxes / carved shapes.
After the tiles are downloaded for the first time, rerun from there: `python run_all.py --from tiles`.

## Furniture pieces from the mesh's own geometry (`Code/segment_furniture.py`, default)
`run_all.py` step `tileobjects` runs this when `"furniture_split": "segment"` (the default; `"boxes"` = old tile_objects.py).
Box cuts halve objects whose box is too small and swallow neighbours when it is too big, so the pieces now come from the mesh:
1. furniture triangles = MatterPak mesh minus the empty house (minus floor-level skirts and plan-wall surface)
2. connected pieces (3.5 cm voxels), split where their top-down footprint has a narrow neck (watershed)
3. trimmed bits next to a piece are grown back, and surfaces inside a piece's outline are filled in (mattress tops, seats)
4. tables: the top + apron are lifted out; chairs (anything with a seat at 0.35-0.55 m) become their own pieces. Chairs
   pushed under the table fuse with its base in the scan, so their backs above the top are used as seeds (seat depth 55 cm)
5. beds: the mattress rectangle is fitted from medians; nightstands beside it are split off
6. labels / rooms come from the box that holds most of a piece; rugs, wall and ceiling items keep their boxes
Writes `mesh_diff/objects.json` (source `mesh_segment`), `objects_tiles/seg_###.glb`, `scene_tiles.json`, and
`segments_topdown.png` (one colour per piece, for checking). Demo house: 120 objects, dining table + 6 chairs, beds without
nightstands. Still merged: pieces welded in the scan with no neck, seat or bed top to split on (e.g. a bed-end bench).
Tuning: `--neck`, `--voxel`, `--grow`, `--no-tables`, `--no-fill`.

## Cleanup + predicting the unseen parts (`Code/refine_objects.py`, step `refine`)
Runs after `tileobjects` (and again automatically whenever the cuts are newer). numpy + scipy + scikit-image
(`pip install scikit-image`, for marching cubes), ~50 s for 120 objects.
1. cleanup: degenerate/duplicate triangles, stretched "curtain" slivers; boundary loops < 40 cm are closed (textured when
   the loop lies in one texture); light Taubin smoothing
2. shape prior by `kind` as an occupancy volume: solids (sofa, bed, cabinet, wardrobe, dresser, nightstand, shelf …) =
   footprint filled up to the scanned top, with free space the cameras saw under overhangs carved away; legged pieces
   (tables, chairs, stools) = top/seat slab + legs (missing legs mirrored from scanned ones, or a pedestal / corner legs
   guessed); scanner webbing between legs removed
3. the volume is blurred and meshed (marching cubes) -> a smooth closed surface with rounded edges; only its unseen parts
   are kept: a patch is dropped when real surface (this piece's or a neighbour's) lies along its normal within 10 cm (no
   doubled surfaces) or when ≥ 2 of the 39 scan positions had a clear view of the spot and saw nothing (plan walls and the
   pieces block views; the tripod blind cone below each camera never counts)
4. `--mirror` (off by default) also copies the mirrored real surface into gaps; scans are only roughly symmetric, so the
   copy lands a few cm beside the real surface and reads as a duplicate

Writes `objects_refined/*.glb` (predicted surfaces in a primitive whose material is `predicted`, vertex-coloured from the
nearby texture) and `scene_refined.json` (per object: what was cleaned/mirrored/predicted, scanned share, confidence).
Studio: "Complete unseen parts" switches between refined and raw cuts, "Highlight predicted" tints predicted surfaces
orange; the selection panel shows "N% scanned, M% predicted". Tuning: `--gap`, `--min-views`, `--nadir`, `--sym`,
`--smooth`, `--vox`, `--sigma`, `--reach`, `--no-predict`, `--mirror`.

## MatterPak (best source of furniture models)
`run_all.py` step `matterpak` (`Code/matterpak.py`, based on Model_download_test.py) downloads the MatterPak if it is unlocked
(it never unlocks/buys it), or picks up a zip already in the repo root / `assets_<sid>/matterpak/`. Its textured OBJ
(~335k triangles, 46 textures, already in our model frame) becomes `assets_<sid>/tiles/furnished_mesh.*`, which
`mesh_furniture.py` (meshdiff) and `tile_objects.py` (tileobjects) then use automatically:
furniture = MatterPak triangles inside each object box that are not part of the empty house (defurnished OBJ),
minus floor-level skirts and wall surface, saved as textured GLBs that studio.html shows ("Matterport models").
Rebuild after a new MatterPak: `python run_all.py --from matterpak`.
