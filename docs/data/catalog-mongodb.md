# Catalog in MongoDB (optional backend)

Status: code and tests exist; **no Atlas cluster has been created.** The owner must create one and provide `MONGODB_URI`.
Without `MONGODB_URI` the API keeps using the file catalog (`assets/library/*.json`, `assets/profiles/`).

## Why
Scan- and sponsor-derived reconstruction files must not enter git. MongoDB (documents in `assets`, blobs in GridFS bucket
`models`) is the access-controlled home. Anyone with the right credentials can push; git never sees the files.

> **Sponsor-derived scan files go only into an access-controlled database the team controls.** Never a public cluster,
> never an open network allow-list on a database holding them, never a shared URI pasted in chat or committed.

## Owner: create the cluster (free tier)
1. Sign in at https://cloud.mongodb.com, create an Organization and Project, then **Create a cluster** and pick **M0 (Free)**. Choose a nearby region.
2. **Database Access** > Add New Database User > password auth. Create two users:
   - `catalog_owner`: built-in role `readWrite` on database `catalog` only (not "Atlas admin"). Used by the API and `assets.migrate`.
   - `catalog_upload` (for Davd): a **custom role** (Database Access > Custom Roles) with actions `find`, `insert`, `update` (and `createCollection`) on database `catalog`, and nothing else (no `remove`, `dropCollection`, `dropDatabase`). Then restrict the user to database `catalog`. Truly write-only is not possible because resuming an upload needs `find`, but he cannot delete or drop anything.
   - Use generated passwords and set an expiry for Davd's user (the event end).
3. **Network Access**: add the specific IP addresses that need access (your server, Davd's current public IP). Avoid `0.0.0.0/0`; if Davd's IP changes, edit the list. Remove entries afterwards.
4. **Connect** > Drivers: copy the `mongodb+srv://...` string for each user (the password is part of it).
5. Create indexes once as the owner: `MONGODB_URI=... uv run python -m assets.migrate --to mongo --dry-run`, then without `--dry-run`. This also seeds the 67 library assets and creates the unique `assetId` index that stops duplicate uploads.

## Run the API on Mongo
Set `MONGODB_URI` (and optionally `MONGODB_DB`, default `catalog`) in the shell or your untracked `.env`, then start the API as usual.
`GET /api/assets/{assetId}/model` streams the GLB/OBJ from GridFS (or from the file store when not on Mongo).
Backup/export: `python -m assets.migrate --from mongo --out ./catalog_backup` (keep that folder out of git: it holds the scans).

## Sharing the URI with Davd
Send **only** `catalog_upload`'s URI, privately: a password manager share, Signal, or in person. Not in git, issues, PRs, Slack channels or email threads that others can read. If it leaks, delete the user in Atlas and create a new one; rotating takes a minute.

## Davd: run the upload CLI on Windows
1. Install Python 3.12 from python.org (tick "Add to PATH"). In PowerShell: `py -m pip install pymongo`.
2. Get `tools\catalog_push.py` from the repo (or just that file).
3. Set the connection string for this window only (do not put it on the command line or in a file inside the repo):
   ```powershell
   $env:MONGODB_URI = Read-Host "Paste URI"      # paste the string you were sent
   ```
4. Dry run first, then the real push:
   ```powershell
   py tools\catalog_push.py C:\path\to\recon_files --profile davd --dry-run
   py tools\catalog_push.py C:\path\to\recon_files --profile davd
   ```
   Options: `--max-mb 50` (per-file cap), `--profile ID`. If it stops (network drop), run the same command again: already uploaded files are skipped (blobs are content-addressed; existing assets are never overwritten).
5. Close the window when done (the variable disappears).

What it accepts: `.glb .obj .ply`, `.png .jpg .jpeg .webp`, `.json`. A `.glb`/`.obj` without an asset JSON gets a **draft** Asset: name from the filename, dims from the mesh bounding box (`dimsStatus: estimated`, provenance `mesh bounding box`, metres and Y-up assumed), category `other`, status `draft`. A JSON with `assetId` is validated against the Asset schema and its `model.uri` / `imageRefs` are rewired to files in the same folder. It refuses other extensions, files over the cap, and anything that looks like a secret (`.env`, key files, connection strings). It prints a summary and exits non-zero if anything was refused or invalid.

## Size limits
Atlas M0 stores **512 MB total**, and GridFS blobs, metadata and indexes all count. Recommendations: keep the per-file cap at 50 MB (the default) or lower, keep total uploads under ~400 MB, and check **Atlas > Metrics > Logical Data Size** after big pushes. Decimate or compress meshes (Draco/meshopt GLB) before pushing; do not upload raw point clouds. Beyond the limit: upgrade the cluster (M10 paid tier, tens of GB), or keep heavy raw scans in team-controlled storage (access-controlled bucket or drive) and push only the optimised GLB plus metadata to Mongo.

## Verification status
Tests run against `mongomock` (no database needed). No real MongoDB instance was available when this was written (no Docker or `mongod`), so a live Atlas run is untested until the owner provides a cluster.
