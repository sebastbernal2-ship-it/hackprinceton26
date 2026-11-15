# Deal flow plan: from "what are you opening" to a signed-ready offer

Laptop only (1440x900 primary, 1280x800 must fit, nothing below 1180 is designed). Builds on `docs/design-v2.md`
("After hours": tokens, glass, Bricolage, `components/flow/motion.ts`). This file adds chapters; it changes no token.
Mode: Operate with one Experience moment at each end (intro, finale). One bone pill per screen, always "the next step".

## 0. Principles for every phase

- **Nothing shown as a result is typed into the code.** Every number, sentence about a site, and list row comes from
  `data/sites/*`, `lib/engine`, `lib/layout`, `lib/feasibility`, `lib/ml`, `lib/outputs`, or a live model call, and
  carries a `source` line (mono 11px). If a path fails, show the failure and a Retry; never substitute.
- **Live is the default.** Recorded runs only with `?replay=1` in the URL, and then a persistent "Recorded run" chip.
- **The owner's plan is one object.** `Layout` (lib/layout) + brief live in flow state; Walk, Room, Numbers and Deal all
  read the same layout, so a moved table changes the seat count, the cost, the outlook, the asks and the offer email.
- Motion: springs from `motion.ts` (`SPRING.ui` bounce 0; bounce only after a drag release), animate transform /
  opacity / filter / clip-path / pathLength only, everything interruptible, exits 0.7x, `reducedMotion="user"`.

## 1. Navigation model

Before a space is chosen nothing changes: Ask, Clarify, Search, Pick stay a centered conversation (720 column).
Once a space is chosen the screen is three fixed regions (CSS grid on `main.flow`):

| Region | 1440x900 | 1280x800 | What |
|---|---|---|---|
| Chapter rail (left) | 88 wide, inset 16 | 72 wide, inset 12 | glass, radius 28; 6 chapters, numeral + label (`label`) |
| Stage (center) | 920 free | 776 free | the chapter's canvas: pano, bento, plan, documents |
| Guide (right) | 400, inset 16 | 360, inset 12 | the existing chat panel (`glass-heavy`), composer docked |

Chapters, in order: **1 Overview, 2 Walk, 3 Layout, 4 Room, 5 Numbers, 6 Deal.** State: `chapter` in `FlowState`
(new field; `phase` keeps describing the pre-pick steps and becomes `"walk"` for all chapters to limit churn).
- All six are clickable as soon as a space is chosen (agency); the rail shows visited (bone dot), current (`live`
  bar, `layoutId="rail-cursor"`, slides between items), and not yet visited (`text-3`). Keys `1`-`6` and `[` `]`.
- The Guide is the same thread in every chapter. Each chapter appends at most one intro message (built from data)
  and the composer's meaning follows the chapter: Overview / Numbers / Deal = a grounded question (`/api/ask`, P2),
  Walk and Room = "change this room" (imagine-pano), Layout = a plan instruction (`/api/layout`). The placeholder
  text states it. Chapter changes never clear the thread; a thin divider row ("Layout") marks them.
- The bone pill lives at the bottom of the Guide, above the composer, and is always the next chapter
  ("Walk the space", "Lay it out", "See it in the room", "Run the numbers", "Close the deal").
- Stage transitions between chapters: the pano canvas never unmounts (it is the ground of Walk, Room and the dim
  backdrop of the rest: `spaceDim`, scrim 0.7, blur 12). Chapter content cross-fades over it: exit `opacity 0,
  scale 0.985` 0.2s, enter `opacity 1, y 12 -> 0` `SPRING.ui`, children stagger 0.06 (cap 0.36).
- Back arrow in the stage header returns to the three picks (existing `back`); "Foreground" resets (existing).
- Rail enters once, with the Guide: x -24 -> 0, blur 8 -> 0, materializing (blur + scale together), not a fade.

## 2. The arc, screen by screen

