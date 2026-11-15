# Foreground

Next.js (App Router) web app: intake, Discover, property evidence, and the Matterport 3D tour.
It holds no data of its own. It calls the Python API (`services/api`, FastAPI, port 8000) through same-origin `/api/*`,
which `next.config.ts` proxies to `API_URL` (default `http://127.0.0.1:8000`).

This is a newer Next.js than most docs describe; read `node_modules/next/dist/docs/` before changing framework-level code.

## Run
```bash
npm ci
# keys: MATTERPORT_SDK_KEY, MATTERPORT_API_KEY, MATTERPORT_API_TOKEN go in the repo-root .env (never commit it)
npm run dev                       # http://localhost:3000
```
Without the real API, run the contract mock in another terminal: `npm run mock-api`
(`MOCK_EMPTY=1 npm run mock-api` simulates "no data loaded"). The mock serves fake test data only.

Checks: `npm run lint`, `npm run build`.

## API contract used
`POST /api/matches`, `GET /api/property/{listingId}`, `POST /api/next-question`, `POST /api/tour-agent`, `GET /api/health`.
The typed client is `app/lib/api.ts`; types are in `app/lib/matches.ts`.

## Evidence rules in the UI
- "Evidence readiness" is the share of looked-for facts that are verified. It is not a fit or quality score and is not used to rank.
- Factor cards show status: observed, derived, estimated, or unknown. Unknown means no evidence found, not a negative.
- If the API reports `dataAvailable: false` (the local candidate registry is not built), Discover says "No data loaded". It shows no placeholder spaces.
- `NEXT_PUBLIC_DEMO_FALLBACK=1` opts into hand-typed sample spaces (`app/lib/demo-matches.ts`), clearly labelled Demo. Leave it unset otherwise.
- The refine questions (`app/lib/refine.ts`) are still a local deterministic stub; the API contract has no endpoint for them.

## Secrets
Only `MATTERPORT_SDK_KEY` reaches the browser bundle (via `env` in next.config.ts). `MATTERPORT_API_KEY` and `MATTERPORT_API_TOKEN` stay server-side. Never expose other keys.
