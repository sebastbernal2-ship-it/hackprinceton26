# d_roofshell: exterior and roof first

Serve the repo root (`python -m http.server 8104`) and open `modeling/expansion/d_roofshell/index.html`. You can add `?case=main|side&view=aerial|backyard|interior|front|plan`.
- To regenerate the data, run `python modeling/expansion/d_roofshell/gen_assets.py`.
- To regenerate the screenshots, run `node modeling/expansion/d_roofshell/render_shots.mjs`. It drives headless Chrome over CDP and waits for the page title to become `READY`.

## Locating the house and reading the envelope
- **Which house it is:** The Matterport thumbnail, drone frame `DJI_..._0001` and frames 525, 600 and 870 of `SPLAT-THUMBNAIL.mp4` all show the same house. It is a white-stucco front-gable California bungalow with an inset porch, a chimney on the left slope, a white picket fence and hedges on the street, and a tall Italian cypress beside it.
- **The street is at +x (east), not -y.** The floor-plan openings settle this:
  - The front door is a gap in the living-room east wall at y -0.5..0.7.
  - The big front window is at the north-east.
  - The scanned porch-floor fragments sit at x 3..4.5.
  - The chimney sits on the living-room south wall. Photo 015 shows a fireplace there with a window on each side. From the street this puts the chimney on the left (south) slope, which matches the drone.

  So the test case's "front" camera (from -y) sees a side elevation in this model. The cameras are kept exactly as specified.
- **Roof:**
  - A single gable over the 17.5 x 11.2 m rectangle, ridge running east-west at z 5.9.
  - Pitch is 6:12. It is estimated from the gable proportions in the drone and splat frames, which suggest 5:12 to 8:12.
  - The roof crosses the wall line at 3.10 m. The ceiling is 2.72 m, measured from the scan.
  - Boxed eaves overhang 0.45 m and the rakes 0.35 m, with white fascia and bargeboards, K-style gutters and downspouts.
  - Light-grey, weathered 3-tab shingles.
  - The rear looks like a gable on the splat frames. A small lower roof at the back south-west corner is not modelled.
- **Windows:** They are taken from the dotted segments of the Matterport floor-plan PNG, not invented.
  - 21 openings are detected, registered to the plan at 99.3 px/m.
  - Sill and head height come from the room behind each opening: bathroom 1.25/2.0, kitchen 1.05, other rooms 0.80/2.15.
  - The style is craftsman 3-over-1 double-hung with flat casings, a head with a drip cap, and sills.
- **Site:**
  - Concrete driveway on the north side; front walk and porch steps.
  - Picket fence and hedge on the street side; wood fence at the rear; foundation planting beds.
  - Cypresses and canopy trees; neighbour massing; a sky gradient whose colours are sampled from `hackathon_site/envmap`.
  - Sun plus hemisphere light and PCF-soft shadows, with a blurred contact-occlusion layer baked into the ground canvas.
  - The side boundaries sit outside the fixed camera positions so the cameras are not blocked.

## The addition
`analyseAddition()` finds the main-house wall the addition shares (`connect_wall`) and builds a gable wing whose ridge runs perpendicular to that wall. Eave height, overhang and pitch are kept the same as the main house, so the eaves continue unbroken.
- **Eave-side tie-in (main case):** The wing's roof planes are extended into the main roof and the depth buffer makes the intersection.
  - The valleys run from the eave corner where the wing meets the main roof up to where the wing ridge meets the main slope.
  - The valleys are drawn as metal flashing.
  - The main fascia and gutter are cut where the wing crosses them.
  - The wing ridge is at 3.98 m, below the main ridge at 5.90 m.
- **Gable-end tie-in (side case):** The wing roof abuts the rear gable wall. Its pitch is lowered automatically so the ridge stays under the main rake soffit; here that comes out at about 4.9:12.
- **Walls and windows:** Matching stucco, foundation band, mulled windows on the gable end and single windows on the sides.
- **Shared wall:** Its windows are infilled. It gets a 0.81 x 2.03 m doorway with a flat casing, a head cap and jamb liners. The scan triangles inside the doorway are removed at load time.
- **Interior of the new room:**
  - Ceiling height matches the scan.
  - Wall, ceiling and baseboard colours, and the tint of the oak strip floor, are sampled from the adjacent bedroom's scan textures (`style.json`).
  - Baseboards, crown moulding and window stools/aprons are added.
  - These materials are mostly self-lit so they sit beside the scan, which carries baked-in lighting.
- **Plan view:** A horizontal section at 2.3 m, with the plan.json walls drawn as solid dark bands and a gap for the new door. The scan is clipped at the same height. Site and trees are not cut.
- **Editing the addition:** In the UI you can edit the addition rectangle (x0 y0 x1 y1). Rebuild regenerates the walls, roof tie-in, door cut, section bands and site.

## Known flaws
- **Interior is the weakest view.** The lighting is flat (no ambient occlusion or bounce). The floor reads darker and redder than the honey oak in the photos, because the scan textures are underexposed and the colour sampling inherits that. The view through the door shows the furnished scan with its usual artefacts.
- **Existing house:**
  - The porch, the bay on the north-east front, the chimney position and the 6:12 pitch are inferred, not measured.
  - The rear south-west lower roof is missing.
  - Room 9 (the enclosed strip at the south) is modelled as part of the main volume.
- **Windows:** Seen from outside, the windows show the scan's interior through 74 %-opaque glass. That is plausible but noisy in places.
- **Neighbours and trees** are deliberately simple massing and blob trees.
- **The site was enlarged to suit the cameras.** The side yards are much wider than the real lot, and the north driveway the drone shows partly overlaps the "main" addition location.
- **Roof generality:**
  - The roof logic assumes a rectangular, gable-roofed main volume and rectangular additions on one wall.
  - L-shaped additions and hip roofs (straight skeleton) are not implemented.
  - Valleys come from the depth buffer rather than an exact roof-polygon clip.

## Plugging into editor3d / studio
`house.js` exports `buildHouse(materials, style, plan, addition)` and `analyseAddition()`. `site.js` exports `buildSite()` and `neighbours()`. All of them return plain three.js groups in the model frame (z up).
- **studio:** Add the group to the overlay scene, which already converts the model frame to Showcase (x, z, -y).
- **editor3d:** Call `buildHouse` with the user's drawn rectangle and its plan.json, and reuse `cutScan()` to open the doorway.
- **Roof inference:** `H` and `FOOT` (the envelope parameters) are the only house-specific inputs. A future step can infer them from plan.json plus drone or aerial imagery.