**2.0 Intro (2.8 s, any key / click / wheel skips, plays once per tab via `sessionStorage`, skipped under reduced
motion).** Idea: the name. Real spaces come to the foreground. Sequence on `stage` ground:
0.0-1.2 s the six backdrop scan photos (already loaded by `app/page.tsx`) fly toward the viewer one after another
on a perspective parent (`translateZ -900 -> 0`, opacity 0 -> 1 -> 0, 180 ms apart, slight motion blur 6px -> 0),
the last one stays and becomes the Ask backdrop; 0.6-1.8 s the wordmark "Foreground" set at `display-xl` x 1.6
reveals by clip-path left to right; 1.6-2.2 s a mono line counts up from live data: "{sites.length} spaces,
{scans} 3D scans, {tenants} past tenants read" (numbers passed as props from `page.tsx`, never literals);
2.2-2.8 s the wordmark shrinks into the header mark (`layoutId="wordmark"`) while the Ask headline words rise
(existing word stagger). Skip = jump every value to its end state in 150 ms. No sound.

**2.1 Ask / Clarify / Search / Pick (existing, three fixes).** Example chips are built from the loaded sites'
real cities and a concept each (see audit 7). Clarify gains a concept question when the regex could not read one.
Pick cards must fit the fold: at 900 high the thread above collapses to the one-line search headline and cards
are `min(476, 100vh - 380)` tall (today the card bottoms are cut at 1440x900).

**2.2 Overview (chapter 1): the whole site on one screen.** Choosing a card morphs its photo into the stage
(existing `space-media-*`), which dims; a bento of seven glass tiles deals in (stagger 0.06, figures count up
0.9 s). 1440: 3 columns x 2 rows + a full-width strip; 1280: same grid, tiles 242 wide, strip scrolls nothing.
1. **From above**: Vexcel ortho (`site.aerial.orthoPath`), detection polygons draw in (`pathLength`, `live`), chips
   for `parkingSpaces`, `patioCandidateSf`, `captureDate`; hover swaps to the oblique.
2. **The scan**: first walkable pano as a slow auto-pan thumbnail, room count, `matterport.areaSf`,
   "exact suite" or "same building" from `scanOfExactSuite`. Click = Walk.
3. **The floor**: mini plan from `autoLayout(site, brief)` (rooms, zones, seats drawn). Click = Layout.
4. **The money**: all-in range (`analysis.xray.total`) against budget as a bar, the three largest x-ray lines with
   tone + words. Click = Numbers.
5. **The rent**: asking vs fair band (`rentFor`), gap per year, band word; "basis uncertain" shown when flagged.
6. **Who was here**: tenant lifeline from `site.tenantHistory` (bars by years, food tenants in tone, same-suite
   marked), `analysis.graveyard.summary`.
7. **The block** (strip): `analysis.trend` rating + survival model band and top 3 factors (`lib/ml/survival`),
   weeks to open (`analysis.timeToOpen`).
Guide intro message: one paragraph assembled from the same payload (verdict, biggest cost, biggest unknown).
Every tile has a `source` line and is a button to its chapter (lifts 2px, 100 ms press scale 0.97).

**2.3 Walk (chapter 2, existing).** Unchanged except: the view yaws to face the finding's `position` on arrival
(today stop 1 opens on a blank wall), padded stops lose their fixed sentence (audit 10), and Imagine results show
their checks and cost delta (audit 8).

**2.4 Layout (chapter 3): make it yours.** Stage = the plan, large, on `stage-2` with a 0.25 m dot grid
(reuse `components/studio/plan.tsx`, re-skinned to v2 tokens). Left edge of the stage: a vertical palette of
item chips (two-top, four-top, six-top, booth, bar counter, bar stool, cook line, prep, service counter, host,
patio table) each showing its seats. Top right: undo, redo, reset to suggested, tilt (2D / isometric).
- Direct manipulation: drag a chip onto the plan to add; drag an item to move (pointer capture, grab offset
  kept, snaps to `GRID_M` on release with `SPRING.drag`); `R` rotates; Delete or drag back to the palette removes.
  Collisions / out of bounds / blocked egress from `validate()` outline the items in `needed` with the message
  in words under the plan; an invalid drop springs back.
- Typed changes: the Guide composer posts `{siteId, layout, instruction, brief}` to `/api/layout`; returned ops
  run through `applyOps`, items fly to their new spots (existing `flight`), and the explanation is appended as an
  assistant message with its source ("Claude" or "Offline parser").
