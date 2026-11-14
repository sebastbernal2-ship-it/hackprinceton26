@AGENTS.md

# Project: Location Intelligence (HackPrinceton 26)
Evidence-first site-selection tool for an independent food-business owner (working concept: Italian restaurant + gelato, Houston/LA). Sponsor data: CoStar (property/market), Matterport (interior scans), Vexcel (aerial). Read `docs/README.md` first; scope in `docs/product/mvp.md`, contracts in `docs/architecture/README.md`, factor streams in `docs/data/factor-workstreams/`.

## Non-negotiables
- Never invent evidence. Keep observed / derived / estimated / unknown distinct; missing ≠ negative. No ranking or crime scoring until validated. Costs come from deterministic code, not LLM arithmetic.
- `.env`, `data/raw/`, `data/normalized/`, pilot property IDs and sponsor data stay local/uncommitted (see `.gitignore`). `.pi/` and `.hippo/` are local agent state, not part of the product.
- Work flow: `tools/board unread` → claim issue → short-lived branch → stage only owned paths → PR. Never commit to `main` or merge without explicit approval.

## Repo map
`foreground/` Next.js UI (frontend teammate); `modeling/` Matterport 3D pipeline (modeling teammate, README stale); `services/api/` FastAPI (reads local CSVs, port 8000); `data/` evidence pipeline and `data/factors/*` adapters (`data/run_factor_adapters.py`, `data/build_factor_cards.py`); `planning/` cost and financial scenario code; `inspection/` vision and geometry findings; `integration/` constraint filter; `forecasting/`; `contracts/`, `config/`; `tools/` board and codex-delegate; `data_scripts/` one-off scripts; `docs/` scope and contracts (demo runbook: `docs/DEMO.md`; ownership: `docs/development/workflow.md`). `costar-hackathon-kit-hackPrinceton/`, `reports/`, `*.jsonl` are gitignored.

## Checks
`python3 data/test_diligence_scores.py` and `python3 data/test_factor_cards.py` (use `.venv` if deps are missing); tests also in `tests/`.

## Codex
Codex CLI (`codex`, configured in `~/.codex`) is available as a delegate: use the `codex` skill / `tools/codex-delegate`. Claude is the lead: plans, owns commits/PRs/board posts, and verifies Codex output. The pi harness is a separate repo (`~/code/pi-harness`); this repo is only the project it runs on. Do not edit harness code from here.
