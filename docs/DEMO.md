# Demo runbook

The current demo concept is an independent cafe in Houston or Los Angeles. David selected cafe because the kit has broader food-service reconstruction evidence. Candidate property and historic food-service records are context, not proof of cafe suitability. Menu, on-site baking, service style, seating, budget, and equipment remain unconfirmed. The existing coffee/bakery profile is an illustrative reference only.

The verification below is historical: its fixture-based run and UI click-through predate the current cafe concept. The checked-in replay trace is still an Italian restaurant with gelato; do not present it as a cafe run. The mock API is fake data, not the video demo.

## Record-Triage-led demo (3 minutes)
Historical verification recorded 2026-11-14 against the real local kit (API on :8000, `next dev` on :3000 proxying `/api`). No `ANTHROPIC_API_KEY` was set in that run, so the agent used REPLAY mode. Setup then used gitignored `data/raw|normalized|derived`; build lineage with `python -m triage.lineage.build --kit data/raw/costar/full-kit --candidates data/normalized/costar/restaurant-site-candidates.csv --out data/derived/lineage`; run the API from the repo root with `uvicorn --app-dir services/api app.main:app --port 8000`.

Local derived artifacts are machine-specific; aerial and structure responses depend on the selected property ID. Missing aerial data returns HTTP 404; missing structure snapshot returns 503, and a listing absent from a built snapshot returns 404. The UI labels these as unavailable/unknown. Before recording, verify the exact selected property and current responses.

Build aerial data only when Vexcel access and a CUDA-capable GPU are available. Run from the repository root; set `HP_ROOT` to this checkout because older scripts default to a developer-specific path. Fetch writes raw crops, detect runs OWLv2 on the GPU, and build emits per-property results:

```powershell
$env:HP_ROOT = (Get-Location).Path
python -m triage.aerial.fetch
python -m triage.aerial.detect
python -m triage.aerial.build
```

Structure snapshots use keyless public sources but require the local CoStar kit and candidate CSV:

```powershell
python -m structure.fetch_sources --kit data/raw/costar/full-kit --cands data/normalized/costar/restaurant-site-candidates.csv
```

These steps are optional for the demo. If outputs are absent, narrate the fields as unknown; do not describe unavailable data as zero or a negative finding.

| Time | Show | What to say (and not say) |
|---|---|---|
| 0:00-0:20 | State the scenario: an independent cafe evaluating a candidate space. Say menu, on-site preparation/baking, seats, and budget are still to be confirmed. | Food-service history and current listing status are not proof of suitability. |
| 0:20-1:00 | Open a property and show Record Triage (`/api/triage/property/{id}`): CoStar value vs scan evidence, status per field. The earlier cohort run reported clear-height lower bounds for 49 of 65 candidates, up from 15, and 6 of 46 tested floors conflicted. Recheck these figures live before use. | "Blank stays unknown unless evidence supports a fill; scan-derived dimensions are room-scope lower bounds, not CoStar facts." |
| 1:00-1:35 | Show aerial and lineage panels only when their local data exists for the selected site. | Vehicle counts have a small hand-labelled validation sample; do not call them verified site capacity. Historic food-service tenancy is context, not cafe demand or a prediction. |
| 1:35-2:10 | Show the cafe reference layout, clearly labeled illustrative. | Coffee/bakery equipment and any oven assume a menu and on-site baking that the operator has not confirmed. It is not a measured product model or fit determination. Prices remain unconfirmed/unknown. |
| 2:10-2:40 | Show structure/climate evidence only after confirming current route responses for the selected property. | Distinguish retrieved hazard/climate evidence from structural integrity; the app does not certify a building's stability. |
| 2:40-3:00 | End with unresolved diligence: confirm menu/preparation model, utilities and equipment, exact suite-to-scan match, and permitted use. | The finance panel is a generic illustrative scenario, not a cafe unit-economics model; omit its outputs unless assumptions are updated and shown. |

### Real / stub / missing (merged branch)
| Piece | Status | How checked |
|---|---|---|
| Triage reconciliation over the kit (summary, property, queue) | Real, from a prior Matterport fetch cached locally | HTTP 200 on summary/property/queue; cohort numbers above read from the API |
| Matterport room-label fills | Real but partial (lower bounds, scan scope) | summary statuses |
| Vexcel aerial vehicle count | Local per-property output, if built; estimated range with small validation set (n=15, 27% relative CV error) | `/api/aerial/{id}` 200 when that listing JSON exists; otherwise 404 |
| Aerial rooftop units / stalls / docks / roof | Unknown by design | field status `unknown` |
| Lineage + presence | Real, built from the kit (about 2 s) | build ran; routes 200; only 22 of 65 candidates have kit food history |
| Agent | Existing replay is an older Italian + gelato run; current cafe run not recorded or verified | Do not use the existing replay as the cafe story |
| Reskin / concepts | Real engine, assumption-labelled profiles; prices unknown so cost delta unknown | `/api/concepts` and `/api/reskin` 200 |
| Structure | Local snapshot, machine-specific | `/api/structure/{id}` 200 when the snapshot includes that listing; 503 if the snapshot is absent, 404 if the ID is absent |
| Finance simulate | Real Monte Carlo on stated assumptions; blocked without rent | 200, both cases |
| CoStar extended / market | Real, read-only kit data | `/api/costar/market` and `/extended` 200 |
| Asset catalog | Real list, procedural placeholder meshes, no sponsor assets | `/api/assets` 200 |
| Mock API (`npm run mock-api`) | FAKE numbers, for UI work only | not used in this smoke test |
| Live Matterport tour | Needs SDK key; not exercised | not run |

