# a_parametric: plan-first procedural shell

Viewer: `index.html` (serve the repo root, e.g. `python -m http.server 8101 --bind 127.0.0.1`).
Data prep: `python Code/expansion/a_parametric/build.py` (about 1 min) writes `assets/`.
Screenshots: `node Code/expansion/a_parametric/shoot.mjs` (CDP, waits for `document.title=='READY'`).
Plain `chrome --screenshot` returned a blank frame here, so the script uses CDP instead.

## Approach
Everything outside the scan is generated from `plan.json` plus a few measured numbers, both at load time and on every edit:
- **Footprint**: the room polygons and walls are rasterised, then closed. Slots under 1.2 m are filled, since they are unscanned
  chases. The result is snapped to the plan's exterior wall centre lines, giving 8 orthogonal vertices. The addition is unioned with
  the house on a cell grid (`orthoUnion`). Vertices that come from the original polygons are kept, so old and new wall runs stay
  separate.
- **Walls**: each outline edge gets an outer face (lap siding) and an inner face (paint). Both are `ShapeGeometry` with real
  holes. Each opening has trimmed reveals, and the wall is 0.16 m thick (the plan's exterior thickness). The walls also get a
  foundation stem wall, a water table, a frieze board and corner boards at convex corners.
- **Openings**: existing windows and doors are detected automatically. For each exterior edge, `build.py` projects the scan onto the wall plane
  as a depth map (see `assets/debug/elev_*.jpg` and `depth_*.png`). Glass and views out sit beyond the interior wall face. The
  detections are regularised to the house's grammar: sill 0.9 m, head 2.015 m (the median header height of the five plan door
  gaps, measured in the mesh). The front porch and the east side were scanned from outside, which breaks the detector there, so
  those openings were curated by hand from the elevation images (`curated()` in build.py). New walls get windows by rule: a ganged
  pair on the end wall and one centred window on each side wall, at the median width of the existing windows.
- **Roof**: a hip roof at 5:12 pitch with a 0.45 m overhang. The plate sits at the measured ceiling plus 0.28 m, so the eave is
  at 2.78 m. The house footprint is split greedily into maximal rectangles. Each rectangle gets a hip roof with the same pitch and
  eave height, and the visible roof is their upper envelope. For orthogonal plans this envelope is the straight-skeleton roof: hips,
  ridges and valleys appear where the planes intersect. The addition is one more rectangle, extended into the house by its width
  plus 2 x overhang plus 0.6 m. Its ridge therefore dies into the main slope at the same pitch, eave line and overhang (a cross hip).
  Ridge and hip caps are drawn only where the envelope has a convex crease, so a new slope that is coplanar with the old one
  (side case) shows no false hip. Shingle UVs are anchored to world coordinates, so coplanar old and new slopes show the same
  texels. The soffit is the eave outline minus the wall outline. Fascia and K-gutters follow the eave outline.
- **Existing interior**: the MatterPak mesh, cropped to the footprint (309k triangles, original 2048 px textures, unlit,
  double-sided). The doorway is cut by hiding the scan triangles inside a box on the shared wall. Under the scan sits an oak plane,
  so holes left by removed furniture don't show the lawn.
- **New interior**: ceiling height is the measured ceiling of the adjacent bedroom (2.73 m). The floor is a hardwood patch taken
  from the bedroom floor of the MatterPak: a top-down texture bake picks the cleanest rectangle (sharp, anisotropic board seams,
  close to the dominant colour, which rejects rugs and smears), makes it tile along the boards and keeps the board direction. If the
  bedroom floor is mostly covered, the patch comes from the best room elsewhere (side case: Dining Room). Wall and ceiling colours
  are the area-weighted medians of the bedroom's scan texture, white-balanced on the ceiling. The rest is generated: 0.14 m
  baseboards with a shoe, a picture rail, interior window casing with a stool and apron, an oak threshold and an opened door leaf.
  The doorway is 0.81 x 2.015 m with 0.09 m craftsman casing on both faces. It is placed at the bedroom's existing exterior
  window (the window is cut down to a door), or otherwise where the scan shows the least clutter in front of the wall.
- **Site**: one painted canvas ground with soft blurred edges: lawn with dry patches, a mulch bed that follows the new outline, a
  concrete driveway on the east (the scan has a concrete surface at floor level there), a front walk and sidewalk, a street, and a
  rear patio. Also wood fences, simple trees and hedges, and two neighbour houses built with the same wall and roof kit. The sky is
  a gradient environment whose colours were sampled from the 128 px `envmap` (it is too small to use directly). The sun is WSW at
  48 degrees with soft shadows.

## How the roof and exterior were inferred
The scan has no roof. Drone photo `DJI_..._0830` shows a dark-grey asphalt roof on a one-storey bungalow: hipped, with
projecting hipped wings, white fascia and trim, a white chimney near the front, roof vents and a white front pergola. The
footprint has two front projections and a recessed porch, which fits a main hip with two lower front cross-hips. The rectangle
decomposition gives exactly that. The pitch (5:12) and overhang (0.45 m) are typical LA bungalow values, not measured. The siding
colour (#b9b8b3) is the median of scan triangles facing outward just outside the walls: the porch and side walls that the scanner
saw from outside. The dollhouse image confirms lap siding with white trim. Grade is -0.45 m (the floor sits on a raised
crawlspace), from horizontal scan surfaces outside. The chimney sits on the living-room front wall, where the hearth appears in the
floor plan. Caveat: in the drone photo the driveway looks to be on the other side. I could not establish the photo's heading, so I
followed the scan evidence.

## What looks good
The aerial and backyard views: the cross-hip roof of the addition reads as part of the original roof (same pitch, eave, fascia,
gutters and shingles, with a clean valley). The siding and trim match, and the windows match the existing ones. The interior view
reads as a believable empty room: the sampled oak floor and doorway casing match, and the real scanned bedroom shows through the
door. The plan cut-away shows the scan and the addition together.

## Known flaws
- Trees are low-poly and stylised, and the ground/lawn is painted at about 3 cm/px, so it is soft at eye level. There is no grass
  geometry.
- The window positions on the front and east walls are hand-curated, and some detected windows may be furniture or curtains. The
  existing windows show the raw scan behind semi-transparent glass.
- The pitch and overhang are assumed values. There is no gablet or AC unit (both visible in the drone photo), and the chimney is a
  plain box.
- The doorway cut leaves some scan fragments, such as curtain pieces above the old window head. The scan's own exterior wall
  surface is not re-meshed.
- In the side case the addition is flush with the north wall, so it is barely distinguishable from outside. The roof simply
  extends, which is correct but undramatic.
- The roof extension rule assumes the house behind the shared wall is deep enough to bury the addition's inner hip end.

## Plugging into editor3d / studio
`build()` in index.html is a pure function of (`scene.json`, addition polygon, shared wall), so it can be lifted into a module.
- In `editor3d.html`, the room-drawing tool would call it with the drawn rectangle. The model frame is the same, so the group can
  sit under the editor's root as is.
- In `studio.html`, the generated group would go into the transparent overlay with the existing model to Showcase transform
  (x, z, -y). Its exterior is only meaningful in dollhouse mode, and the doorway cut would become an occluder hole.
- `scene.json` (openings, measured style, roof parameters) is the reusable "house style" record. `build.py` regenerates it for any
  model that has a plan.json and a MatterPak.
