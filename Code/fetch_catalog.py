#!/usr/bin/env python3
r"""
fetch_catalog.py - download a furniture catalogue for Code/walk.html from Poly Haven (polyhaven.com).

Every Poly Haven asset is CC0 (public domain: free for any use, no attribution required). The models come in real
scale (metres) as glTF with PBR textures; walk.html lights them with the room's own 360 photo so they match the scan.

    python Code\fetch_catalog.py                 # the curated set below, 2k textures
    python Code\fetch_catalog.py --res 1k        # lighter textures
    python Code\fetch_catalog.py --ids sofa_02 ArmChair_01

Writes assets_catalog/ (gitignored):
    <id>/<id>.gltf + .bin + textures, <id>/thumb.png
    catalog.json   [{id, name, category, size_m [x, y, z] as Poly Haven lists them, file, thumb, license, authors}]
Skips files that are already there.
"""
import argparse, json, sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets_catalog"
API = "https://api.polyhaven.com"
UA = {"User-Agent": "hackprinceton-walkthrough-catalog/1.0"}

# picked for a restaurant / lounge / home; category = the tab it shows under in walk.html
CURATED = {
    "Sofas": ["Sofa_01", "sofa_02", "sofa_03"],
    "Armchairs": ["ArmChair_01", "modern_arm_chair_01", "mid_century_lounge_chair", "GreenChair_01", "Ottoman_01"],
    "Chairs": ["dining_chair_02", "WoodenChair_01", "painted_wooden_chair_01", "bar_chair_round_01",
               "plastic_monobloc_chair_01", "gallinera_chair", "wooden_stool_01", "metal_stool_01"],
    "Tables": ["round_wooden_table_01", "round_wooden_table_02", "wooden_table_02", "dining_table",
               "small_wooden_table_01", "CoffeeTable_01", "coffee_table_round_01", "modern_coffee_table_01",
               "industrial_coffee_table", "side_table_01"],
    "Storage": ["ClassicConsole_01", "modern_wooden_cabinet", "vintage_cabinet_01", "wooden_display_shelves_01", "Shelf_01"],
    "Outdoor": ["outdoor_table_chair_set_01"],
}


def get(url):
    r = requests.get(url, headers=UA, timeout=60)
    r.raise_for_status()
    return r


def save(url, path):
    if path.exists() and path.stat().st_size > 0:
        return 0
    path.parent.mkdir(parents=True, exist_ok=True)
    data = get(url).content
    path.write_bytes(data)
    return len(data)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--res", default="2k", choices=["1k", "2k", "4k"])
    ap.add_argument("--ids", nargs="*", help="only these Poly Haven ids (category 'Other')")
    a = ap.parse_args()
    wanted = {"Other": a.ids} if a.ids else CURATED
    OUT.mkdir(exist_ok=True)
    old = {c["id"]: c for c in json.loads((OUT / "catalog.json").read_text())} if (OUT / "catalog.json").exists() else {}
    total, items = 0, []
    for cat, ids in wanted.items():
        for pid in ids:
            try:
                info = get(f"{API}/info/{pid}").json()
                files = get(f"{API}/files/{pid}").json()
                g = files["gltf"].get(a.res) or files["gltf"][sorted(files["gltf"])[0]]
                g = g["gltf"]
                d = OUT / pid
                name = Path(g["url"].split("?")[0]).name
                total += save(g["url"], d / name)
                for rel, inc in g.get("include", {}).items():           # .bin + textures, paths relative to the .gltf
                    total += save(inc["url"], d / rel)
                total += save(f"https://cdn.polyhaven.com/asset_img/thumbs/{pid}.png?width=256&height=256", d / "thumb.png")
                dims = [round(x / 1000, 3) for x in info.get("dimensions", [])]
                items.append({"id": pid, "name": info.get("name", pid), "category": cat, "size_m": dims,
                              "file": f"/assets_catalog/{pid}/{name}", "thumb": f"/assets_catalog/{pid}/thumb.png",
                              "license": "CC0 (Poly Haven)", "authors": list((info.get("authors") or {}).keys()),
                              "source": f"https://polyhaven.com/a/{pid}"})
                print(f"   {cat:10s} {pid:28s} ok")
            except Exception as e:                                       # noqa
                print(f"   {cat:10s} {pid:28s} FAILED: {e}", file=sys.stderr)
    merged = {**old, **{i["id"]: i for i in items}}
    (OUT / "catalog.json").write_text(json.dumps(list(merged.values()), indent=1))
    print(f"   {len(items)} models, {total / 1e6:.0f} MB downloaded -> {OUT / 'catalog.json'}")


if __name__ == "__main__":
    main()
