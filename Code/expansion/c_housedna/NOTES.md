# c_housedna: style inference first ("house DNA")

**Pipeline.** `analyse_house.py` measures the scan and writes `house_dna.json` (about 60 s). `dna_rules.js` turns the DNA
plus an addition rectangle into a spec. Every decision carries a sentence of evidence, and the viewer's panel shows
them. `build.js` and `index.html` build the geometry in three.js, using the model frame directly (z up).
To re-run: `python analyse_house.py`, then serve the repo root and open `index.html`. `shoot.py` renders the shots.

## What is measured (house_dna.json)
- **Wall elevations.** For each of the 64 plan walls, the textured MatterPak mesh is sampled with a dense barycentric
  lattice and true per-sample UV lookup. This gives a 5 cm depth and colour elevation per wall (`debug/openings*.png`).
- **Doors.** Doors are column gaps in the wall band that have a header above them: 18 found. Clear width is 0.65 m
  (13 of 18), the head is 2.00 m (14 of 18), casing is 0.145 m (16), and the corner offset is 0.24 m (11 of 18 doors
  sit within 0.45 m of a corner). Closed doors cannot be seen by the gap test.
- **Windows.** A window is a daylight-bright, non-paint vertical run with a sill and a head; the paint colour is
  taken from the 2.0–2.4 m frieze band. 18 found. Sill is 0.80 m (9), head is 2.05 m (8), and the modal unit is
  0.75 m (9). Glazing is about 22 % of floor area (median over rooms). Widths are noisy (curtains, mulled pairs).
- **Rooms.** Ceiling heights come from down-facing triangles (2.70 m, 12 of 14 rooms within ±3 cm). Floor
  colour and material are classified from hue statistics (hardwood vs tile). Wall paint is the frieze colour,
  white-balanced with each room's ceiling as the white reference: Bedroom 6 comes out ochre `#dcb970` and Bedroom 5
  sage, which matches the photos. Baseboard height (0.17 m), crown or cove depth, and the trim colour are also measured.
- **Walls and levels.** Wall thickness is the length-weighted mode: 0.16 m for exterior walls, 0.10 m for interior
  walls. Grade is z = −0.43, from scan fragments outside the walls, so the house sits on a raised floor. The fireplace
  (living-room south wall, a dark firebox) sets where the chimney goes.
- **Assets.** A hardwood texture is baked top-down (per-triangle affine rasterisation) from the cleanest 1.2 m patch
  of each bedroom floor and made tileable. The shingle texture is cropped from drone photo `_0830`; it is rotated
  automatically so the courses run horizontally.

## Roof and exterior inference (evidence in `evidence/`)
- **Roof form.** The drone photos `_0830` and `_0070` show this house: a dark-grey composition-shingle **hip** roof
  with a cross-hip toward the street, a white fascia with gutters, pale blue-grey lap siding, white casings, and a
  painted chimney on the street side. This is consistent with the scan's fireplace position.
- **Assumptions.** Pitch is assumed to be 5:12, because it cannot be measured from near-vertical photos. Overhang is
  0.45 m (gutter line relative to the siding). Eave height is the ceiling plus 0.22 m.
- **Existing roof.** It is modelled as a greedy rectangle cover of the closed footprint (3 rectangles). Each
  rectangle is a hip solid at the same pitch and eave, so the rendered union gives correct hips and valleys. The
  addition is one more hip solid, run 1.8 m into the main roof. Fascia and gutters are clipped wherever they fall
  inside another solid.
- **Shell.** The scan is interior-only, so a siding shell is built on the outer face of the envelope. It has a
  foundation band with vents, corner boards, and the measured windows placed on it. The scan mesh is clipped to stay
  inside this shell.

## Rules that build the room
- **Room type.** From the neighbour and size: 14 m² ≥ 85 % of the smallest bedroom, reached through a bedroom, so
  it becomes a bedroom.
- **Ceiling, finishes and trim.** Ceiling height, floor texture and board direction, paint, trim, baseboard and cove
  are all copied from the neighbour room or from the house modes.
- **Doorway.** The house's modal door size, placed at the measured corner offset. It goes at the end of the shared
  wall nearest the neighbour room's existing doors. The scan wall is cut there, and the doorway gets jambs, casings
  on both faces, and a 5-panel leaf.
- **Windows.** The count is the house glazing ratio × area ÷ unit area, which gives 3. Two flank the far wall at the
  measured corner offset; one goes on the most open side wall, with ties going to the back yard. They are
  double-hung, 3-over-1, with craftsman casing, stool and apron.

