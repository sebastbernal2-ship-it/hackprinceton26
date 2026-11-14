# Room-extension prototype: shared brief for all variants

Repo: C:\Users\dmsch\Documents\GitHub\hackprinceton26 (branch expansion-model-testing). Read docs/HANDOFF.md first for context.
Goal: a user places a new room against the outside of the scanned house (Matterport model zvKHR9DHNjJ, a one-storey LA
house, 1 floor) and gets a realistic 3D result:
- EXTERIOR: new outer walls that match the existing exterior (cladding, colour, trim, windows in the same style), a roof
  that EXTENDS THE EXISTING ROOF STYLE (if the house has a pitched/gable/hip roof, the addition's roof must be an
  extension that blends into it at the right pitch, eave height and overhang, with matching material; only a flat roof
  if the house is flat-roofed), and believable ground around the building (lawn/soil/paving, no floating geometry, no
  black void).
- INTERIOR: the new room is interpreted from the patterns in the existing house: ceiling height, wall thickness, floor
  material (e.g. hardwood like the adjacent rooms), wall colour, baseboards/trim, door size and casing, window size
  and sill height, which kind of room makes sense there. The shared wall gets a doorway like the existing doors.

Shared test case and fixed camera views: modeling/expansion/test_case.json (model frame x east, y north, z up, metres).
Data you can use (all local, gitignored):
- pano_zvKHR9DHNjJ/mesh_diff/plan.json: 64 walls (a, b, thickness) + 14 room polygons with labels.
- assets_zvKHR9DHNjJ/tiles/furnished_mesh.{obj,npz,json} + furnished_tex/: MatterPak textured mesh (334k tris, in the
  model frame; npz keys V,F,UV,T,tex). assets_zvKHR9DHNjJ/matterpak/: original OBJ/MTL/46 jpgs, colorplan, ceilingcolorplan.
- assets_zvKHR9DHNjJ/matterport/meshes/001_obj_50k_defurnished_50k.obj (coarse empty house), 000_obj_500k_simple_planes.obj.
- assets_zvKHR9DHNjJ/matterport/panoramas_furnished|panoramas_defurnished (234 each), photos/ (21 incl. exterior-ish),
  floorplans/ (incl. a DXF), hackathon_site/drone/ (13 DJI drone photos of the neighbourhood; the house may be visible),
  hackathon_site/envmap/ (cube map sky).
- pano_zvKHR9DHNjJ/ has pano poses (see texture_bake.py / pano_poses.json / poses_refined.json) if you want to sample
  colours/textures from panoramas.
- The scan is interior only: there is NO roof geometry in the scan. You must infer the existing roof (drone photos,
  footprint shape, typical LA bungalow forms, exterior photos, the Matterport dollhouse/exterior images) and model the
  existing roof as well, so the extension can visibly blend into it. Document how you inferred it.
- modeling/vendor/three.module.min.js (three.js ES module) is available; modeling/editor3d.html and modeling/studio.html show how
  the repo already loads plan/mesh data in three.js. Python has numpy, scipy, pillow, opencv; no trimesh/shapely
  (you may pip install pure-python packages into the user env if really needed, keep it minimal and say so).

RULES
- Work ONLY inside your own folder modeling/expansion/<your_variant>/ (create it). Do not edit any other file in the repo
  (other variants are being built in parallel next to you). Do not git commit, branch or stash.
- Never query Matterport's internal my.matterport.com/api/mp endpoints. Network access may be unavailable; don't rely on it.
- Do not use the Chrome browser extension or the in-app browser pane (other agents share them). Use headless Chrome.
- Deliverable 1: modeling/expansion/<variant>/index.html, a standalone three.js viewer served from the REPO ROOT by a
  static server (relative paths like ../../vendor/three.module.min.js and ../../../pano_zvKHR9DHNjJ/...). Generated
  assets (GLB/JSON/textures) go in your folder. It must show the existing house + the addition + ground, and support
  URL params: ?case=main|side and ?view=aerial|backyard|interior|front|plan (exact cameras from test_case.json:
  model frame -> three.js however you like, but the camera must be equivalent). With ?view set, no UI overlays, and
  set document.title = 'READY' once everything has rendered. Without ?view: orbit controls + a simple UI to switch
  case and view (bonus: let the user drag/resize the addition rectangle and regenerate).
- Deliverable 2: screenshots for case=main, all 5 views, 1600x900: modeling/expansion/<variant>/shots/main_<view>.png,
  plus side_aerial.png. Render with headless Chrome (verified to support WebGL here). Serve the repo root yourself:
  `python -m http.server <YOUR_PORT>` in the background from the repo root (use your assigned port), then e.g.
  "C:/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader
  --window-size=1600,900 --virtual-time-budget=30000 --screenshot=<abs path> "http://localhost:<PORT>/modeling/expansion/<variant>/index.html?case=main&view=aerial"
  (if virtual time is unreliable with big assets, write a tiny CDP/remote-debugging script instead). LOOK at your
  screenshots (Read the PNGs) and iterate until they look as realistic as you can make them. Stop your server at the end.
- Deliverable 3: modeling/expansion/<variant>/NOTES.md: approach, how the roof/exterior/interior style were inferred,
  what looks good, known flaws, how it would plug into editor3d/studio. Keep it short.
- Your final message: 10-15 lines: what you built, file paths, honest self-assessment of realism per view, biggest flaws.
