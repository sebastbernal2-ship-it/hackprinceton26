# Foreground v1 product plan

Audience: CoStar (data owner of CoStar, Matterport since Feb 2025, and partner of Vexcel) and real small-business owners.
Promise: **stand inside a real space, imagine it as your business, and know what that costs before you sign.**

## What makes it unique (the CoStar "we didn't know you could do that" test)

1. **Inside + above + market for one address, in one workspace.** Nobody combines the real interior, feasibility, cost
   and lease economics (research: site-selection tools look outside; staging tools ignore cost; plan tools ignore the
   real space).
2. **Imagine anything, grounded in the scan.** Furniture and equipment are real-scale 3D objects placed inside the
   photoreal Matterport panoramas; structural ideas (open a wall, drop a ceiling, new storefront) are AI-edited views of
   the actual room, each tagged with the feasibility checks and costs it triggers.
3. **An agent that changes its mind for a reason.** Mission control shows it inspect, drop and re-rank sites using the
   address's own history (who left, who closed) and the engine's numbers.

## Architecture (from research)

| Layer | Choice | Why |
|---|---|---|
| 3D walk + objects | Matterport **Web Component / Bundle SDK** (self-hosted, our SDK key) + `@matterport/r3f` | Scene API: place/drag GLB furniture, lights, floor snapping (Pointer.intersection), Measurements, `View.ViewType.DEFURNISH` toggle in-viewer |
| Structural "what-ifs" | Claude plans the edit → Matterport screenshot of the current view → **Gemini image edit (Nano Banana 2)**, masked composite → Claude QA | Photoreal walls/ceilings/storefront edits; cost ~$0.07–0.15 per view; labeled "AI visualization, not a construction drawing" |
| Layout logic | existing `lib/layout` model + ops (2D plan) drives both the Plan view and 3D object placement | One source of truth for seats, zones, items |
| Feasibility | new `lib/feasibility`: 10 rule checks (hood/duct, grease interceptor, wall removal → engineer, ceiling vs sprinklers/plenum, plumbing moves/trenching, restrooms + ADA, occupant load + egress, electrical, gas, change of use) with status, cost range, code cite, city pack (Houston, LA permit paths/timelines) | Every imagined change is tagged with the checks it triggers |
| Money | existing engine (X-Ray, break-even, 3-year scenarios), extended with feasibility costs | Numbers update live on every change |
| Agent | existing deepagents planner + site inspectors; add Interrupt / Undo drop | Visible, reversible reasoning |

## Screen map

```
Home / Ask ──► Search (mission control) ──► Property workspace ──► Share / Offer
   │                                          │  Walk · Plan · Above · Numbers
   └── Projects ◄──── Compare (2–4) ◄─────────┘  Imagine mode (versions A → A1 → A2)
```

- **Home / Ask:** one input "What are you opening, and where?", example chips, city map (first run animates).
- **Search:** mission control lanes, editable brief title block, Interrupt per lane, Undo drop, ranked cards.
- **Property workspace:** full-bleed dark canvas with a view switcher (Walk = Matterport 3D with cost pins, minimap and
  "Walk me through it" guided route; Plan = layout studio; Above = Vexcel; Numbers = money) and the plat sheet beside
  it (cost vs budget, break-even, 3-year, history). Compare slider Scanned / Empty / Imagined.
- **Imagine mode:** "Imagine a change…" input + chips; each request creates a version with a change list, feasibility
  checks, cost delta and permits; edit line items; branch, compare, undo.
- **Compare:** 2–4 sites or versions side by side.
- **Share / Offer:** read-only link to the exact view + version (URL state), pin comments, ask list, broker email, memo.
- **Projects:** saved briefs, sites and versions (local-first; no signup until Save/Share).

## Design system (adapted plat)

Keep the surveyor's plat (sources on every figure; pay = red, saved = green, unknown = ochre). Adapt: owner density by
default (16–17 px body, plain words), plat density for memo/compare; full-bleed neutral-dark canvas for 3D; three hero
motions on the critical path (city wakes up on first run, mission control, the compare slider); others become quiet
tools; Cmd-K command bar; dark tokens; 6 px radius on touch targets; WCAG 2.2 (24/44 px targets, non-drag
alternatives, focus not obscured); provenance marks: solid `src` = data, dashed = estimate, ink = you set this.

## Build phases

1. **Spike (de-risk):** Matterport Web Component with our key on localhost — load a kit model, toggle Defurnish, place
   and drag one GLB, raycast to floor. Gemini edit of one Matterport screenshot. Go/no-go for each.
2. **Workspace shell:** new `/site/[id]` workspace layout, view switcher, sheet, URL state; move existing components in.
3. **Imagine:** Claude edit planner → feasibility tagging → Gemini visualization → versions + compare slider.
4. **3D objects:** CC0 GLB kit (tables, booths, bar, kitchen line, hood) driven by layout ops; drag in 3D syncs to plan.
5. **Feasibility engine + city packs**, wired into X-Ray and Imagine.
6. **Home, mission control, compare, share/offer, projects** polish; Cmd-K.
7. **Verify:** browser checks, /break-ui, /web-design-guidelines, perf; /code-review-and-quality, /security-and-hardening;
   README, Devpost; GitHub; optional Vercel.

## Honest limits to state in the product

- AI views are visualizations, not construction drawings; walls are never shown as freely removable without an
  engineer flag.
- Costs are ranges with sources, not quotes; permits and timelines vary.
- Production use would need CoStar/Matterport/Vexcel commercial terms and scan-owner permission (bring-your-own-scan).

## Needed from the team

Gemini API key; OK to commit and publish to GitHub (and which account); optional: Matterport kit zip, Vercel login,
Peri interview quote.
