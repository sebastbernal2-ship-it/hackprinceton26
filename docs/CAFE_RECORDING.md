# Cafe demo recording: base case

Rehearsed end to end on branch `takeover/rehearse` with the real API, `next dev` and a real Chromium (Playwright), 2026-11-15. This runbook covers `foreground/` only. Afnan's `final_frontend` branch (`foreground_final/`) is a different app; do not mix them.

## What this path is, and is not
- The `cafes` shortcut shows three hand-picked Matterport amenity-cafe scans. They are **not listings**: rent, lease area and availability are unknown. A scan or a linked CoStar building does not prove a marketed suite.
- Every dollar figure is a scenario range, not a quote. Observed = a vendor list price seen on a public page; estimated = the neutral band; fit-out per sq ft is an analyst assumption.
- The area, budget and equipment counts you type are your assumptions. Say so on camera.

## Start (two terminals, repo root)
API, read-only against the local data (point `D` at the checkout holding `data/normalized` and `data/derived`; never commit that data):

```bash
D=/path/to/hackprinceton/data
COSTAR_NORMALIZED_DIR=$D/normalized/costar TRIAGE_DERIVED_DIR=$D/derived/triage LINEAGE_DIR=$D/derived/lineage \
DERIVED_DIR=$D/derived SITE_PHOTO_DIR=$D/derived/site-photos \
uv run --no-project --with-requirements services/api/requirements.txt uvicorn services.api.app.main:app --host 127.0.0.1 --port 8000
```

Web:

```bash
cd foreground && npm ci && API_URL=http://127.0.0.1:8000 npm run dev -- --hostname 127.0.0.1
```

Check `curl localhost:3000/api/health` returns `dataAvailable: true`. Env var names only (never print values): `API_URL` (web to API), `COSTAR_NORMALIZED_DIR`, `TRIAGE_DERIVED_DIR`, `LINEAGE_DIR`, `DERIVED_DIR`, `SITE_PHOTO_DIR`, `SCAN_ASSETS_DIR` (local scan downloads), `MATTERPORT_SDK_KEY` (optional, SDK features only).

## Editable cafe reconstruction (the walk)
The three cafe walk exports were built on this machine from the existing read-only Matterport access (nothing bought or unlocked) and live OUTSIDE the repo, in `~/code/_work/recon-data/` (`assets_<id>/walk/meta.json`, `mesh.bin`, pieces; 750 MB; sponsor-derived, never commit). Point the web app at them:

```bash
cd foreground && SCAN_ASSETS_DIR=$HOME/code/_work/recon-data API_URL=http://127.0.0.1:8000 npm run dev -- --hostname 127.0.0.1
# check: curl "localhost:3000/walk3d/available?model=JAnuRsaVo9M"  ->  {"walk":true}
```

Rebuild or add a model (from `recon-data`, with the `.env` symlinked there; Python deps in `modeling/requirements.txt`): `matterpak.py --model <id>`, `shell_from_furnished.py --model <id> --force`, `segment_furniture.py --model <id> --tol 0.10`, `walk_export.py --model <id>`. Skipped here: `download_assets`, `pano_pipeline`, `fetch_catalog`, so there are no panorama scan spots, a moved piece leaves a hole, and the furniture catalogue key (C) is not set up.

What was verified (headless Chromium, API on test fixtures): the walk loads for all three models; one placement change registered on The Preserve and the Houston Cafe and Quantify showed the layout counts (about 20 chairs and 5 stools counted as 25 seats on The Preserve). On Bayou Cafe the scripted pick-up hit no piece, so a change was not confirmed there: rehearse it by hand. A scripted mouse click on **Continue to Quantify** after carrying a piece did not register (a DOM click did): check it by hand with a real mouse before filming. Visual quality is rough: torn tree and plant geometry from the raw MatterPak mesh, furniture segmented by geometry with rough labels, some chairs fused. Pick the angle accordingly.

## Exact clicks (verified)
Use **Bayou Café** (Houston; building record 8035301) or **The Preserve** (Los Angeles; 11104240). The middle Houston "Café" has no linked building record: it works, but rent and running costs show as unknown.

