# Windows setup

Use Python 3.12 for the API. The pinned pydantic version does not provide a Python 3.14 wheel; Node's version does not select Python. Install Python 3.12 alongside other versions, or let uv install it. `.python-version` pins 3.12 for uv; explicitly select it for commands below. If adding project metadata, set `requires-python = ">=3.12,<3.13"` until the dependencies are validated on other versions.

From the repository root in PowerShell:

```powershell
uv run --no-project --python 3.12 --with-requirements services/api/requirements.txt uvicorn services.api.app.main:app --port 8000
```

To verify the API imports in a clean uv environment from `services/api`, put the repository root on Python's search path (the requirements path is relative to this directory):

```powershell
Set-Location services/api
$env:PYTHONPATH = (Resolve-Path ../..).Path
uv run --no-project --python 3.12 --with-requirements requirements.txt python -c "import app.main"
Set-Location ../..
```

On Linux/macOS, use `PYTHONPATH="$(cd ../.. && pwd)" uv run --no-project --python 3.12 --with-requirements requirements.txt python -c 'import app.main'` from `services/api`.

If port 8000 is in use, stop the process using it or select a free port with `--port 8001` and configure the frontend proxy to match. On Windows, `Get-NetTCPConnection -LocalPort 8000` identifies the owning process.

## Optional local evidence

`/api/aerial/{id}` returns 404 if that listing's aerial analysis has not been built. `/api/structure/{id}` returns 503 when the structure snapshot has not been built; a missing listing in an existing snapshot returns 404. These are unavailable data, not zero values. Commands below run from the repository root and require the local CoStar kit and candidate CSV. Aerial fetch additionally requires Vexcel access; detection needs the OWLv2 dependencies and a CUDA GPU. Supply the Vexcel key in the environment or root `.env`, without committing it. The scripts use the checkout root by default; optionally override it in PowerShell with `$env:HP_ROOT = (Get-Location).Path` or in a POSIX shell with `export HP_ROOT="$PWD"`.

```powershell
uv run --no-project --python 3.12 --with requests --with python-dotenv python -m triage.aerial.fetch
uv run --no-project --python 3.12 --with numpy --with pillow --with torch --with transformers python -m triage.aerial.detect
uv run --no-project --python 3.12 python -m triage.aerial.build
uv run --no-project --python 3.12 python -m structure.fetch_sources --kit data/raw/costar/full-kit --cands data/normalized/costar/restaurant-site-candidates.csv
```

The same commands and forward-slash paths work in a POSIX shell. Matterport checks optionally load the repository-root `.env` when `python-dotenv` is installed; existing environment variables take precedence.
