@AGENTS.md

# Project: Location Intelligence (HackPrinceton 26)
Evidence-first site-selection tool for an independent food-business owner (working concept: Italian restaurant + gelato, Houston/LA). Sponsor data: CoStar (property/market), Matterport (interior scans), Vexcel (aerial). Read `docs/README.md` first; scope in `docs/product/mvp.md`, contracts in `docs/architecture/README.md`, factor streams in `docs/data/factor-workstreams/`.

## Non-negotiables
- Never invent evidence. Keep observed / derived / estimated / unknown distinct; missing ≠ negative. No ranking or crime scoring until validated. Costs come from deterministic code, not LLM arithmetic.
- `.env`, `data/raw/`, `data/normalized/`, pilot property IDs and sponsor data stay local/uncommitted (see `.gitignore`). `.pi/` and `.hippo/` are local agent state, not part of the product.
- Work flow: `tools/board unread` → claim issue → short-lived branch → stage only owned paths → PR. Never commit to `main` or merge without explicit approval.

## Repo map
`foreground/` Next.js UI (npm); `services/api/` FastAPI, port 8000, reads local CSVs (`COSTAR_NORMALIZED_DIR`, fixtures in `services/api/tests/fixtures`); `data/` evidence pipeline, `data/factors/*` adapters (`data/run_factor_adapters.py`, `data/build_factor_cards.py`), `data/financial/`, `data/tests/`; `planning/` deterministic cost, timeline, Monte Carlo; `forecasting/` series and survival; `inspection/` vision and geometry findings; `integration/` intake and constraint filter; `assets/` equipment catalog and ingest; `capture/` phone video to scene (GPU, local weights); `walkthrough/` Vite viewer (npm); `modeling/` Matterport pipeline (needs keys, README predates the merge); `contracts/` generated JSON Schemas; `config/`; `tools/` `board` and `codex-delegate`; `docs/` scope, contracts, runbook (`docs/DEMO.md`), ownership and workflow (`docs/development/workflow.md`). `.claude/` holds `agents/` (`verifier`, `reviewer`), `hooks/guard-staging.py` (blocks staging sponsor data and secrets), `skills/codex`, `workflows/slice-and-verify.js`. `costar-hackathon-kit-hackPrinceton/`, `reports/`, `*.jsonl` are gitignored.

## Checks
Run from the repo root with uv (no system pip); full list with extra deps in `docs/development/workflow.md`. CI mirrors them in `.github/workflows/ci.yml`.
- `uv run --no-project --with pytest pytest data/tests` (also `integration`)
- `uv run --no-project --with pytest --with-requirements services/api/requirements.txt --with anthropic --with python-dotenv --with pillow --with numpy --with pandas pytest services/api`
- `uv run --no-project --with pytest --with numpy --with scipy --with pillow --with opencv-python-headless pytest inspection capture`
- `uv run --no-project --with pytest --with-requirements forecasting/requirements.txt pytest forecasting`; `... --with numpy pytest -c planning/pytest.ini planning`; `... --with-requirements modeling/requirements.txt pytest modeling`
- `cd foreground && npm ci && npm test && npm run build && npm run lint`; `cd walkthrough && npm ci && npm run build && npm test`

## Codex
Codex CLI (`codex`, configured in `~/.codex`) is available as a delegate: use the `codex` skill / `tools/codex-delegate`. Claude is the lead: plans, owns commits/PRs/board posts, and verifies Codex output. The pi harness is a separate repo (`~/code/pi-harness`); this repo is only the project it runs on. Do not edit harness code from here.

## Working with agents and browsers
- Project agents live in `.claude/agents/` (`verifier`, `reviewer`); the reusable `slice-and-verify` workflow is in `.claude/workflows/`. Run project work from a session started in this repo so worktree creation and merges are not blocked by cross-repo rules.
- Python runs through `uv run --no-project --with pytest ...` (no system pip). Review a branch with `tools/codex-delegate review main` plus the `reviewer` agent before merge.
- UI QA: use `chrome-devtools-axi` (open, snapshot, screenshot, click, fill) against `npm run dev` rather than headless Chromium screenshots.
- Handoffs: post concise progress with `tools/board post`; PRs should say `Closes #N` only for issues whose acceptance is actually met.