- Live impact bar (bottom of stage, glass, 72 high, 5 figures, `Rolling` digits): **Seats** (drawn / used by the
  model, "capped" chip when different), **All-in** (range, tone vs budget), **Break-even** (covers a day +
  verdict word), **Year-3 base profit**, **Layout extras** (`layoutCosts` total). Each shows a delta chip against
  the suggested layout for 2.5 s after a change. Computed client-side with `layoutImpact(site, brief, layout)`,
  debounced 120 ms while dragging, immediate on drop.
- Checks drawer (Guide, collapsible card "What this triggers"): `assess({site, brief, changes, layout,
  layoutOps: opLog})`, where `changes` is one synthesized `Change` of kind `layout` per committed edit group
  (`involves` from the item groups touched: seating, grease-cooking for a moved cook line, restroom, alcohol for
  a bar, patio; quantities from the diff). Rows: status word, cost range, citation, permit steps, weeks.
  New / changed rows flash `live-wash` once. Pure, runs in the browser on every committed change.

**2.5 Room (chapter 4): see that it fits.** The pano returns to full brightness with the owner's layout standing
in it as real-scale 3D furniture; a 300x220 glass mini-plan sits bottom-left with a view cone for where you
stand and look. Dragging an item on the mini-plan moves the furniture in the room in the same frame (the proof).
- **Technique (decided): meshes inside our own `PanoEngine` scene, on the de-furnished skybox.** The engine
  already puts the camera at each pano's scanned position inside a cube, in scan metres. Layout items are in the
  same metric frame (`footprintFor` / `scanFrame` -> `fromPlan`), and `lib/three-d/layout-map.ts` already maps
  item -> GLB (`public/models/*.glb`), scale and footprint. So a four-top is 1.5 m wide where it would stand, with
  correct perspective from every pano, instantly, at no model cost, and it updates while editing. That is the
  honest claim "this fits": geometry, not a picture. Use `skyboxEmpty` when the pano has it (8 of 12 sites),
  otherwise the furnished scan with a note.
- **Known limit, handled:** cube faces have no depth, so walls do not occlude. Draw only items whose centre is in
  the same room polygon as the current pano (or within line of sight by a 2D segment test against room edges),
  fade items nearer than 0.6 m, add a soft contact-shadow disc under each, hemisphere + one directional light.
  Label on stage: "Furniture at true size, placed from your plan. Walls and finishes are the real scan."
- **Second layer, on request only:** "Render this view" sends imagine-pano for the faced wall with an instruction
  built by `describeLayout` + the items in view, `changeSpec` from the plan. Labelled "AI render, illustrative";
  hold-to-compare stays. It sells the mood; the meshes carry the proof. Never automatic (cost, latency 20-60 s).
- Rejected: the Matterport Web Component (`components/workspace/walk-scene.ts`) has true occlusion but a 10-30 s
  boot, its own chrome and a second viewer to keep in sync; not worth it before 8 AM. Kept as "Open full scan".
- Bone pill: "Run the numbers". Secondary: "Edit layout" (returns to chapter 3 with the same selection).

**2.6 Numbers (chapter 5).** Stage: the three-scenario chart drawn large (`pathLength` 1.2 s, base in `live`),
fed by `layoutImpact(...).scenarios` so it reflects the edited plan; beside it break-even dial, rent band, and
"Will it fill?": a 12 s play of `simulateDay(layout, {covers, concept})` on the mini-plan (guests seat, queue,
walk) with served / walked counters. Risks list from `buildOutlook` (already data-built). Guide: the `read`.

**2.7 Deal (chapter 6): the close.** Stage becomes a table with three documents dealt left to right (stagger
0.12, slight rotate -1.5 / 0 / 1.5 deg settling to 0):
1. **Your asks** (`buildAskList(site, analysis)`): rows by priority with dollar value, each checkable; unchecking
   one removes it from the letter.
2. **The offer letter**: `/api/offer` with brief + plan seats + checked asks; streams in at `STREAM_CPS`; editable
   text; source chip ("Claude" or "Template from your asks").