## What looks good / known flaws
- **Good.** The interior: real oak from the next room, the measured paint colour, trim proportions, a doorway that
  shows the real scanned bedroom, light through real openings. Also the plan cut (the scan dollhouse with measured
  doors and windows in the poché), and the roof tie-in, which reads as one hip roof.
- **Flaws in the geometry.**
  - The ridge of the existing roof is simplified: a rectangle cover, not the real cross-hips.
  - The pitch is assumed, not measured.
  - Existing windows on the shell are only those the detector found; the porch pair is filled by rule.
  - Window widths from the detector are noisy.
- **Flaws in the rendering and data.**
  - The ground and site (lawn, neighbours, trees) are generic, procedural and low detail.
  - Glass has no interior reflections.
  - The house's mesh lighting is baked, while the new room is lit live.
  - `assets/` holds about 20 MB of generated data: mesh buffers and 1024 px texture copies.

## Plugging into editor3d / studio
`house_dna.json` is standalone: compute it once per scan. `dna_rules.makeSpec(dna, {polygon, connect_wall,
connect_to_room_label})` is pure JS and can sit behind a "draw a new room" tool in `editor3d.html`. The viewer
already regenerates live while you drag or resize the rectangle. `build.js` builds the geometry. In studio,
the same group can be added to the overlay scene with the Showcase transform (x, z, −y).

## Merged from A/B/D (consolidation pass)
- **Roof tone (from A).** The drone-crop shingle texture is kept but tinted `#b8ab9f` with low env reflection, so the
  roof renders as neutral charcoal (aerial roof pixels ≈ 78/81/86, the same as A's) instead of light blue-grey.
  New roof details read off drone `_0830`: a Dutch **gablet** with white rake trim at the west end of the main ridge
  (the white "V"), a **rooftop AC condenser** on a levelling curb on the south slope, and five plumbing vents
  (`roofDetails()` in `index.html`).
- **Controls (from A).** Live Depth / Width / Offset sliders and an orange ground handle beyond the far wall. They are
  merged with C's "drag addition" tool (slide along the wall; shift-drag for depth). All three edit one parametric
  model `{a, d, n, width, depth, offset}` (`initParams`/`applyParams`). The offset is clamped to the house edge the
  room is attached to, the neighbour room is re-detected, and the rule engine re-runs, so the room type, finishes and
  rules panel update live. With `?view` there is no UI, no handle, and the test-case polygon is used verbatim; the title
  still goes to READY.
- **Interior (from B).** The inside of each new window is B's rectified photo of the real bedroom window (Matterport
  photo 020: casing, stool, iron rod, curtains, daylight). It is re-keyed (`assets/interior/window_int_c.png`) so B's
  beige wall becomes transparent and C's measured paint shows around the curtains. The photo is scaled to C's measured
  window unit (0.75 × 1.25 m) and cropped at the corners and between neighbouring windows. The exterior keeps C's
  craftsman window geometry. Baseboards and crown use B's scan strips, neutralised to greyscale and tinted with the
  measured trim colour (`baseboard_c.jpg`, `crown_c.jpg`). The paint, oak floor and rules panel are unchanged. B's
  `door_casing.png` is not used, because C has a real cut doorway with 3D casings through which you see the scan.
- **Site (from D).** `site.js` ports D's painted-ground canvas with its grass/concrete detail shader, curbs, gutter pans,
  parkway strips, both sidewalks, the neighbour massing grid with instanced canopy trees, textured hedges and shrubs,
  and the cypress (D's texture helpers are copied to `site_tex.js`). It is re-dressed for this LA block:
  - **Layout.** The street is south and the driveway east, as in the test case and the drone photo.
  - **Planting.** New procedural fan palms (pleated fans, dead-frond skirt) along the parkway, in the yards and as an
    instanced palm skyline. Lush front beds, big-leaf tropicals and a cypress screen by the driveway.
  - **Neighbours.** Muted stucco and siding neighbours with dark shingle or clay-tile hip roofs. D's white stucco and
    white roofs are not used.
- **Plan view override.** The test case's plan camera (centre [-5, 1.5], 26 m wide, so 14.6 m tall at 16:9) cuts off the
  north end of the main addition (y to 8.9 m plus the wall). `test_case.json` is NOT edited. Instead `setView('plan')` in
  this viewer keeps the x centre and the minimum 26 m width, re-centres y on the house plus addition extents
  (+0.9 m margin), and widens the frame until the height fits. For `main` that gives centre y ≈ 2.0 and a width of
  about 28 m.
- **Doorway fragments (item 6).** Checked with `?pick`. The only artefact still visible through the new doorway is the
  smeared north end panel of the bedroom's bookcase. It is real furniture, not a loose fragment, so it was left in place.

Screenshots from before this pass are in `shots_before/`.
