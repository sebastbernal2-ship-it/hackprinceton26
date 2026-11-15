# Spec: Foreground

> Status: draft for approval · 2026-11-13 · HackPrinceton F26 (deadline 8:00 AM Sun Nov 15)

## Objective

Foreground tells an independent food-business owner what a specific commercial space in Houston or Los Angeles will
really cost to become their restaurant, and what the next three years there could look like. It can see inside the
building (Matterport), from above (Vexcel), and into the market (CoStar).

**User:** an independent restaurant or cafe owner opening a first or second location, budget roughly $50k to $250k,
no data team.

**Judges:** CoStar "Inside and Out" (30% data use, 30% agentic depth, 25% usefulness, 15% demo), Peri, LangChain
deepagents, Amazon Practical AI, HackPrinceton Business and Enterprise.

### User stories

1. As an owner, I type what I want to open ("taqueria, 40 seats, $150k, Houston") and get a ranked shortlist of real
   available spaces, each with a one-line reason.
2. As an owner, I watch the agent work: which sites it checks, what it finds, and when it changes its mind.
3. As an owner, I open a site and see the aerial view, the 3D tour with hidden-cost pins, a before/after of my
   restaurant in the space, cost ranges, break-even and a 3-year outlook.
4. As an owner, I see the address's history: past restaurants there and how long they lasted.
5. As an owner, I click "Prepare offer" and get a landlord ask list, a broker email draft and a printable deal memo.

## Assumptions (correct any now)

1. One Next.js app (TypeScript) holds the UI and the live agent; no separate Python server. Python is used only for
   offline data prep scripts.
2. The agent uses LangChain **deepagents for JavaScript** with Anthropic models (confirm the package and API via
   context7 during planning). If the JS package is missing a needed feature, fall back to a small FastAPI service with
   Python deepagents.
3. CoStar data comes only from the local kit files; there is no CoStar API.
4. Matterport tours are shown with the Showcase SDK (SDK key, localhost allowed); room data comes from the Matterport
   GraphQL Model API with the API key and token. Property Intelligence may not be available on our keys.
5. Vexcel imagery is fetched once per demo site at prep time and cached as images.
6. The demo runs on a laptop at the venue from cached data; Vercel deploy is a backup link for Devpost.
7. Runtime models: `claude-sonnet-5-5` for the planner, `claude-haiku-5-5` for per-site subagents. Prep-time vision
   checks (hood, kitchen, restrooms in scan snapshots) use `claude-fable-5-2` because quality matters and latency does
   not.

## Capability map

| Module id | Responsibility | Depends on |
|---|---|---|
| `site-data` | Offline prep: pick 10 to 15 food-suitable sites from the kit; join property, listing, tenancy, company and sale data; fetch Vexcel tiles and Matterport model data; write one `data/sites/<id>.json` per site | CoStar kit, Matterport, Vexcel |
| `engine` | Pure TypeScript: cost X-Ray line items, break-even, 3-year scenarios, block-trend rating, site score | `site-data` schema |
| `agent` | deepagents planner + per-site subagents with tools over the site cache and engine; streams events; replay mode | `site-data`, `engine` |
| `ui` | Landing, results with agent notebook, site page, offer page | `engine`, `agent` |
| `outputs` | Landlord ask list, broker email, deal memo | `engine`, `agent` |

Build order: `site-data` schema + 2 sample sites → `engine` → `ui` site page on sample data → `agent` → `outputs` →
remaining sites → polish.

## Tech Stack

- Next.js 16 (App Router), React 19, TypeScript strict, Tailwind CSS 4, shadcn/ui
- Matterport Showcase SDK (embed), Matterport Model API (GraphQL)
- Vexcel imagery API (prep time)
- LangChain deepagents (JS) + `@langchain/anthropic`
- Zod for the site schema and agent tool inputs
- Vitest for unit tests, Playwright for end-to-end
- Python 3.12 for `scripts/` (standard library + pandas only)

## Commands

```
Install:   npm install
Dev:       npm run dev                 # http://localhost:3000
Test:      npm test                    # vitest run
Watch:     npm run test:watch
E2E:       npm run e2e                 # playwright test
Lint:      npm run lint
Typecheck: npm run typecheck           # tsc --noEmit
Build:     npm run build
Prep data: python -I scripts/prep_sites.py --kit "%COSTAR_KIT_DIR%" --out data/sites
Replay:    FOREGROUND_REPLAY=1 npm run dev   # agent replays a recorded run, no API calls
```

