# Demo runbook

Goal: a teammate can run the 7-step demo from `docs/product/mvp.md` in about 10 minutes. Commands in sections 2 and 3 were executed as written on 2026-11-14 against the synthetic fixtures in `services/api/tests/fixtures` (not the real CoStar data); anything not run is marked unverified. All evidence is context for a human; nothing here is a ranking, a forecast, or proof about hidden defects.

## 0. Prerequisites (local, uncommitted data)
- Python 3.11+, `uv`, Node 20+.
- Gitignored local data under `data/normalized/costar/` (CoStar candidate and evidence CSVs); `data/raw/` for the signage adapter and inspection images. Get it from a teammate or the sponsor kit; never commit it.
- Env var names (values live in `.env` / `foreground/.env.local`; never print or commit them):
  - `NEXT_PUBLIC_MATTERPORT_SDK_KEY` - web app, Matterport 3D tour. Without it the tour does not load.
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
cd foreground && npm ci && cp .env.example .env.local    # set NEXT_PUBLIC_MATTERPORT_SDK_KEY
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