3. **The deal memo** (`buildMemo`): one-page preview, opens `/site/[id]/offer?concept=&seats=&budget=` to print.
Under them, **Next steps**: a timeline from `analysis.timeToOpen` phases + permit steps from the last `assess`.
One bone pill: "Copy the offer". On press: the letter folds into a summary seal line built from state
("{address} - {seats} seats - all-in {range} - open in ~{weeks} weeks"), the scrim lifts, and the stage glides to
the storefront pano with the owner's furniture in place on a slow auto-pan; headline `display`: "Your offer is
ready." Secondary pills: Open in mail (`mailto:` with the body), Print memo, Start another search. No confetti.

## 3. "No hardcoded results" audit

Grepped `components/flow/**`, `app/flow-actions.ts`, `app/page.tsx`, the routes and libs the flow calls. Engine
benchmarks (`data/benchmarks.json`) are sourced assumptions and stay, shown with their source. To fix:

| # | Where | What is canned | Fix |
|---|---|---|---|
| 1 | `components/flow/use-search.ts:32-34` | live failure silently switches to the recorded replay; `findClosestReplay` (`app/api/agent/route.ts:45`) then plays the nearest recorded brief, so picks can belong to another query | delete the auto fallback: on error show the error + Retry in `searchProgress`. Replay only when `?replay=1` |
| 2 | `app/api/agent/route.ts:40` | `FOREGROUND_REPLAY=1` env turns replay on for everyone | ignore the env outside tests; in replay mode return the recorded query and show a "Recorded run: {query}" chip |
| 3 | `components/flow/flow-reducer.ts:153-158` | fixed reply "I can't take follow-ups here yet" | route free text by chapter (section 1); questions go to `/api/ask` (grounded on the site analysis JSON; on failure say it failed) |
| 4 | `components/flow/brief-flow.ts:14` + `flow-reducer.ts:150` | an unreadable answer becomes 40 seats / $250k | re-ask once with the chips; never assume a number |
| 5 | `lib/agent/brief.ts:92`, `components/flow/use-walk.ts:21`, `components/flow/messages/offer-cta.tsx:21` | concept silently defaults to `fast-casual` | add a `concept` clarify question (the message type already allows it); brief is non-null past Pick; remove both defaults |
| 6 | `components/flow/outlook-data.ts:77` -> `app/site/[id]/offer/page.tsx:44-47` | memo link carries no brief, so the memo is computed for `DEFAULT_BRIEF` (fast-casual, 40 seats, $250k; `lib/engine/types.ts:21`) | build `memoHref` with `concept`, `seats` (plan seats), `budget` |
| 7 | `app/api/layout/route.ts:166` | op context uses `DEFAULT_BRIEF` seats and budget | accept `brief` in the body and use it |
| 8 | `components/flow/flow.tsx:28`, `:111`, `:152` | fixed example briefs (cities may have no spaces), Details link defaults to example 1, fixed chip "Paint the walls deep green" | examples from `page.tsx`, one per city present in `data/sites`; hide Details until there is a query; chips from the current stop's x-ray line, or none |
| 9 | `components/flow/use-walk.ts:177` + `messages/imagine-result.tsx:45` | Imagine result is always `tone: "info"` and `costDeltaUsd` is never set: a change shows no checks or cost | run the `/api/imagine` planner + `assess` + numbers for the same instruction (events `plan`, `checks`, `numbers`); fill tone, cost delta, check rows |
| 10 | `lib/immersive/tour.ts:157` | padded stops say a fixed sentence ("Nothing was flagged ... the layout and the light") | build the line from the room (label, area from polygon, panos in it) or drop padded stops |
| 11 | `components/flow/search-map.ts:41`, `:48`; `use-search.ts:53` | fixed reasons "Not shortlisted." / "Rejected after a closer look."; fixed advice "A bigger budget or a different neighborhood would change that." | no reason when the agent gave none; build the no-fit line from the rejections' engine numbers (cheapest all-in vs budget) |
| 12 | `app/api/offer/route.ts:64` + `offer-cta.tsx:38-40`; `app/api/layout/route.ts:180-190` | template email / offline parser answer shown as if the model produced it | keep both (built from real asks / real ops) but show `source` in the UI |
| 13 | `components/flow/outlook-data.ts:25` | outlook seats come from the brief, not the plan | compute from `layoutImpact` once a layout exists |
| 14 | `components/flow/messages/placeholder.tsx` | placeholder renderer for unbuilt message kinds | delete; an unknown kind fails the type check |
| 15 | `components/flow/use-walk.ts:201` | "Saved from an earlier run." on cached imagine faces | keep the disk cache (real earlier output) and name the instruction it was made for |

