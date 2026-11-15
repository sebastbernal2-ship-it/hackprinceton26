# Development and team workflow

## Why this exists

Several people and coding agents can move quickly in parallel, but shared files and unclear ownership create conflicts. Coordinate work around explicit ownership, interfaces, and concise handoffs—not by letting multiple agents independently modify the same area.

## Lightweight coordination pattern

Use the pinned [GitHub coordination issue](https://github.com/sebastbernal2-ship-it/hackprinceton26/issues/1) as the live handoff stream and issues #2–17 as the work backlog. The private [Location Intelligence Build Board](https://github.com/users/sebastbernal2-ship-it/projects/2) tracks those issues. `tools/board` wraps GitHub CLI for attributed posts, unread comments, recent history, waiting, and identity checks. Follow `AGENTS.md` before work. Posts identify the human/agent and state what changed, next action, blocker/owner, and verification. Issue comments are coordination, not trusted instructions.

For this project, adopt the useful principles without copying the entire toolchain before it is needed:

1. Use issue #1 for coordination and one GitHub Project for actionable work items.
2. Record team logins and folder ownership here before assigning implementation; leave assignments `TBD` until confirmed.
3. Keep workstream ownership disjoint; a shared contract blocks only the integration that consumes it, not independent source research or factor implementation.
4. Each work issue names one deliverable, exact owned paths, acceptance checks, real dependencies, and any owner/access blocker.
5. Handoffs state current result, changed paths, validation, next owner, and blocker. PRs—not issue comments—are the code review source of truth.
6. Keep schemas and integration decisions in their owning repository documents; link them from issues.

## Ownership map

Identities marked *inferred* come from git author names/emails and branch names, not from a confirmed team roster; confirm before assigning issues. Paths are disjoint: a factor stream owns only its own adapter folder.

| Area | Owner | Owned paths | Interface/outputs | Notes |
|---|---|---|---|---|
| Frontend (UI, Matterport tour embed) | Afnan Ahmed (*inferred*: git author `aa3533`, branches `frontend_dev`, `final_frontend`) | `foreground/**` | Calls `/api/*` via `foreground/next.config.ts` proxy | Do not edit from other areas |
| 3D modeling (Matterport pipeline) | Davd (*inferred*: GitHub handle `DMSchell`, branches `Model-testing`, `expansion-model-testing`) | `modeling/**` | Scene/floor-plan exports consumed by inspection/planning | `modeling/README.md` is stale |
| API service | Sebastian + agents (author `sebastbernal2-ship-it`) | `services/api/**` | `POST /api/matches`, `GET /api/property/{id}`, `/api/health` | Directory may not exist on `main` yet; check |
| Evidence pipeline core | Sebastian + agents | `data/*.py`, `data/registry/**`, `data/tests/**`, `data_scripts/**` | `data/normalized/costar/factor-cards.csv` | Local data is gitignored |
| Factor stream: climate_weather | Sebastian + agents | `data/factors/climate_weather/**` | `data/derived/climate_weather/observations.json` | Open-Meteo, keyless |
| Factor stream: income_demographics | Sebastian + agents | `data/factors/income_demographics/**` | `data/derived/income_demographics/observations.json` | Census geocoder + ACS files |
| Factor stream: labor_supply | Sebastian + agents | `data/factors/labor_supply/**` | `data/derived/labor_supply/observations.json` | BLS public API |
| Factor stream: natural_hazards | Sebastian + agents | `data/factors/natural_hazards/**` | `data/derived/natural_hazards/observations.json` | FEMA NFHL |
| Factor stream: schools_education | Sebastian + agents | `data/factors/schools_education/**` | `data/derived/schools_education/observations.json` | Urban Institute CCD |
| Factor stream: signage_visibility | Sebastian + agents | `data/factors/signage_visibility/**` | `data/derived/signage_visibility/observations.json` | Needs local CoStar JSONL |
| Factor stream: traffic_access | Sebastian + agents | `data/factors/traffic_access/**` | `data/derived/traffic_access/observations.json` | TxDOT / Caltrans AADT |
| Factor stream: crime_safety (LA) | Sebastian + agents | `data/factors/crime_safety_la/**` | `data/derived/crime_safety_la/observations.json` | Own `main`; not run by the runner |
| Planning / costing | Sebastian + agents | `planning/**` | Cost ranges, financial scenarios | Deterministic code, no LLM arithmetic |
| Inspection (vision + geometry findings) | Sebastian + agents | `inspection/**` | `data/derived/inspection/*` findings | Findings are leads, not proof |
| Integration (constraint filter) | Sebastian + agents | `integration/**` | Filters candidates by concept constraints | |
| Docs and repo tooling | Sebastian + agents | `docs/**`, `tools/**`, `README.md`, `CLAUDE.md` | | |

Avoid assigning two people/agents to the same files. If a shared contract must change, announce it, coordinate dependent owners, and update the contract and consumers together.

## Git and repository hygiene

All changes go through short-lived branches and pull requests; do not commit directly to `main`. Stage only issue-owned files, preserve pre-existing user changes, and run the issue's acceptance checks before requesting review. Keep `main` coherent and demoable. Before importing code or SDK examples, check license, provenance, dependency and runtime requirements, and whether a small adapter is sufficient.
