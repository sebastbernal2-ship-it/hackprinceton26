# Demo runbook

Goal: a teammate can run the 7-step demo from `docs/product/mvp.md` in about 10 minutes. Commands in sections 2 and 3 were executed as written on 2026-11-14 against the synthetic fixtures in `services/api/tests/fixtures` (not the real CoStar data); anything not run is marked unverified. All evidence is context for a human; nothing here is a ranking, a forecast, or proof about hidden defects.

## Record-Triage-led demo (3 minutes)
Verified on branch `rt/merged` on 2026-11-14 against the real local kit (API on :8000, `next dev` on :3000 proxying `/api`). No `ANTHROPIC_API_KEY` is set, so the agent runs in REPLAY mode and says so. Setup: gitignored `data/raw|normalized|derived` present; build lineage once with `python -m triage.lineage.build --kit data/raw/costar/full-kit --candidates data/normalized/costar/restaurant-site-candidates.csv --out data/derived/lineage`; run the API from the repo root with `uvicorn --app-dir services/api app.main:app --port 8000`.

| Time | Show | What to say (and not say) |
|---|---|---|
| 0:00-0:35 | Dashboard, Mission control: click "Replay recorded run" (about 15 s paced stream, 61 events: plans, tool calls, 3 parallel inspector subagents, findings, actions, cited brief). | "This is a recorded trace of the agent, labelled REPLAY. Plan, tools, parallel inspectors, every number cites a tool result." Do not call it live. |
| 0:35-1:15 | Open a property, "Record triage" panel (`/api/triage/property/{id}`): CoStar value vs scan vs aerial, status per field. Cohort numbers from `/api/triage/summary`: clear height filled 23.1% (15 of 65) before, 75.4% (49 of 65) after, all scan-derived lower bounds (room scope, low/medium confidence); 6 of 46 tested floors conflict. | "Blank stays blank unless the scan can fill it, and filled values are labelled derived, not CoStar." The top-3 shortlist sites show mostly "cannot say / unverified" (no aerial for them); that is the honest output, not a bug. |
| 1:15-1:45 | Aerial (`/api/aerial/{id}`) and lineage/presence (`/api/lineage/{id}`, `/api/presence/{id}`, `/api/lineage/summary`). | Vehicles in crop: estimated range (cross-validated MAE, n=15 hand-labelled crops). Rooftop units, parking stalls, docks: unknown on purpose (validation failed or no stall-level data). Lineage: observed CoStar tenancy spells, tenant names anonymized; market prior is "exploratory, not a per-site prediction". Presence is a kit-listed lower bound, not foot traffic. |
| 1:45-2:15 | Reskin: "Turn Italian trattoria / pizzeria into Indian restaurant" (`POST /api/reskin {fromConcept:"italian",toConcept:"indian",seats:40}`): removed 6, added 8, adjacency and feasibility notes, new layout. | The cost delta is UNKNOWN: all 11 delta lines have no sourced price (`totalsStatus: unknown`, nothing counted as 0). Do not claim a dollar delta. The layout is a reference layout generated from the concept profile, not this space's real layout. |
| 2:15-2:40 | Structure and climate screen. | Without `data/derived/structure` (needs `python -m structure.fetch_sources`, which calls public FEMA/USGS/NOAA endpoints; NOT run in this verification) the screen says "unknown, not low". The expansion graph runs on a labelled sample plan. |
| 2:40-3:00 | 36-month restaurant scenario (`POST /api/finance/simulate`). | Without a stated rent it returns `status: blocked` with `rent_monthly` unknown. With an explicit assumption (`monthlyRentAssumption: 9000`, 40 seats) it returned `simulated`, 10,000 draws, `pCashShortfall` 0.9366 (an output of stated assumptions). "Scenario analysis, not a forecast", simulated local ledger, nothing sent to Nessie. |