## Project Structure

```
app/                   → Next.js routes: / , /search , /site/[id] , /site/[id]/offer , /api/agent
components/            → UI components (site/, notebook/, charts/)
lib/engine/            → cost, breakeven, scenarios, trend, score (pure functions)
lib/agent/             → planner, subagents, tools, event stream, replay
lib/sites/             → Zod schema + loader for data/sites/*.json
data/sites/            → one JSON per demo site (committed; no secrets)
data/benchmarks.json   → restaurant benchmarks with source URLs
data/replays/          → recorded agent runs for replay mode
public/sites/<id>/     → cached Vexcel tiles, before/after images
scripts/               → Python data prep
tests/                 → vitest unit tests mirror lib/
e2e/                   → playwright specs
docs/                  → notes, demo script
```

## Code Style

```ts
// lib/engine/breakeven.ts
export type BreakevenInput = {
  annualOccupancyUsd: number;   // rent + CAM + tax + insurance
  targetOccupancyShare: number; // e.g. 0.08
  seats: number;
  avgCheckUsd: number;
  openDaysPerYear: number;
};

export function breakeven(input: BreakevenInput) {
  const salesNeededUsd = input.annualOccupancyUsd / input.targetOccupancyShare;
  const coversPerDay = salesNeededUsd / input.avgCheckUsd / input.openDaysPerYear;
  return { salesNeededUsd, coversPerDay, turnsPerDay: coversPerDay / input.seats };
}
```

- Engine functions are pure, typed, unit-labeled (`Usd`, `Sf`, `Share`), and never call the network.
- Every number shown to the user carries a source or "estimate" label.
- Components are server components unless they need interaction.
- Names: kebab-case files, PascalCase components, camelCase functions.

## Testing Strategy

- **Unit (Vitest):** every `lib/engine` function, the site schema loader, and agent tools with fixture sites. Engine
  coverage target 90%.
- **Agent:** a test runs the planner in replay mode and checks the event sequence (plan, per-site checks, one
  re-plan, ranking).
- **E2E (Playwright):** landing → search → site page → offer page on replay data; screenshot checks at 1440 px and
  375 px.
- **Browser checks:** Chrome DevTools MCP for console errors and layout; then /break-ui and /web-design-guidelines.

## Boundaries

- **Always:** keep secrets in `.env.local`; run `npm test` and `npm run typecheck` before each commit; label
  estimates and cite benchmark sources; keep the demo path working from cache.
- **Ask first:** adding a paid service; changing the demo city or niche; deploying publicly; pushing the repo.
- **Never:** commit `.env*` or keys; write into the CoStar kit folder; show a revenue figure as a promise; show
  broker contact data beyond what the demo needs.

## Success Criteria

1. Typing a request on `/` produces a ranked list of at least 4 sites (after visible drops) in about 30 seconds live,
   and in under 10 seconds in replay mode (replay speed ×4 or faster).
2. The agent notebook shows at least one visible re-plan (a site dropped or a layout changed because of a finding).
3. Each site page shows all three layers: Vexcel aerial, Matterport tour, CoStar facts and tenant history.
4. Each site shows at least 3 X-Ray cost lines with low/high ranges, and break-even with covers per day and turns.
5. Each site shows slow/base/strong 3-year scenarios computed by the engine from benchmarks in `data/benchmarks.json`.
6. The offer page produces an ask list, an email draft and a printable memo for any site.
7. `npm test`, `npm run typecheck` and `npm run build` pass; no console errors on the demo path.
8. The full demo path works with Wi-Fi off (replay mode + cached assets, except the live Matterport tour).

## Open Questions

1. Matterport connection details: the kit says these come in a separate zip. Do you have it?
2. Do our Matterport keys include Property Intelligence (room names, dimensions) and Defurnish?
3. Vexcel API endpoint and image product to use (oblique vs ortho); confirm with the Vexcel engineers.
4. Before/after images: generate with an image model (which key?) or draw a styled layout overlay ourselves?
   Default if no answer: a layout overlay drawn on the defurnished/still image, no image model.
5. Peri interview: who on the team does it, and when?