## 0. Prerequisites (local, uncommitted data)
- Python 3.12 (`.python-version`), `uv`, Node 20+.
- Gitignored local data under `data/normalized/costar/` (CoStar candidate and evidence CSVs); `data/raw/` for the signage adapter and inspection images. Get it from a teammate or the sponsor kit; never commit it.
- Env var names (values live in `.env` / `foreground/.env.local`; never print or commit them):
  - `MATTERPORT_SDK_KEY` - web app, Matterport Showcase tour (fallback when a scan has no walk export). Without it that tour does not load.
  - `ANTHROPIC_API_KEY` - only `inspection/vision.py` (vision findings).
  - `MATTERPORT_API_KEY` / `MATTERPORT_API_TOKEN` - `modeling/` scripts and model checks only; not needed for the demo.
  - `COSTAR_PROPERTY_JSONL` - signage adapter only (path to the local CoStar property JSONL).
- Optional: `API_URL` (web to API, default `http://127.0.0.1:8000`), `COSTAR_NORMALIZED_DIR`, `SITE_PHOTO_DIR`, `INSPECTION_DIR`, `INSPECTION_FIXTURE`, `MODELS_AVAILABLE`, `NEXT_PUBLIC_DEMO_FALLBACK`.
- Optional local listing photos: place licensed/approved files at `data/derived/site-photos/<propertyId>/photo-1.jpg` (hero) and/or `aerial.jpg`; set `SITE_PHOTO_DIR` to use another local directory. This folder is gitignored. The API serves only present files at `/api/site-photos/<propertyId>/<filename>`; do not commit sponsor images without redistribution approval.

## 1. Prepare evidence (once; network, no keys)
```bash
python3 data/run_factor_adapters.py --pace 1.0       # about 10 min; writes data/derived/<adapter>/observations.json
python3 data/factors/crime_safety_la/adapter.py      # crime, separate entry point
python3 data/build_factor_cards.py --all-candidates  # cards for all candidate sites (default is the 18-site review queue)
```
Section 1 needs network and the local CoStar data, so it was not re-run in the 2026-11-14 pass; its coverage figures in sections 4 and 5 come from an earlier live run. Adapters cache responses under `data/derived/<adapter>/cache`, so reruns are cheap.

## 2. Start everything
```bash
# API on port 8000, from repo root. If Windows or another process already uses 8000, stop it or set API_URL and the API --port to the same free port.
# Without real data, point it at the fixtures:
#   export COSTAR_NORMALIZED_DIR=services/api/tests/fixtures
uv run --no-project --with-requirements services/api/requirements.txt uvicorn services.api.app.main:app --port 8000
# Web on port 3000
cd foreground && npm ci    # keys come from the repo-root .env: MATTERPORT_SDK_KEY, MATTERPORT_API_KEY, MATTERPORT_API_TOKEN
npm run dev
# No API available? Fake-data contract mock: npm run mock-api
```
Check `curl localhost:8000/api/health` returns `dataAvailable: true` (checked: `{"status":"ok","dataAvailable":true,"modelsAvailable":false}`). `curl localhost:3000/api/health` returns the same through the Next proxy. `npm run mock-api` also binds port 8000, so stop the real API first. With no key the web app still starts; only the Matterport tour fails to load.

## 3. Script (the 7 steps)
1. Intake: open http://localhost:3000 and answer "What are you looking for?" (cafe in Houston; confirm menu, whether food is prepared/baked on site, seats, area, and budget with the operator). Refine questions are a deterministic stub.
2. Shortlist: Discover shows at most 3 matches (the fixtures return 2, both `UNKNOWN`; real data may return more) with factor cards. Point at observed versus unknown. "Evidence readiness" is not a fit score.
3. Inspect: open one property; show CoStar facts, factor cards (status, source, as-of), and the Matterport tour if the site has a model (6 of 65 do).
4. Project: `GET /api/property/{id}/projections` returns "Models are not available; unknown, not zero" and an empty list unless `MODELS_AVAILABLE=1` and model output is wired in. Narrate as pending. The layout panel is an illustrative visual; `POST /api/assess` is deterministic and returns a build-out cost interval (see step 7).
5. Quantify: `GET /api/property/{id}/costs` returns itemized low/expected/high lines, status `estimated`, source `estimate://neutral-...` (placeholder catalog, not vendor quotes).
6. Act: `python -m inspection.run --images <dir> --plan plan.json --out data/derived/inspection` feeds `/api/property/{id}/inspection` (with `INSPECTION_FIXTURE=1` the API serves labelled `[SAMPLE]` findings instead). The app builds a deterministic verification checklist from findings, unknown factors and unknown costs (`foreground/app/lib/act.ts`, `act-checklist.tsx`). Landlord negotiation asks are not generated.
7. Re-plan: use the Projections panel's “Revise the space requirement” control to change the maximum area and rerun the hard-constraint screen. The API also accepts `POST /api/replan` changes to profile constraints and assumptions. Fixture-level API behavior is covered by `services/api/tests/test_assess_flow.py`; rehearse the UI against the selected local dataset before recording.

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
| Re-plan UI | Present: revise maximum area and rerun constraints | `Projections` component calls `POST /api/replan`; rehearse on the selected local dataset |
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
