# Start the local demo: the Python API on port 8000 (where the web app expects it) and the web app on port 3000.
#   powershell -ExecutionPolicy Bypass -File .\start-dev.ps1
# Each server opens in its own window; close a window (or press Ctrl+C in it) to stop that server.
# Keys and data stay local: the API reads the repo-root .env and the gitignored data/ folders.

$root = $PSScriptRoot

# Free the ports first, so an old API (from before a code change) is not the one the app talks to.
foreach ($port in 8000, 3000) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}

$api = @"
Set-Location '$root'
`$env:RENT_ARTIFACT_DIR = 'data/derived/forecasting/rent'
uv run --no-project --with-requirements services/api/requirements.txt --with python-dotenv --with numpy --with pandas --with scipy --with scikit-learn uvicorn services.api.app.main:app --port 8000
"@
Start-Process powershell -ArgumentList '-NoExit', '-Command', $api

$web = @"
Set-Location '$root\foreground'
npm run dev
"@
Start-Process powershell -ArgumentList '-NoExit', '-Command', $web

Write-Host "API  -> http://127.0.0.1:8000/docs"
Write-Host "Web  -> http://localhost:3000  (give it ~20 s on first start)"
