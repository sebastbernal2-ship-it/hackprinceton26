# HackPrinceton 26: Location Intelligence

Evidence-first site selection for an independent restaurant owner (working concept: Italian restaurant with gelato, Houston and Los Angeles). The owner describes the concept; the product shows a small shortlist of commercial spaces with what is known about each, what is not, what a build-out might cost, and what to verify with the landlord before signing.

It is not a listing ranker, a revenue forecaster, or a safety scorer. Every number is labelled by evidence status and missing data is shown as unknown, never as zero or as a negative finding.

## Honesty principles
- Four evidence statuses, always kept distinct: `observed`, `derived`, `estimated`, `unknown`. Missing is not negative.
- No ranking, fit score or crime score until validated. "Evidence readiness" is the share of looked-for facts that are verified; it is not a quality score.
- Costs and scenarios come from deterministic code over a price catalog (`planning/`), never LLM arithmetic. Output is "scenario analysis, not a forecast".
- Vision findings and scans are leads for an on-site inspector, not proof of defects or compliance.
- Sponsor data (CoStar kit, Matterport, Vexcel), `.env`, large scan JSON, weights and pilot property IDs stay local and uncommitted (`.gitignore`, `.claude/hooks/guard-staging.py`).

## Architecture map
| Dir | What it is |
|---|---|
| `foreground/` | Next.js app: intake, Discover shortlist, property evidence, cost, inspection and Act panels, Matterport tour. Proxies `/api/*` to the API. |
| `services/api/` | FastAPI on port 8000. Reads local CSVs (`COSTAR_NORMALIZED_DIR`, default `data/normalized/costar`); fixtures in `services/api/tests/fixtures`. |
| `data/` | Evidence pipeline: candidate sites, factor adapters (`data/factors/*`), factor cards, financial catalog, registry, tests. |
| `forecasting/` | Backtested time-series cards (`series/`) and an exploratory survival model (`survival/`). |
| `planning/` | Deterministic cost model, price catalog, timeline, seeded Monte Carlo, sensitivity. |
| `inspection/` | Defect findings from vision (Anthropic API, fixture mode without a key) and geometry rules; 3D anchoring; cost link. |
| `integration/` | Brief parser and three-valued hard-constraint filter (unknown is not a pass). |
| `assets/` | Equipment/furniture catalog, variants, GLB, and draft ingest. |
| `capture/` | Phone video to scene bundle (needs GPU and weights; weights are local only). |
| `walkthrough/` | Vite + TypeScript viewer that walks a scene and shows finding pins. |
| `modeling/` | Matterport 3D pipeline scripts (need Matterport keys; not wired to the API). |
| `contracts/` | JSON Schemas generated from the API pydantic models. |
| `config/` | Published-source config. |
| `tools/` | `board` (GitHub coordination issue) and `codex-delegate` (review/ask/work with Codex CLI). |
| `data_scripts/`, `docs/`, `.claude/` | One-off scripts, documentation, project agents/hooks/workflow. |

## Quickstart (no sponsor data needed)
```bash
# API on fixtures, port 8000
COSTAR_NORMALIZED_DIR=services/api/tests/fixtures \
  uv run --no-project --with-requirements services/api/requirements.txt \
  uvicorn services.api.app.main:app --port 8000
curl localhost:8000/api/health        # dataAvailable true, modelsAvailable false

# Web on port 3000 (second terminal)
cd foreground && npm ci && cp .env.example .env.local && npm run dev
```
The full demo with real local data is in [docs/DEMO.md](docs/DEMO.md). Tests per directory are listed in [CLAUDE.md](CLAUDE.md).

## Status
| Piece | Status |
|---|---|
| Candidate sites and factor adapters (65 sites, local CoStar data) | Real, needs local gitignored data |
| Factor cards, evidence readiness, constraint filter | Real |
| API `/health`, `/matches`, `/property/{id}`, `/costs`, `/inspection` | Real code; `/inspection` is empty until a run exists |
| Cost model, financial catalog, Monte Carlo (`/assess`, `/replan`) | Real, neutral estimated prices, not vendor quotes |
| `/projections` | Stub: empty list, "unknown, not zero" |
| `/next-question`, `/tour-agent` | Deterministic stubs |
| Series cards | Gated; emitted only when the backtest gate passes |
| Survival model | Exploratory; gate failed on the test split, no cards emitted |
| Verification checklist (Act) | Deterministic, in the web app |
| Matterport tour | Needs SDK key and a model (6 of 65 sites) |
| `capture/`, `modeling/` | Separate pipelines, need GPU or Matterport keys, not wired to the API |
| Vexcel aerial | Missing (access returned 403) |
| Re-plan UI | Missing (API exists) |
| Ranking, revenue forecast | Intentionally absent |

## Links
- [docs/README.md](docs/README.md): documentation index
- [docs/product/mvp.md](docs/product/mvp.md): scope and demo flow
- [docs/architecture/README.md](docs/architecture/README.md): contracts and provenance
- [contracts/README.md](contracts/README.md): HTTP API contract
- [docs/development/workflow.md](docs/development/workflow.md): ownership and workflow
