# Cafe demo recording: base case

This runbook describes `foreground/` on the demo branch. Afnan's separate `final_frontend` branch runs `foreground_final/`; it has a different UI and setup. Choose one app for the recording and rehearse its exact path before filming.

## Start the main demo app

Use Python 3.12, uv, and Node 20 or newer. From the repository root, start the API in one terminal:

```bash
uv run --no-project --with-requirements services/api/requirements.txt uvicorn services.api.app.main:app --host 127.0.0.1 --port 8000
```

In a second terminal:

```bash
cd foreground
npm ci
npm run dev -- --hostname 127.0.0.1
```

Open http://localhost:3000. Check `/api/health` through the web app and confirm `dataAvailable` before recording a candidate-listing flow. Keep keys in local environment files; see `foreground/README.md`. Scan tours, image generation and live agents need their respective credentials and network access. Local scan exports and photos are machine-specific.

## Rehearse the exact cafe path

1. Enter `cafes` as the first answer. The shortcut displays three hand-selected Matterport amenity cafe scans. These are **not listings**; availability, asking rent and suite size are unknown. Their scan-to-building links do not verify a marketed suite.
2. Choose the agreed reconstructed cafe and open its tour or **View Info**, then **Scope out your vision**. Confirm the intended scan and the local 3D export actually load on the recording machine. If they don't, use a verified Matterport tour; don't imply a reconstruction is available.
3. Demonstrate one small layout change and continue to **Quantify**. Explain which pieces are recognized estimates and which are unpriced. For demo scans without a linked CoStar record, the cost panel is unavailable; a building link does not establish a listed suite.
4. Show a concrete next question: confirm exact suite identity, permitted use, utilities and dimensions with the broker or owner. Present proposed placements as illustrative until measured fit and circulation are validated.
5. If showing the agent, use a verified cafe run. The checked-in replay is from an earlier Italian/gelato scenario and should be labeled as such; do not narrate it as a cafe run.

Before recording, capture a backup walkthrough of the selected scene and rehearse each click. The upload/profile catalog flow should only be shown once its upload, review and placement are verified on this checkout. Keep source media and sponsor assets local and out of Git.

## Afnan's separate frontend

The `final_frontend` branch contains `foreground_final/`; its lockfile at commit `199385d` is out of sync, so `npm ci` fails. Use `npm install` in a separate checkout to preview it. In that branch the normal agent replay path requires the client to request replay (for example `?replay=1`); `FOREGROUND_REPLAY=1` alone only applies in tests. Verify that the recorded query matches the cafe story before using it. Its live agent requires `ANTHROPIC_API_KEY`. Read that branch's README for the remaining keys.
