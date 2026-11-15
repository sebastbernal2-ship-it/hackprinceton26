"""Fetch Vexcel ortho crops for candidate sites. Output (gitignored): data/derived/triage/aerial/images/<id>.jpg + <id>.meta.json.
Run from a checkout that has data/ (reads COSTAR_DIR); VEXCEL_API_KEY loaded from .env by dotenv, never printed."""
import csv, json, math, os, sys, time
from pathlib import Path
import requests
from dotenv import load_dotenv

ROOT = Path(os.environ.get("HP_ROOT", str(Path(__file__).resolve().parents[2])))
load_dotenv(ROOT / ".env")
KEY = os.environ["VEXCEL_API_KEY"]
URL = "https://api.vexcelgroup.com/v2/ortho/extract"
OUT = ROOT / "data/derived/triage/aerial/images"
HALF_M, PX = float(os.environ.get("HALF_M", 50)), int(os.environ.get("PX", 2000))


def fetch(pid, lat, lon):
    m = 111_320.0
    dlat, dlon = HALF_M / m, HALF_M / (m * math.cos(math.radians(lat)))
    w, e, s, n = lon - dlon, lon + dlon, lat - dlat, lat + dlat
    r = requests.post(URL, headers={"X-API-KEY": KEY}, timeout=300, json={
        "wkt": f"POLYGON(({w} {s},{e} {s},{e} {n},{w} {n},{w} {s}))", "srid": 4326,
        "layer": "urban,urban-r,wide-area,urban-g", "crop": "bounding_box", "image-format": "jpeg",
        "destination-dimensions": f"{PX},{PX}", "attribution": "false"})
    r.raise_for_status()
    (OUT / f"{pid}.jpg").write_bytes(r.content)
    hdr = {k: v for k, v in r.headers.items() if k.lower().startswith(("x-", "content-type"))}
    meta = {"bbox_lon_lat": [w, s, e, n], "half_width_m": HALF_M, "px": PX, "m_per_px": 2 * HALF_M / PX,
            "source": "Vexcel ortho/extract", "response_headers": hdr, "fetched": time.strftime("%Y-%m-%d")}
    (OUT / f"{pid}.meta.json").write_text(json.dumps(meta), encoding="utf-8")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    rows = list(csv.DictReader(open(ROOT / "data/normalized/costar/restaurant-site-candidates.csv", newline="", encoding="utf-8")))
    ok = bad = 0
    for r in rows:
        pid = r["property_id"]
        if (OUT / f"{pid}.jpg").exists():
            ok += 1; continue
        try:
            fetch(pid, float(r["latitude"]), float(r["longitude"])); ok += 1
        except Exception as ex:
            bad += 1; print("fail", type(ex).__name__, str(ex)[:80])
    print("ok", ok, "fail", bad)
