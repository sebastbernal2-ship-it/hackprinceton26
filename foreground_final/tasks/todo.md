# Foreground task list

Spike findings that shape these tasks (details in `docs/spikes/` and `scripts/spikes/`):
- **CoStar kit:** 25 candidates, top 12 (6 Houston, 6 LA). Hero sites: 1018657 (2600 Travis St, Houston; two failed
  restaurants in the same suite) and 20219730 (630 W 6th St, LA; existing hood and grease interceptor). Only 8 of 25
  have a scan of the exact available suite.
- **Matterport:** Basic auth GraphQL works on kit models. Rooms (labels, dimensions), floor-plan vectors, pano
  positions, photos, skyboxes and AI descriptions are available. **Defurnished views exist on 33 of 107 retail models**
  and return the same panos empty, giving a true before/after. Tags can be added with the SDK.
- **Vexcel:** API 2.0 with `X-API-KEY`. Ortho and oblique images (about 7 cm/px), building footprint, vehicle count,
  hardscape area, and prompt-based `elements/detect` ("parking space", "patio").
- **deepagents JS 1.16.5:** tools, subagents with their own model, streaming with `subgraphs: true`.

Model routing for build agents: Fable 5.2 = agent design, X-Ray rules, vision prep · Opus 5.5 = UI craft ·
Sonnet 5.5 = wiring, prep scripts, tests · Haiku 5.5 = mechanical checks.

## Phase 1: Foundation

- [ ] **T1 Scaffold** (S): Next.js 16 + TS strict + Tailwind 4 + shadcn + Vitest + Playwright; npm scripts from SPEC;
  `/impeccable init` design context.
  - Accept: `npm run dev` serves `/`; `npm test`, `npm run typecheck`, `npm run build` pass.
  - Files: package.json, next.config.ts, vitest.config.ts, playwright.config.ts, app/layout.tsx, app/page.tsx
- [ ] **T2 Site contract** (S): `lib/sites/schema.ts` (Zod) + loader + 2 fixture sites (1018657, 20219730) built from
  spike data.
  - Accept: loader parses both fixtures; invalid JSON fails with a clear error; unit tests pass.
  - Files: lib/sites/schema.ts, lib/sites/load.ts, data/sites/*.json, tests/sites/load.test.ts
- [ ] **T3 Engine** (M, TDD, Fable): `data/benchmarks.json` with sources; `lib/engine/` cost X-Ray rules, break-even,
  3-year scenarios, block trend, site score.
  - Accept: doc's worked example reproduces (slow $45k, base $88k, strong $132k); every output has low/high and a
    source label; engine coverage at least 90%.
  - Files: data/benchmarks.json, lib/engine/{xray,breakeven,scenarios,trend,score}.ts, tests/engine/*.test.ts

### Checkpoint A: tests pass, build clean.

## Phase 2: The site page (on fixtures)

- [ ] **T4 Site page shell + history** (M, Opus): `/site/[id]` header, CoStar facts, tenant timeline with graveyard.
  - Accept: both fixtures render; past food tenants shown with durations; no console errors.
- [ ] **T5 Aerial + tour** (M, Opus): Vexcel ortho with footprint/parking/patio overlay; Matterport Showcase embed with
  X-Ray tags placed from room/pano positions.
  - Accept: aerial shows overlay with counts; tour loads on localhost with at least 3 pins.
- [ ] **T6 Before/after + floor plan** (M, Opus): slider over furnished vs defurnished skybox face with the planned
  layout drawn on; floor plan SVG from room vectors with seating overlay.
  - Accept: slider works by mouse, touch and keyboard; plan shows seat count used by break-even.
- [ ] **T7 Money panel** (M, Opus): cost lines, break-even, 3-year scenarios chart, block trend, payback.
  - Accept: numbers come only from the engine; each carries a source or "estimate" label.

### Checkpoint B: one complete site page at 1440 px and 375 px; review with user.

## Phase 3: Real data

- [ ] **T8 Prep CoStar** (M, Sonnet): `scripts/prep_sites.py` turns spike `build.py`/`pick.py` logic into 12 site
  JSONs matching the schema; prefer sites whose scans include a defurnished view.
  - Accept: 12 files validate against the schema; reruns are deterministic.
- [ ] **T9 Prep media + vision** (M, Fable): fetch Vexcel ortho/oblique, structure, property and detect results;
  Matterport rooms, panos, skybox faces (default + defurnished), photos; Fable 5.2 vision X-Ray findings (hood,
  kitchen line, restrooms, grease trap evidence) with confidence; cache to `public/sites/<id>/`.
  - Accept: each site has aerial, at least 1 interior image and an X-Ray findings list; no keys in output.

## Phase 4: The agent

- [ ] **T10 Agent core** (M, Fable): deepagents planner (Sonnet 5.5) + site subagent (Haiku 5.5); tools: search
  sites, get site facts, run X-Ray, compute money, compare; SSE route `/api/agent`.
  - Accept: a query returns ranked sites with reasons; event stream includes subagent start/finish and one re-plan.
- [ ] **T11 Landing + results** (M, Opus): `/` intake; `/search` streaming notebook + ranked cards.
  - Accept: end-to-end live run under 30 s; cards link to site pages.
- [ ] **T12 Replay** (S, Sonnet): record a live run to `data/replays/`; `FOREGROUND_REPLAY=1` plays it with timing.
  - Accept: demo path works with no API calls.

### Checkpoint C: landing → results → site, live and replay.

## Phase 5: Outputs and polish

- [ ] **T13 Offer page** (M, Sonnet): ask list, broker email, printable deal memo.
- [ ] **T14 Verify UI** (M): Chrome DevTools MCP checks; /break-ui; /web-design-guidelines fixes.
- [ ] **T15 Review + harden** (M): /code-review-and-quality; /security-and-hardening; README, Devpost text, demo
  script; repo public with no secrets.

### Checkpoint D: SPEC success criteria 1–8 met.