Acceptance: `grep -rn "DEFAULT_BRIEF\|ASSUMED" components/flow app/api/layout app/flow-actions.ts` is empty; with no
`?replay=1`, `/api/agent` answers `X-Foreground-Mode: live`, and a failed live run shows an error, not picks.

## 4. Phases (sequential; each leaves `/` working end to end)

**Shared state (P1 lays it down).** `FlowState` gains `chapter`, `layout: Layout | null`, `opLog: Op[]` and an undo
history. One server action `getDeal(siteId, brief)` in `app/flow-actions.ts` returns the full `Site` JSON (about
35 KB), `autoLayout(site, brief)` and the walk tour. A `DealContext` provides `{site, brief, layout, impact,
assessment}` where `impact = layoutImpact(...)` and `assessment = assess(...)` are `useMemo` over the layout (both
pure and browser-safe). Every chapter reads this context; nothing refetches numbers.

### P1. Shell, intro, truth
- Create: `components/flow/intro.tsx`, `chapter-rail.tsx`, `deal-context.tsx`, `components/flow/chapters/` (one file
  per chapter; `walk.tsx` wraps what `flow.tsx` does today; the others render a titled empty state naming the data
  they will show, with the next-step pill working).
- Modify: `flow.tsx` (grid, rail, chapter switch, composer routing), `flow-reducer.ts` + `types.ts` (chapter,
  layout, concept clarify, no canned reply, no assumed numbers), `use-search.ts`, `app/api/agent/route.ts`,
  `brief-flow.ts`, `lib/agent/brief.ts`, `outlook-data.ts`, `app/api/layout/route.ts`, `tour.ts`, `search-map.ts`,
  `app/page.tsx` (intro counts, examples from data), `stage.tsx` (insets for the rail; yaw to the finding).
- Data: existing only. Audit rows 1-8, 10-12, 14, 15.
- Accept: intro plays once, skips on any input, under 3 s; six chapters navigable by click and keys with the cursor
  sliding; Walk, Imagine, Outlook and Offer still work inside chapters 2, 5, 6; pick cards fully visible at
  1440x900 and 1280x800; cutting the network during search shows an error + Retry, never a replay; vitest green.
- Browser: `/` at both sizes; `/?replay=1` shows the "Recorded run" chip; reduced motion (no intro, fades only).

### P2. Overview and the close
- Create: `chapters/overview.tsx` + `components/flow/overview/{aerial,scan,floor,money,rent,history,block}-tile.tsx`;
  `chapters/numbers.tsx` (chart moves from the thread to the stage); `chapters/deal.tsx` +
  `components/flow/deal/{asks,letter,memo-preview,next-steps,finale}.tsx`; `app/api/ask/route.ts`.
- Modify: `app/api/offer/route.ts` (accept plan `seats` and `askIds`; stream the text), `outlook-data.ts`.
- Data: `site.aerial`, `site.tenantHistory`, `analyzeSite`, `rentFor`, `lib/ml/survival`, `buildAskList`,
  `buildMemo`, `timeToOpen`, `/api/offer`. Port geometry from `components/site/aerial.tsx`, `lifeline.tsx`,
  `block-trend.tsx` (old light skin) and restyle to v2 tokens.
- Accept: seven tiles for each of the 12 sites with no empty tile (a missing datum reads "Not in the data" in
  `maybe`, never a number); unchecking an ask changes the letter; the memo opens with the owner's concept, seats
  and budget; the finale plays and "Copy the offer" puts the letter on the clipboard.
- Browser: two different sites must differ in every tile; 1280x800 has no clipped tile; a question typed in
  Overview is answered from the site's data or fails visibly.

