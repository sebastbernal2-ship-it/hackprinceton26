# Handoff: walk-through + AI scene editing (2026-11-14)

Project: HackPrinceton 2026 (CoStar/Matterport track). The demo model is `Jxmnkp6KpJN`, 141-143 N La Brea Ave, a two-floor restaurant.
Ported from origin/Model-testing (Davd). The scene-agent path was tested only against a fake Gemini server, never the real API.
Run the server with `python run_all.py --only serve`, then open `http://localhost:8000/modeling/walk.html?model=Jxmnkp6KpJN`.

## Done and tested
- **`modeling/walk.html`** (v4) is a first-person walk-through of the MatterPak mesh, built with three.js r170 from `modeling/vendor/`:
  - **Movement:** WASD, mouse look, collision, floor following. The user is happy with the movement: **don't change its tuning.**
  - **Photo view:** stop at a scan spot and the view fades into the real panorama. Each panorama's heading is re-aligned in the browser by edge matching, because the stored headings are 10-180° off for some spots.
  - **Stutter fix:** textures are decoded in workers and uploaded to the GPU in strips; photo alignment runs in a worker. Measured at about 60 fps with no hitches.
  - **Rearranging furniture:** aim at a piece, then E or click to pick it up / place it, wheel or R to turn, X to remove, Ctrl+Z to undo. Edits are saved in localStorage, and the "Export edits.json" button exports them.
    - Pieces come from `segment_furniture.py`, matched back to the mesh by triangle centre.
    - Holes left behind are filled from `empty_room_textured.obj`.
  - **Catalogue (key C):** 32 CC0 Poly Haven models in `assets_catalog/`, downloaded by `modeling/fetch_catalog.py`.
    - Each item is lit by the nearest panorama: PMREM image-based lighting, with an inverse tone map to recover the clipped windows, plus a soft contact shadow.
    - Items collide with the player and persist in localStorage.
- **`modeling/walk_export.py`** packs the mesh, the movable pieces and the hole fill into `assets_<sid>/walk/`. It's the `walk` step in `run_all.py`; `catalog` is a separate step.

## In progress: "Ask AI" (prompt the scene), written but NOT yet tested end-to-end
- **`modeling/scene_agent.py`** (new) is the server side.
  - It defines the system prompt and 11 strict tools: describe_scene, move_object, move_relative, place_next_to, push_against_wall, rotate_object, remove_object, restore_object, list_catalog, add_from_catalog, get_view.
  - **Now uses Gemini (session 3), not Claude.** `handle(body)` makes one REST `generateContent` call (stdlib urllib,
    no SDK). Key: `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) in `.env`. Model: `GEMINI_MODEL`, default `gemini-3.8-flash`.
    `GEMINI_BASE_URL` is for testing.
  - The browser still speaks text / image / tool_use / tool_result blocks. `_to_gemini` / `_from_gemini` translate:
    schemas go to Gemini's OpenAPI subset (`nullable`), tool_results become `functionResponse` parts, and get_view
    screenshots go as `inlineData` after them. Each model turn carries a `gemini_parts` block that the browser echoes back
    so `thoughtSignature`s are replayed exactly.
  - Tested against a fake Gemini server: all request shapes validated, and the full browser loop plus undo works.
    Not yet run against the real API.
- **`run_all.py`**:
  - The serve step now has `do_POST /api/agent`. It requires the header `X-Walk-Agent: 1` and a localhost Origin, so other sites can't spend the key.
  - Env vars `HP_SERVE_PORT` and `HP_NO_BROWSER` are for testing on a second port.
- **`walk.html`**:
  - The section `// ---- AI: ask Claude to rearrange the scene` runs the agent loop in the browser. It POSTs the conversation, runs the `sceneTools` against the scene, and sends `tool_result`s back.
  - Each request includes a numbered screenshot (`snapshot()`) and a text situation summary.
  - A whole request becomes one undo batch (`{batch, label}` in `undoStack`).
  - UI: Enter or `/` opens the `#ai` bar.
  - Keyboard input is ignored while typing (`typing(e)`).
- **Tested end-to-end against a fake Messages API (session 2):** all 11 tools run, bad ids come back as `is_error`
  tool_results, thinking blocks/signatures are echoed back unchanged, catalogue add works, and one Ctrl+Z reverts the
  whole request (moved pieces restored, added item removed). Fixes made while testing:
  - `snapshot()` threw on a zero-size canvas, and since it ran outside the `try` the AI bar stayed locked forever. It now
    returns a text placeholder, and the request is built inside the `try`.
  - `nextFrame()` hung forever in a hidden tab (rAF never fires); it now also resolves after 100 ms.
  - On an API error mid-request, the chat now rolls back to before the request (`pop()` left a dangling tool_use).
  - Pre-existing bug: in `frame()` a comment had swallowed `mode = 'glide'`, so the photo view never started. Fixed.
- **Fit check fixed:** 128 of 185 scanned pieces used to fail the fit check at their own scanned spot, because of scan
  remnants, flush walls and neighbours that sprawl. Now `scanOverlap(pc)` caches the static triangles each piece already
  overlapped where it was scanned and ignores them, and two pieces that are both still at their scanned poses (`atScan`)
  don't block each other. This applies to `checkFit` (manual carry) and `fitDetails` (AI). Result: 0 of 185 fail at
  their scanned spots, 3 m moves are still flagged 61% of the time, and a piece dropped on another is still blocked.
  Some "pieces" are really floor patches about 0.2 m tall (e.g. "Coffee table 1"); these can never collide.
  `window.walk` now also exposes `checkFit`, `fitDetails` and `sceneTools` for debugging.

## Next steps
1. **Credentials:** none are on this machine. The user must add `GEMINI_API_KEY=...` to `.env`, then restart the server.
2. ~~Test without spending money~~ — done (see above).
3. **Test for real** with requests like "move #12 against the left wall", "add two armchairs facing the sofa", "make this a cafe for 8".
4. **Check the coordinate conventions:** added items face `dyaw - 90°` (glTF front +z → -y), and the spawn was fixed to face the user. Scanned pieces have no known front.
5. **Known gaps:**
   - `segment_furniture.py` assumes one floor, so La Brea's upstairs has no movable pieces.
   - Segmentation labels are rough.
   - Catalogue items always sit on the floor.
   - Photo view is paused near edited pieces.
6. Optionally show the AI's moves as animations instead of instant jumps. Optionally add a `run_all` SETTINGS entry for the agent model and effort.

Also see the auto-memory note `hackprinceton-matterport-planner.md`. The pasted design notes behind this feature (option 1, tool calling, plus option 4, the numbered screenshot) are in the conversation that started it.
