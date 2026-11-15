# Implementation Plan: Foreground

Source of truth: [SPEC.md](../SPEC.md). Task checklist: [todo.md](todo.md).

## Overview

Build Foreground in vertical slices so a demoable path exists early and gets richer each slice: one hard-coded site
page first, then the engine numbers on it, then real data for 12 sites, then the live agent, then the offer outputs,
then polish. Every slice leaves `npm run dev` showing a working demo path.

## Architecture Decisions

- **One Next.js app** for UI and agent (route handler streams SSE). Python only for offline prep.
- **Site JSON is the contract.** `lib/sites/schema.ts` (Zod) defines one site record; prep writes it, engine/agent/UI
  read it. Defined first so UI and agent work can run in parallel.
- **Engine is pure TypeScript** with unit tests; the LLM never computes money.
- **Agent tools read the cache**, never the network, during the demo. Prep-time scripts do the slow API work
  (Vexcel images, Matterport data, Fable 5.2 vision checks).
- **Replay mode** records one real agent run to `data/replays/` and plays it back with real timing.
- **Model routing:** runtime planner Sonnet 5.5, site subagents Haiku 5.5; prep-time vision Fable 5.2. Build-time
  subagents: Fable 5.2 for agent design and X-Ray rules, Opus 5.5 for UI craft, Sonnet 5.5 for wiring and tests,
  Haiku 5.5 for mechanical checks.

## Phases

### Phase 0: Spikes (running now)
- Matterport API + SDK capabilities, Vexcel API, deepagents JS API, site selection from the kit.

### Phase 1: Foundation
- T1 Scaffold Next.js + Tailwind + shadcn + Vitest + Playwright; `/impeccable init` design context.
- T2 Site schema (Zod) + loader + 2 fixture sites hand-made from spike data.
- T3 Benchmarks file with sources + engine: cost X-Ray rules, break-even, scenarios, trend, score (TDD).

### Checkpoint A: tests pass, build clean, engine numbers match the doc's worked example.

### Phase 2: The site page (demo centerpiece)
- T4 Site page shell: header facts, CoStar facts, tenant history / graveyard.
- T5 Aerial panel (Vexcel image + parking/patio overlay) and Matterport tour panel with X-Ray pins.
- T6 Before/after slider and floor-plan view.
- T7 Money panel: cost lines, break-even, 3-year scenarios chart, block trend.

### Checkpoint B: one site page complete on fixture data, looks finished at 1440 px and 375 px.

### Phase 3: Real data
- T8 `scripts/prep_sites.py`: kit → 12 site JSONs (CoStar join, food history, rent normalization).
- T9 Prep media: Vexcel tiles, Matterport stills, Fable 5.2 X-Ray vision findings per site.

### Phase 4: The agent
- T10 Agent tools over the cache + engine; planner + site subagents with deepagents; SSE route.
- T11 Landing + results page with streaming agent notebook and ranked cards; visible re-plan.
- T12 Replay recorder/player; Wi-Fi-off demo path.

### Checkpoint C: full path landing → results → site works live and in replay.

### Phase 5: Outputs and polish
- T13 Offer page: landlord ask list, broker email, printable deal memo (agent-written, engine-backed).
- T14 Browser verification (Chrome DevTools MCP), /break-ui, /web-design-guidelines fixes.
- T15 /code-review-and-quality and /security-and-hardening; README, Devpost text, demo script.

### Checkpoint D: success criteria 1–8 in SPEC.md all met.

## Parallelization

- After T2 (schema), run in parallel: T3 engine · T4–T7 UI on fixtures · T8 prep script.
- After T8: T9 media prep in parallel with T10 agent.
- T13 and T14 in parallel once Checkpoint C passes.
- Shared contract = `lib/sites/schema.ts`; changes to it go through the main session only.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Matterport room data or Defurnish not on our keys | High | Pins placed by sweep positions or fixed poses; before/after drawn as overlay on still image |
| Few kit sites are restaurant-ready | High | Spike picks 12; widen to mixed-use ground-floor retail |
| deepagents JS gaps | Med | Fallback FastAPI + Python deepagents service |
| Vexcel API unclear | Med | Ask Vexcel engineers on Discord; fall back to CoStar photos for aerial |
| Live LLM latency on stage | High | Replay mode; cache all tool results |
| Time (deadline 8 AM Sun) | High | Slices ordered so each checkpoint is demoable; cut P2 features first |

## Open Questions

- See SPEC.md open questions; spike results will close 2–4.