1. Intake: type `cafes`, Enter. The shortlist shows 3 cafes labelled "Demo data". Photos read "No photo on file" unless local scan downloads exist (none on this machine; the 404s on `/api/scan-photo` in the console are that).
2. Click **View Info** on Bayou Café. Show the CoStar building facts (building type Apartments, 737,837 sq ft, "Lease rates in this building: None on record"). Say these describe the whole building, not the cafe. The Evidence section says the demo cards are not built: every factor unknown, not negative.
3. Layout section (scroll down): type an **area to lay out** (for example `1200`; your assumption), click **Load cafe reference kit**. Seven catalog pieces are placed on an assumed rectangle. Placement checks use illustrative footprints; it is not a fit determination.
4. Click **Scope out your vision**. If `SCAN_ASSETS_DIR` points at the walk exports (section above) the editable walk loads; otherwise (no local walk export) the page loads the **read-only Matterport tour** with the banner "Read-only Matterport tour ... furniture edits and layout counts are unavailable". Do not say you edited the scan. Click **Continue without a layout**.
5. Quantify: "Layout cost" prices the pieces from step 3. Verified for the 7-piece kit at 1,200 sq ft: 4 pieces priced (espresso machine $3,549, grinder $599, brewer $234, convection oven $2,639 = $7,021), fit-out $72,000 to $450,000, build-out with 10-20% contingency $158,265 to $461,000 (p5 to p95). Three pieces (display case, speed rack, work table) are listed as **Unpriced, not free** and excluded. "Total cost" below shows only rent and running costs; build-out is explicitly excluded there (priced above). Rent uses the Houston kit median, which is derived, not market rent.
6. Re-plan (same screen): enter budget `200000`: P(over budget) 87%. Click **Save as baseline**, set area to `800`: 56%, with the baseline 87% shown beside it. Cleaner flip across 50%: budget `250000`, 1,200 sq ft gives 74%, 800 sq ft gives 27% (API values, 4 priced pieces). Use the "-" beside a piece to change the equipment: removing the espresso machine at 800 sq ft and $200k moved 56% to 52%. The saved brief is just "cafes"; it states no budget, seats or size, and the page says so.
7. Act checklist (below Re-plan): landlord questions (availability, rent, permitted use, utilities), records (certificate of occupancy, permits, as-builts), inspections, and one itemized-quote request per unpriced piece. Tick one on camera.

## Build the cafe evidence cards
Without this the Evidence section on View Info says the demo cards are not built. Everything below is local and gitignored (`models_index.csv`, `data/derived/`); never commit it.

1. Create `models_index.csv` at the repo root, columns `sid,lat,lon,address,city,state,postal_code`, one row per demo model (`w2JcUVybv9c`, `xVKH13z5MJ8`, `JAnuRsaVo9M`). Take lat/lon/address from one read-only Matterport GraphQL query per model (`model(id) { address { address locality administrativeArea postalCode } geolocation { lat long } }`, using the `Graph` helper in `modeling/download_assets.py`, which reads the keys from `.env`; do not print them). Leave out any model whose location is not returned; do not guess coordinates.
2. Build the cards (network: Open-Meteo, BLS, NCES/Urban Institute, state traffic; BLS may fail and stay unknown):

```bash
uv run --python 3.12 --no-project --with requests --with pandas --with numpy python data/build_demo_factor_cards.py --pace 1.0
```

   It writes `data/derived/demo/factor-cards.csv`. Start the API as above and check `curl localhost:8000/api/demo/JAnuRsaVo9M/factors` returns about 25 cards, each with status, source and limits. Observed 2026-11-15: spatial interior and traffic (Caltrans/TxDOT AADT) observed; schools derived; climate estimated/derived; income estimated; labor supply (BLS), crime, hazards and the rest unknown.
3. View Info on a cafe now lists the cards under Evidence.

## What to skip
- **Open 3D Tour** and **Ask Fio**: not rehearsed.
- **Add equipment from photos** and "Trace Matterport rooms in 3D": need live credentials; not part of the base case.
- The **Agent** panel at the bottom of the shortlist: its recorded replay is the earlier **Italian restaurant with gelato** scenario (the button now says so). No verified cafe replay was recorded (the cafe scans are not candidates the agent's tools can inspect, and the local model branch is not in this checkout). Do not narrate it as a cafe run.
- Seats: the cost model has no seat-dependent cost, so seats are not a replan input here.
- Candidate-listing panels (triage, inspection, structure, projections, 36-month finance) are hidden for scans on purpose.

## Fallbacks
- Tour iframe blank: say the tour is a third-party embed, go **Back to property** and show the layout cost with the tour omitted.
- Cost service unreachable: panels say "Cannot say"; nothing is shown as $0.
- No area entered: the layout panel says "Cannot say: enter the area" and fit-out reads "Unknown (enter an area)".

## Sample / unverified
- Evidence cards for the demo scans were not built (`data/build_demo_factor_cards.py` needs `models_index.csv` and network).
- Scan photos need local `assets_<modelId>/matterport/` downloads; none here.
- Prices: only observed vendor list prices and neutral-band estimates from `data/financial/catalog.json`; install, freight, permits and repairs are excluded.
- The restaurant flow's default build-out still uses the earlier Italian/gelato equipment set; the cafe path avoids it (`buildout=layout`).

## Production build
`cd foreground && npm ci && npm run build` succeeds here. Fonts are now self-hosted through the `geist` npm package; the previous `next/font/google` fetched Google Fonts at build time, which fails offline or in a sandbox. One Turbopack warning about `app/api/agent/route.ts` tracing the whole project is non-fatal.
