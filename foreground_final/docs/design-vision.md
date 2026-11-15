# Foreground design vision: "Survey in motion"

Foreground's visual world is a surveyor's plat (see DESIGN.md). This document raises the ambition: the plat comes
alive. Every screen is an instrument that measures a building in front of you, and every number is drawn, not printed.
Motion explains what the AI and the engine are doing; it never decorates. Library: `motion` (installed, v14) for springs,
layout animations and gestures; CSS View Transitions for page-to-page morphs; SVG for all drawings. Respect
`prefers-reduced-motion` everywhere (state still changes, without travel).

## Signature moments (each one is a demo beat)

1. **The city wakes up (landing).** A full-bleed, slowly breathing plat map of Houston and Los Angeles drawn in
   hairlines (streets as survey lines from the 12 sites' coordinates, not a map tile). The 12 sites are survey
   monuments (small crosshair markers with their address in mono). The single input "What are you opening?" sits on
   the map. Typing the brief makes markers that fit it brighten in real time (client-side filter by city, SF, rent).
   Submit: a scan line sweeps across the city and the camera eases toward the chosen city.

2. **Mission control (results).** The agent's work is spatial, not a chat log. The parsed brief becomes a title block.
   The plan steps tick like a survey checklist. Each site-inspector subagent is a lane: a live survey line draws from
   the brief to that site's aerial thumbnail, which gets a scanning sweep while the subagent runs; numbers tick up as
   they arrive (X-Ray mid, turns). A DROP strikes the lane with a red survey "void" mark and the lane collapses with
   a spring; a RERANK physically reorders lanes (layout animation). The final ranking assembles itself from the lanes.
   Shared-element morph: the winning card's aerial thumbnail becomes the site page hero (View Transitions).

3. **X-ray lens (site page).** Instead of only a slider, a circular lens follows the pointer over the scanned interior:
   inside the lens the room is empty (defurnished) and infrastructure findings glow as callouts (hood, kitchen line,
   grease drain) with their cost; outside it is the furnished room as scanned. Hovering a cost line in the X-Ray list
   pulses the matching pin in the image and in the 3D tour. Touch: drag the lens; keyboard: slider fallback.

4. **The budget vessel.** Build-out cost lines are blocks that drop into a vessel whose rim is the owner's budget.
   "Saved" lines (existing hood, grease trap) lift out of the vessel with a green trace showing what they saved. Over
   budget, blocks spill over the rim into red hatching. Changing seats or concept re-flows the blocks with springs.

5. **Past and future on one line.** One horizontal timeline per site: to the left, the address's real tenant history
   (Mezcal Houston's bar ends where it closed); a "today" survey stake; to the right, the owner's 3-year cash curve in
   slow/base/strong. A scrubber moves through time; numbers update as it moves. The story reads at a glance: who was
   here, how long they lasted, and what has to be true for you to last longer.

6. **Will it fill? (day simulator).** On the layout, an animated lunch rush: dots (guests) enter, take seats, leave,
   over a compressed day at the turns the break-even needs. If the turns needed exceed what the room can do, the queue
   visibly backs up out the door. This makes "3.8 turns a day" physical. Controls: concept, seats, speed.

7. **Layout Studio in 2.5D.** The top-down plan can tilt into an isometric view (CSS 3D transforms, spring) where
   furniture extrudes as simple blocks and zones as tinted floors; natural-language changes animate items into place
   (each item flies along a short arc to its new spot); the impact panel's numbers roll (digit tween) as they change.

## Craft rules

- Numbers tween (no jumps); dimension lines draw with stroke-dashoffset; markers settle with a critically damped spring.
- One accent per state: survey red = you pay; green = saved; ochre = unknown. No gradients, no glassmorphism, no
  neon, no stock 3D.
- Typography stays Archivo (condensed for figures) + Geist Mono for sources. Big figures are allowed only where they are
  the point of the beat.
- Performance: 60 fps on a laptop; animate transform/opacity only; no layout thrash; lazy-load heavy media below the
  fold; the demo path must stay smooth on a projector.
- Every animation has a reason: progress, cause and effect, or orientation. If a motion doesn't explain something,
  cut it.
