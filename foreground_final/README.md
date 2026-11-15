# Foreground

**Stand inside a real commercial space, imagine it as your restaurant, and know what that costs before you sign.**

Foreground combines three data layers for the same address: **CoStar** (listings, rents, tenant history, sales),
**Matterport** (3D scans, including furniture-removed views) and **Vexcel** (aerial imagery). An AI agent finds and ranks
spaces for an owner's brief. Then the owner walks the real interior, rearranges it, and imagines any change. Each
change comes with feasibility checks, costs, permits and a 3-year outlook.

Built at HackPrinceton Fall 2026 for the CoStar "Inside and Out" track.

## What it does

1. **Ask.** "Fast-casual taqueria, 40 seats, $250k, Houston." A survey-style city map shows which of the 12 scanned
   spaces fit.
2. **Search (mission control).** A LangChain `deepagents` planner (Claude Sonnet 5.5) sends site-inspector subagents
   (Claude Haiku 5.5) to inspect spaces in parallel. It drops and re-ranks them with reasons that come from the
   numbers and the address's history. Example: "2 food tenants left this suite within 2 years; Mezcal Houston closed".
   Runs live, or from a recorded replay when offline.
3. **Workspace** for any site, with four views and a sheet:
   - **Walk:** the real Matterport scan in a self-hosted viewer, with a Scanned / Empty switch (Matterport Defurnish).
     Cost pins mark findings such as an existing hood or kitchen line, and a guided walk-through visits them. Your
     floor plan appears as draggable 3D furniture.
   - **Imagine:** type any change, inside or out. Examples: "open the wall to the back room", "brick walls and
     concrete floors", "add a bar along the windows". The result includes:
     - Claude's plan of the change.
     - **10 feasibility checks**: hood and duct, grease interceptor, walls, ceiling, plumbing, restrooms and ADA,
       egress, electrical, gas, change of use. Each has a code citation and Houston or Los Angeles permit times.
     - The change in cost and break-even.
     - An **immersive 360° imagined room**, edited by Gemini on the scan's cube faces, that you can look around and
       walk through.
     - Every change is saved as a version you can branch and compare.
   - **Plan:** a to-scale layout studio. Drag furniture or type instructions. It includes a "Will it fill?" lunch-rush
     simulation.
   - **Above:** Vexcel top-down and angled aerials, with the building footprint and detected parking.
   - **Numbers:** hidden-cost X-Ray against the budget, break-even, 3-year slow/base/strong outlook, the address's
     past and future on one timeline, and the block trend.
4. **Offer.** Landlord ask list, a broker email drafted by Claude, and a printable deal memo.

## Our own models (trained on the CoStar kit)

| Model | Data | Held-out result | Use in the app |
|---|---|---|---|
| Fair rent ([card](docs/ml/rent-model-card.md)) | 16,656 rents across 500 buildings (1,196 retail) | Median error 20% vs 26% for submarket median; R² 0.50; 80% intervals cover 83% | "Asking $45/SF vs fair $20–41": becomes a landlord ask |
| Restaurant survival ([card](docs/ml/model-card.md)) | 895 Houston/LA food tenancies | ROC-AUC 0.64 out of time, a weak signal | Shown as context, never a headline |

We use Claude and Gemini for planning, vision and image edits, because a model trained on 12 scans could not match
them.

## Setup

Requirements: Node 24+, Python 3.12 (data scripts only).

```bash
npm install            # also copies the Matterport viewer assets into public/matterport
cp .env.example .env.local   # then fill in the keys below
npm run dev            # http://localhost:3000
```

`.env.local` needs `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `MATTERPORT_API_KEY`, `MATTERPORT_API_TOKEN`,
`MATTERPORT_SDK_KEY` (allowed for localhost), `VEXCEL_API_KEY` and `COSTAR_KIT_DIR` (the CoStar kit folder, needed
only to rebuild the data).
`FOREGROUND_REPLAY=1` makes the agent replay recorded runs without calling the API.

Checks: `npm test` (Vitest), `npm run typecheck`, `npm run build`.

Rebuild data (optional; uses the APIs):
`python -X utf8 scripts/prep_sites.py`, then `scripts/prep_media.py`, `scripts/prep_panos.py`,
`scripts/ml/build_dataset.py` + `train_survival.py`, and `scripts/ml/build_rent_dataset.py` + `train_rent.py`.

## Project map

```
app/                 routes: / , /search , /site/[id] (+ /offer, /model-card, /rent-model), /api/{agent,offer,layout,imagine,imagine-pano}
components/          landing, results (mission control), workspace, site, studio, imagine, immersive
lib/engine           cost X-Ray, break-even, scenarios, trend, score (pure, tested)
lib/feasibility      10 code-based checks + city packs
lib/agent            deepagents planner, tools, event stream, replay
lib/imagine          change planner (Claude), visualizer (Gemini), QA (Claude), versions
lib/immersive        cube mapping, neighbours, imagined-pano jobs
lib/layout           layout model, ops, auto-layout, costs, day simulation
lib/ml               survival and fair-rent loaders
data/                sites (12), benchmarks, replays, ml outputs
docs/                product plan, design vision, definition of done, model cards, spikes
```

## Honest limits

- AI images are visualizations, not construction drawings. Wall removal always carries a structural-engineer flag.
- Costs are cited ranges, not quotes. Permits and timelines vary.
- Data is the CoStar hackathon kit (Houston and Los Angeles). Production use would need commercial terms with
  CoStar, Matterport and Vexcel, plus permission from each scan's owner.

## Team

Built at HackPrinceton F26 with Claude Code (Claude Opus 5.5 orchestrating; Fable 5.2, Opus 5.5, Sonnet 5.5 and
Haiku 5.5 agents).
