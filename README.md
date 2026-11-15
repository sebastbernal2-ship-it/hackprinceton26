# hackprinceton26

## Run

The demo is `foreground_final`. You need Node 20 or newer. Download the packages before starting the app:

```bash
cd foreground_final
npm ci
```

`npm ci` installs every dependency in `package-lock.json`, including Next.js, and copies the Matterport viewer assets into `public/matterport`. Then, from the repo root:

```bash
npm run dev
```

That starts the app at http://localhost:3000.

Keys live in `foreground_final/.env.local` (gitignored). If that file is missing, the start script copies `.env.example` and the app still starts. Fill in `MATTERPORT_API_KEY`, `MATTERPORT_API_TOKEN`, `MATTERPORT_SDK_KEY`, `NEXT_PUBLIC_MATTERPORT_SDK_KEY` (same value as the SDK key), `VEXCEL_API_KEY`, `ANTHROPIC_API_KEY`, and `GEMINI_API_KEY`, then restart. `COSTAR_KIT_DIR` is only needed to rebuild data, not to click through the demo.

From inside the app folder, after `npm ci`: `npm run dev`.

## Repository map

- `foreground_final/` - the Foreground app to run (final frontend).
- `foreground/` - Next.js UI (imported from `origin/frontend_dev`, by the frontend teammate).
- `modeling/` - Matterport 3D pipeline (imported from `origin/Model-testing`, by the modeling teammate). Its README is stale.
- `data/` - evidence pipeline (observed / derived / estimated / unknown).
- `data_scripts/` - one-off data scripts (`house_report.py`).
- `services/api/` - to be added.
- `docs/` - product scope, architecture, data workstreams.
