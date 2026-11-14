#!/usr/bin/env python3
"""
fetch_and_bundle.py - one command: Matterport hackathon splat -> small AI-ready bundle.

  set MATTERPORT_API_KEY=...        (key = user)
  set MATTERPORT_API_TOKEN=...      (token = password)      # or put both in a .env next to where you run it
  python fetch_and_bundle.py                    # model zvKHR9DHNjJ, first 150 MB of the splat (~2.2M Gaussians)
  python fetch_and_bundle.py --mb 0             # whole file (553 MB)
  python fetch_and_bundle.py --model <sid>      # any model with splat == 'yes' in models_index.csv

Needs splat_to_bundle.py in the same folder. Deps: requests numpy pillow
"""
import argparse, json, os, subprocess, sys
from pathlib import Path
import requests

HERE = Path(__file__).resolve().parent
API = "https://api.matterport.com/api/models/graph"   # production only
SITE = os.environ.get("HACKATHON_SITE", "https://beta-app.matterport.com/2026-princeton-hackathon").rstrip("/")


def secret(name, required=True):
    v = os.environ.get(name)
    if not v and Path(".env").exists():
        for line in Path(".env").read_text().splitlines():
            k, _, val = line.partition("=")
            if k.strip() == name:
                v = val.strip().strip('"').strip("'")
    if not v and required:
        sys.exit(f"{name} is not set (env var or .env file).")
    return v


Q = """query M($id: ID!) { model(id: $id) {
  id name description visibility
  address { address locality administrativeArea postalCode }
  geolocation { lat long }
  generatedDescription { summary }
  propertyClassifications { classification type }
  floors { id label } panoLocations { id }
  rooms { classifications { label } dimensions(units: metric) { areaFloor width depth height } }
} }"""


def metadata(model):
    s = requests.Session()
    s.auth = (secret("MATTERPORT_API_KEY"), secret("MATTERPORT_API_TOKEN"))
    r = s.post(API, json={"query": Q, "variables": {"id": model}}, timeout=120)
    if r.status_code in (401, 403):
        sys.exit(f"Matterport rejected the keys (HTTP {r.status_code}). key=user, token=password, production host only.")
    r.raise_for_status()
    body = r.json()
    if body.get("errors"):
        sys.exit("GraphQL error: " + body["errors"][0].get("message", ""))
    m = body["data"]["model"]
    rooms = []
    for rm in m["rooms"]:
        c = rm.get("classifications") or []
        d = rm.get("dimensions") or {}
        rooms.append({"label": c[0]["label"] if c else None, "area_m2": d.get("areaFloor"),
                      "width_m": d.get("width"), "depth_m": d.get("depth"), "height_m": d.get("height")})
    return {
        "model_id": m["id"], "name": m["name"], "address": m["address"], "lat_lon": m["geolocation"],
        "capture_notes": m.get("description"),
        "ai_summary": (m.get("generatedDescription") or {}).get("summary"),
        "property_type": [p["classification"] for p in m["propertyClassifications"]],
        "floors": len(m["floors"]), "panoramas": len(m["panoLocations"]), "rooms": rooms,
        "note": "Splat is an aerial/exterior capture in a local frame (z up, metres), not aligned to north "
                "or to the interior room data.",
    }


def download(model, mb, dest):
    auth = (secret("HACKATHON_SITE_USER", False), secret("HACKATHON_SITE_PASSWORD", False))
    auth = auth if all(auth) else None
    url = f"{SITE}/resources/{model}/splat/splat.ply"
    headers = {"Range": f"bytes=0-{mb * 2**20 - 1}"} if mb else {}
    with requests.get(url, headers=headers, auth=auth, stream=True, timeout=300) as r:
        if r.status_code == 401:
            sys.exit("Site asks for a password: set HACKATHON_SITE_USER and HACKATHON_SITE_PASSWORD.")
        r.raise_for_status()
        done = 0
        with open(dest, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
                done += len(chunk)
                print(f"\r  {done / 1e6:7.1f} MB", end="", flush=True)
    print()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", default="zvKHR9DHNjJ")
    ap.add_argument("--mb", type=int, default=150, help="MB of the splat to download; 0 = all")
    ap.add_argument("--out", default=None, help="bundle folder (default bundle_<model>)")
    ap.add_argument("--up", default="z")
    a = ap.parse_args()
    out = Path(a.out or f"bundle_{a.model}")
    out.mkdir(parents=True, exist_ok=True)
    meta_path, ply = out / "meta.json", out / "splat_partial.ply"

    print("metadata ...")
    json.dump(metadata(a.model), open(meta_path, "w"), indent=1)
    print(f"splat ({'all' if not a.mb else str(a.mb) + ' MB'}) ...")
    download(a.model, a.mb, ply)
    print("bundling ...")
    subprocess.run([sys.executable, str(HERE / "splat_to_bundle.py"), str(ply), "--out", str(out),
                    "--meta", str(meta_path), "--up", a.up], check=True)
    ply.unlink()   # keep only the small bundle; re-run to refetch
    print("done:", out)


if __name__ == "__main__":
    main()
