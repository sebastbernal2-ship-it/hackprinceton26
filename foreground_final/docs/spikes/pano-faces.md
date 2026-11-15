# Matterport pano cube-face order

`panoLocations{ skybox(resolution:"2k"){ children } }` returns 6 signed JPEG URLs (2048 px). Index N is saved as `fN.jpg`
by `scripts/prep_panos.py` (resized to <=1024 px, <=180 KB). Verified by viewing a contact sheet of one pano (site 862130):

| index | content |
|-------|---------|
| f0 | UP: ceiling (tiles, exit sign, downlights) |
| f1 | side face 1 |
| f2 | side face 2 |
| f3 | side face 3 |
| f4 | side face 4 |
| f5 | DOWN: floor (tiles, tripod patch blurred by Matterport) |

f1..f4 are the horizontal ring (consecutive faces are adjacent walls, seen in the sheet as door -> room -> corridor -> wall).
Which compass direction f1 faces is relative to the pano `rotation` quaternion (stored per pano); the exact cube-map
axis mapping for a viewer (e.g. three.js CubeTexture px/nx/py/ny/pz/nz) was NOT pinned down here and must be checked
against seams when wiring the viewer.

Files: `public/sites/<id>/pano/<panoId>/f0..f5.jpg` (default, furnished) and `.../empty/f0..f5.jpg` (defurnished view).