### Real / stub / missing (merged branch)
| Piece | Status | How checked |
|---|---|---|
| Triage reconciliation over the kit (summary, property, queue) | Real, from a prior Matterport fetch cached locally | HTTP 200 on summary/property/queue; cohort numbers above read from the API |
| Matterport room-label fills | Real but partial (lower bounds, scan scope) | summary statuses |
| Vexcel aerial vehicle count | Real, 65 crops, estimated range with small validation set (n=15, 27% relative CV error) | `/api/aerial/{id}` 200; validation figures are builder-reported, not re-run |
| Aerial rooftop units / stalls / docks / roof | Unknown by design | field status `unknown` |
| Lineage + presence | Real, built from the kit (about 2 s) | build ran; routes 200; only 22 of 65 candidates have kit food history |
| Agent | REPLAY of a recorded local run; SCRIPTED fixture also in repo; live needs `ANTHROPIC_API_KEY` or `LOCAL_LLM_BASE_URL` | replay stream 200 (61 events); live run not exercised |
| Reskin / concepts | Real engine, assumption-labelled profiles; prices unknown so cost delta unknown | `/api/concepts` and `/api/reskin` 200 |
| Structure | Code and tests real; local snapshot missing, so screen shows unknown | `/api/structure/{id}` 404 "snapshot unavailable" |
| Finance simulate | Real Monte Carlo on stated assumptions; blocked without rent | 200, both cases |
| CoStar extended / market | Real, read-only kit data | `/api/costar/market` and `/extended` 200 |
| Asset catalog | Real list, procedural placeholder meshes, no sponsor assets | `/api/assets` 200 |
| Mock API (`npm run mock-api`) | FAKE numbers, for UI work only | not used in this smoke test |
| Live Matterport tour | Needs SDK key; not exercised | not run |

## 0. Prerequisites (local, uncommitted data)
- Python 3.11+, `uv`, Node 20+.
- Gitignored local data under `data/normalized/costar/` (CoStar candidate and evidence CSVs); `data/raw/` for the signage adapter and inspection images. Get it from a teammate or the sponsor kit; never commit it.
- Env var names (values live in `.env` / `foreground/.env.local`; never print or commit them):
  - `MATTERPORT_SDK_KEY` - web app, Matterport Showcase tour (fallback when a scan has no walk export). Without it that tour does not load.
  - `ANTHROPIC_API_KEY` - only `inspection/vision.py` (vision findings).
  - `MATTERPORT_API_KEY` / `MATTERPORT_API_TOKEN` - `modeling/` scripts and model checks only; not needed for the demo.
  - `COSTAR_PROPERTY_JSONL` - signage adapter only (path to the local CoStar property JSONL).
  - Optional: `API_URL` (web to API, default `http://127.0.0.1:8000`), `COSTAR_NORMALIZED_DIR`, `INSPECTION_DIR`, `INSPECTION_FIXTURE`, `MODELS_AVAILABLE`, `NEXT_PUBLIC_DEMO_FALLBACK`.

## 1. Prepare evidence (once; network, no keys)
```bash
python3 data/run_factor_adapters.py --pace 1.0       # about 10 min; writes data/derived/<adapter>/observations.json
python3 data/factors/crime_safety_la/adapter.py      # crime, separate entry point
python3 data/build_factor_cards.py --all-candidates  # cards for all candidate sites (default is the 18-site review queue)
```
Section 1 needs network and the local CoStar data, so it was not re-run in the 2026-11-14 pass; its coverage figures in sections 4 and 5 come from an earlier live run. Adapters cache responses under `data/derived/<adapter>/cache`, so reruns are cheap.

## 2. Start everything
```bash
# API on port 8000, from repo root. Without real data, point it at the fixtures:
#   export COSTAR_NORMALIZED_DIR=services/api/tests/fixtures
uv run --no-project --with-requirements services/api/requirements.txt uvicorn services.api.app.main:app --port 8000
# Web on port 3000
cd foreground && npm ci    # keys come from the repo-root .env: MATTERPORT_SDK_KEY, MATTERPORT_API_KEY, MATTERPORT_API_TOKEN
npm run dev
# No API available? Fake-data contract mock: npm run mock-api
```
Check `curl localhost:8000/api/health` returns `dataAvailable: true` (checked: `{"status":"ok","dataAvailable":true,"modelsAvailable":false}`). `curl localhost:3000/api/health` returns the same through the Next proxy. `npm run mock-api` also binds port 8000, so stop the real API first. With no key the web app still starts; only the Matterport tour fails to load.