### P3. Layout editor with live consequences
- Create: `chapters/layout.tsx`, `components/flow/layout/{plan-canvas,palette,impact-bar,checks-card}.tsx`
  (plan-canvas adapts `components/studio/plan.tsx`: keep geometry, drag, flight and sim layers; v2 colors; add
  palette drop and delete), `components/flow/use-layout.ts` (history, ops, `/api/layout` call).
- Modify: composer routing for chapter 3; Numbers and Deal read `impact` (audit 13); Imagine checks (audit 9).
- Data: `autoLayout`, `applyOps`, `validate`, `layoutImpact`, `layoutCosts`, `assess`, `simulateDay`, `/api/layout`.
- Accept: add, move, rotate, remove by pointer and by text; seats, all-in, break-even, year-3 profit and checks
  update within one frame of a drop, and after the model round trip for text (spinner in the composer, plan stays
  interactive); undo / redo 50 steps; invalid drops spring back with the reason in words; the letter and memo use
  the plan's seats. 60 fps drag with 80 items (transform only; impact debounced 120 ms while dragging).
- Browser: type "add a bar with 6 stools along the back wall", then drag two four-tops out; all five figures and
  the checks card move; the Numbers chart differs from before the edit.

### P4. See it in the room, then polish
- Create: `components/immersive/furniture-layer.ts` (a `THREE.Group`; `GLTFLoader` from `three/examples/jsm`, one
  load per URL then `clone()`; `fitModel` for scale and offset; position = plan point -> `frame.fromPlan` ->
  `modelToThree`, `y = pano y - EYE_M` as the engine's rings already do; contact-shadow disc; same-room filter;
  cap `MAX_SCENE_OBJECTS`), `chapters/room.tsx`, `components/flow/room/mini-plan.tsx` (plan-canvas at 300x220
  with a view cone from `viewYaw`).
- Modify: `pano-engine.ts` (`setFurniture(items, frame)`; group drawn after the cubes with depth test on among the
  meshes, before the rings; mark dirty on change), `pano-viewer.tsx` (prop `furniture`; mode `empty` by default in
  Room when `skyboxEmpty` exists), `use-imagine-pano.ts` for the opt-in "Render this view".
- Accept: on a site with `skyboxEmpty`, tables stand on the floor (not floating, not sunk) and hold their place
  while looking around and gliding between panos; moving an item on the mini-plan moves it in the room in the same
  frame; meshes in the room equal the plan's items for that room; the AI render is opt-in and labelled. Dev aid:
  `?grid=1` draws a 1 m floor grid through the same transform to judge alignment by eye.
- Then: one polish pass at both sizes (`impeccable` polish + audit checklists) and one full live run, Ask to Deal.
- Browser: three sites (one without `skyboxEmpty`), every pano of the first; watch the first glide for hitches.

## 5. Risks and fallbacks

| Risk | Signal | Fallback |
|---|---|---|
| Furniture misaligned with the scan (frame or floor height) | `?grid=1` lines miss the floor / walls | one stored yaw + offset per site; if still off by 4 AM, Room ships as the isometric tilt of the plan (already in `plan.tsx`) over the dimmed pano plus the opt-in AI render, labelled "plan view" |
| No occlusion: items show through walls | furniture visible from the next room | same-room filter by default; hide furniture during glides, fade in on arrival |
| three.js frame drops (GLBs + two cubes) | glide under 50 fps (`engine.stats.glides`) | 30 nearest items, shared geometry and materials, discs instead of shadows, pixel ratio 1.5 while furniture is on |
| `/api/layout` latency (up to 15 s) or model down | spinner past 3 s | the offline parser answers common edits (labelled); drag editing never needs the network |
| Live `/api/agent` run is slow (about a minute) or rate limited | 429, long search | honest progress + Retry; a presenter may use `?replay=1` with the chip visible; never automatic |
| imagine-pano takes 20-60 s; daily quota | 429 `image_quota` | it is the optional layer; meshes are the answer; show the quota message as is |
| `backdrop-filter` over WebGL costs paint | long frames when the Guide scrolls | glass only on rail, Guide and impact bar; tiles use plain fills (never glass on glass) |
| Time | P3 not done by 3 AM | P4 shrinks to the furniture layer (no mini-plan drag); the polish pass stays |
