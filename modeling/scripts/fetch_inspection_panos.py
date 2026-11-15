#!/usr/bin/env python3
"""Fetch a few 360 strips for live inspection from already-accessible Matterport models (no paid content).

  python modeling/scripts/fetch_inspection_panos.py --sites 3 --panos 2
Model ids come from data/normalized/costar/operator-review-detail.csv (accessible-model rows only). Matterport keys
are read by modeling/download_assets.py (env or .env) and never printed. Output (gitignored):
data/raw/inspection_panos/<modelId>/pano<N>.jpg = skybox faces 1-4 (horizon ring) joined into one strip.
Prints only counts.
"""
import argparse, csv, io, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import download_assets as da  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]


def model_ids(limit, data_root):
    ids = []
    with open(Path(data_root) / "data/normalized/costar/operator-review-detail.csv", newline="") as f:
        for r in csv.DictReader(f):
            for m in (r.get("matterport_model_ids") or "").replace(";", ",").split(","):
                if m.strip() and m.strip() not in ids:
                    ids.append(m.strip())
    return ids[:limit]


def main():
    from PIL import Image
    import requests
    ap = argparse.ArgumentParser()
    ap.add_argument("--sites", type=int, default=3); ap.add_argument("--panos", type=int, default=2)
    ap.add_argument("--res", default="2k")
    ap.add_argument("--data-root", default=str(ROOT), help="checkout holding data/normalized (read only)")
    ap.add_argument("--out-root", default=str(ROOT))
    a = ap.parse_args()
    g, got, tried = da.Graph(), 0, 0
    for mid in model_ids(a.sites, a.data_root):
        tried += 1
        q = ('query P($id: ID!) { model(id: $id) { panoLocations { id skybox(resolution: "%s") { status children } } } }' % a.res)
        d = g(q, soft=True, id=mid)
        locs = (((d or {}).get("model") or {}).get("panoLocations") or [])
        locs = [p for p in locs if len(((p.get("skybox") or {}).get("children")) or []) >= 5]
        step = max(1, len(locs) // max(1, a.panos))
        out = Path(a.out_root) / "data/raw/inspection_panos" / mid
        for n, p in enumerate(locs[::step][: a.panos]):
            try:
                faces = [Image.open(io.BytesIO(requests.get(u, timeout=60).content)).convert("RGB")
                         for u in p["skybox"]["children"][1:5]]
                h = faces[0].height
                strip = Image.new("RGB", (sum(f.width for f in faces), h))
                x = 0
                for f in faces:
                    strip.paste(f, (x, 0)); x += f.width
                strip.thumbnail((4096, 1024))
                out.mkdir(parents=True, exist_ok=True)
                strip.save(out / f"pano{n}.jpg", quality=85)
                got += 1
            except Exception as e:
                print(f"pano failed: {type(e).__name__}")
    print({"sites_tried": tried, "strips_saved": got})


if __name__ == "__main__":
    main()