## 3. Script (the 7 steps)
1. Intake: open http://localhost:3000 and answer "What are you looking for?" (Italian restaurant with gelato, Houston, about 40 seats, a budget). Refine questions are a deterministic stub.
2. Shortlist: Discover shows at most 3 matches (the fixtures return 2, both `UNKNOWN`; real data may return more) with factor cards. Point at observed versus unknown. "Evidence readiness" is not a fit score.
3. Inspect: open one property; show CoStar facts, factor cards (status, source, as-of), and the Matterport tour if the site has a model (6 of 65 do).
4. Project: `GET /api/property/{id}/projections` returns "Models are not available; unknown, not zero" and an empty list unless `MODELS_AVAILABLE=1` and model output is wired in. Narrate as pending. The layout panel in the app is the visual stand-in; `POST /api/assess` is deterministic and does return a build-out cost interval (see step 7).
5. Quantify: `GET /api/property/{id}/costs` returns itemized low/expected/high lines, status `estimated`, source `estimate://neutral-...` (placeholder catalog, not vendor quotes).
6. Act: `python -m inspection.run --images <dir> --plan plan.json --out data/derived/inspection` feeds `/api/property/{id}/inspection` (with `INSPECTION_FIXTURE=1` the API serves labelled `[SAMPLE]` findings instead). The app builds a deterministic verification checklist from findings, unknown factors and unknown costs (`foreground/app/lib/act.ts`, `act-checklist.tsx`). Landlord negotiation asks are not generated.
7. Re-plan: change the budget so the cost interval crosses it. There is no UI for this (the stepper has the label only); use the API. Checked on fixtures: `curl -XPOST localhost:8000/api/assess -H 'content-type: application/json' -d '{"listingId":900001,"budget":70000}'` gives `pOverBudgetBuildout` 0.4154 with build-out p5/p50/p95 of 59955/68746/77990. `POST /api/replan` with `{"listingId":900001,"assess":{"budget":90000},"profileChange":{"budget":60000}}` returns which sites changed constraint status and why.

## 4. Status: real / stub / missing
| Piece | Status | How checked |
|---|---|---|
| 65 candidate sites (41 Houston, 24 LA), local CoStar data | Real | rows counted |
| Factor adapters over 65 sites | Real, live run | section 5 |
| Factor cards (`--all-candidates`) | Real | 2232 cards, 65 sites |
| API `/health`, `/matches`, `/property/{id}` | Real, reads local CSVs | ran uvicorn, HTTP 200 |
| API `/costs` | Real code, neutral estimated prices | ran, returned lines |
| API `/inspection` | Real code, empty until an inspection run exists | returned `mode: none` |
| API `/projections` | Stub (unknown) | ran |
| API `/assess`, `/replan` | Real, deterministic cost scenario; unknown inputs stay unknown | ran on fixtures |
| `/next-question`, `/tour-agent` | Stub, deterministic | `services/api/app/stubs.py` |
| Web app (`foreground/`) | `next dev` starts, serves 200, proxies `/api/*` | ran; UI click-through not checked |
| Matterport tour | Needs SDK key and a model; 6 of 65 sites have a model association | cards |
| `modeling/` 3D pipeline | Separate scripts, not wired to the API | unverified |
| Vexcel aerial | Missing (unknown for all 65) | cards |
| Verification checklist | Real, deterministic, in the app | `foreground/app/lib/act.ts` |
| Landlord asks | Missing | no code found |
| Re-plan UI | Missing (API exists) | no UI code found |
| Ranking, revenue forecast | Intentionally absent | policy |

## 5. Factor coverage over the 65 sites (live run)
Sites with at least one observed, derived or estimated card; the rest are unknown:

| Factor | With evidence | Unknown |
|---|---|---|
| income_demographics, natural_hazards, schools_education, traffic_access | 65 | 0 |
| climate_weather | 62 | 3 (Open-Meteo retries exhausted) |
| crime_safety | 55 | 10 |
| property_market | 45 | 20 |
| signage_visibility | 42 | 23 |
| labor_supply | 41 | 24 (BLS keyless daily request limit reached) |
| spatial_interior | 6 | 59 |
| aerial_site, costs_timeline, infrastructure_permits, mobility_tourism, operator_preferences | 0 | 65 |

Unknown means no evidence retrieved, not a negative. Counts show retrieval coverage, not quality; each card carries its own limitations.

## 6. Fallbacks
- Labor supply: rerun after the BLS daily limit resets to fill the 24 unknown sites.
- The API reads local files only, so a network failure during the demo does not matter once `factor-cards.csv` is built.
- Without the Matterport key, show factor cards and costs and say the tour needs the key.
