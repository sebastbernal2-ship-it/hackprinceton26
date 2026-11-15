# Walkthrough viewer

A self-contained Vite + TypeScript app that lets a person walk a scanned space and see **finding pins**: candidate
repair / maintenance / layout issues the model flagged, each saying what an on-site inspector must verify.
Walking, collision, splat loading, the WebXR path and the reality-check tint are ported from the owner's own
Deja-View viewer (`web/src/viewer`); the findings layer is new.

## Run

```
cd walkthrough
npm install
npm run dev        # http://127.0.0.1:5173/   -> built-in DEMO room, no downloads
npm run build      # typecheck + production build into dist/
npm test           # findings parser and wording tests
```

Query string: `?scene=<url>&findings=<url>`

| param | meaning |
| --- | --- |
| `scene` | `.glb` `.gltf` `.obj` (mesh, e.g. Matterport-derived) or `.ply` `.spz` `.splat` `.ksplat` `.sog` (splat). Omit or `demo` for the DEMO room. |
| `findings` | a JSON file: `{"findings":[...]}` or a bare list of `DefectFinding` (`../contracts/defect-finding.schema.json`) plus optional `anchor {x,y,z}` (room metres, floor at y = 0) and optional `surfaceStatus` (`captured` / `inferred`). |
| `imagined` | splat scenes only: a second splat file holding the inferred part, washed violet. |
| `floorY`, `scale`, `flip=1` | override the floor height, scale the scene, or flip a y-down splat file. |

Scene and findings URLs must allow CORS from the page origin (or be same-origin, e.g. in `public/`).

## What it does

- Desktop: pointer-lock mouse look, WASD, Shift to run, F to fly, R to reset, L to toggle the list. Touch: left half walks, right half looks.
- Collision: meshes through `three-mesh-bvh`; splats through the voxel collider ported from Deja-View.
- WebXR (Enter VR appears only when the browser reports `immersive-vr`): left stick walks with collision, right stick snap-turns, push the right stick forward-back to aim a teleport arc, right trigger picks a pin and its card appears next to it.
- Pins are billboards coloured by severity. Clicking one (or its list entry) shows title, description, `modelConfidence`, evidence source and reference, whether imagery can confirm it, **what the inspector must verify**, and linked cost line ids.
- Findings without an `anchor` are listed but not pinned. Invalid findings are rejected and named, never repaired.

## Honest wording

- Every card starts "Candidate finding from the model, not a confirmed defect."
- `modelConfidence` is shown as the model's own stated confidence, not a probability.
- Cost amounts are never computed here; only the linked cost line ids are shown.
- Findings may come only from captured surfaces. A pin on a surface marked inferred gets a dashed violet pin and a card warning that it is not evidence. A pin whose surface status cannot be determined shows `?` and says so. In mesh scenes a pin more than 0.6 m from any scanned surface is flagged as unverified placement.
- Inferred surfaces in a mesh: glTF node `extras.captured = false`, or a node name containing `inferred` / `imagined`. In a splat scene they come from the separate `imagined` file; the viewer cannot measure it, so only the finding's own `surfaceStatus` marks a splat pin inferred.

## Real vs demo

Real: the loaders, collision, pins, finding parser and card text, reality tint, desktop walking (all exercised in a browser).
Demo: the built-in room is a box room generated in code, its annex is flagged inferred on purpose, and its six findings are synthetic and titled `[DEMO]`. The banner "DEMO: synthetic room and findings" shows whenever the demo scene or a findings file labelled DEMO/SYNTHETIC is loaded.
Not verified: the WebXR path has been type-checked but not run on a headset or emulator. Matterport meshes and real splat captures have not been loaded here.

`tools/make-test-splat.mjs <dir>` writes a synthetic splat version of the demo room (`room.ply`, `annex.ply`, `findings.json`) to try the splat path; the files are gitignored (`public/_test/`).

## Not ported (on purpose)

Avatars, video layer, voice guide, social ghosts and ping-pong, camera-room repair, generated-world areas, sky and palette, wrist menu and transport panels, server and storage code.
