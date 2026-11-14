#!/usr/bin/env python3
"""
download_assets.py - Download every visual the hackathon sources hand out for one model.
Nothing is generated or processed: files are saved exactly as served.

  Matterport Model API    preview image, every asset type the API exposes (floor plans, photos, meshes,
                          textures, clips, MatterPak ... discovered at run time by schema introspection),
                          panoramas (skybox faces) for the furnished AND defurnished views
  Hackathon site          Gaussian splat (exterior), its environment map, drone photos
  Vexcel (optional)       orthophoto of the lot (needs VEXCEL_API_KEY; Houston/LA only)

  $env:MATTERPORT_API_KEY="..."; $env:MATTERPORT_API_TOKEN="..."
  python Code\\download_assets.py                         # model Jxmnkp6KpJN, safe defaults
  python Code\\download_assets.py --everything            # + full splat, all drone photos, MatterPak, 4k panos
  python Code\\download_assets.py --list                  # show what exists and how big, download nothing

Big items are opt-in: --splat (~550 MB), --drone all (~20 MB per photo, hundreds of photos),
--matterpak (zip, can be GBs). Signed links expire after about an hour, so each section re-queries.
Re-running skips files already on disk. Everything lands in assets_<model>/ with a manifest.json.

Deps: requests
"""
import argparse, json, math, os, re, sys, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlparse

import requests

API = "https://api.matterport.com/api/models/graph"
SITE = os.environ.get("HACKATHON_SITE", "https://beta-app.matterport.com/2026-princeton-hackathon").rstrip("/")
VEXCEL = "https://api.vexcelgroup.com/v2"
DEFURNISHED = "matterport.model.defurnished"
ASSET_SUBFIELDS = ["id", "url", "filename", "format", "status", "width", "height", "resolution", "flags",
                   "provider", "quality", "type", "label", "name"]
FALLBACK_ASSET_FIELDS = ["floorplans", "photos", "meshes", "textures", "clips", "resources"]
MANIFEST = []


# ---------------------------------------------------------------- plumbing
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


class Graph:
    def __init__(self):
        self.s = requests.Session()
        self.s.auth = (secret("MATTERPORT_API_KEY"), secret("MATTERPORT_API_TOKEN"))

    def __call__(self, query, soft=False, **variables):
        r = self.s.post(API, json={"query": query, "variables": variables}, timeout=120)
        if r.status_code in (401, 403):
            sys.exit(f"Matterport rejected the keys (HTTP {r.status_code}): key = user, token = password, production only.")
        r.raise_for_status()
        body = r.json()
        if body.get("errors"):
            if soft:
                return None
            sys.exit("GraphQL error: " + body["errors"][0].get("message", ""))
        return body["data"]


def safe(name):
    return re.sub(r"[^A-Za-z0-9._-]+", "_", name)[:150] or "file"


def ext_from(url, default=".bin"):
    e = os.path.splitext(urlparse(url).path)[1]
    return e if 1 < len(e) <= 6 else default


def size_of(url, auth=None):
    try:
        r = requests.get(url, headers={"Range": "bytes=0-0"}, timeout=60, auth=auth, stream=True)
        cr = r.headers.get("Content-Range", "")
        return int(cr.split("/")[1]) if "/" in cr else int(r.headers.get("Content-Length", 0)) or None
    except Exception:
        return None


def download(url, path, source, auth=None, list_only=False, max_bytes=None):
    path = Path(path)
    entry = {"file": str(path), "source": source}
    if list_only:
        entry["bytes"] = size_of(url, auth)
        MANIFEST.append(entry); return
    if path.exists() and path.stat().st_size > 0:
        entry["bytes"] = path.stat().st_size; entry["status"] = "already on disk"
        MANIFEST.append(entry); return
    path.parent.mkdir(parents=True, exist_ok=True)
    headers = {"Range": f"bytes=0-{max_bytes - 1}"} if max_bytes else {}
    for attempt in range(3):
        try:
            with requests.get(url, headers=headers, auth=auth, stream=True, timeout=300) as r:
                if r.status_code == 401 and auth is None and url.startswith(SITE):
                    entry["status"] = "site asks for HACKATHON_SITE_USER / HACKATHON_SITE_PASSWORD"; break
                r.raise_for_status()
                tmp = path.with_suffix(path.suffix + ".part")
                with open(tmp, "wb") as f:
                    for chunk in r.iter_content(1 << 20):
                        f.write(chunk)
                tmp.replace(path)
            entry["bytes"] = path.stat().st_size; entry["status"] = "ok" if not max_bytes else f"first {max_bytes} bytes"
            break
        except Exception as e:
            entry["status"] = f"failed: {e}"[:200]; time.sleep(2)
    MANIFEST.append(entry)


def many(jobs, workers=8):
    with ThreadPoolExecutor(workers) as ex:
        list(ex.map(lambda j: download(*j[:3], **j[3]), jobs))


# ---------------------------------------------------------------- Matterport Model API
def model_basics(g, model):
    d = g("""query B($id: ID!) { model(id: $id) { id name visibility
      address { address locality administrativeArea postalCode } geolocation { lat long }
      image { url } } }""", id=model)["model"]
    return d


def asset_fields(g):
    """Every field of ModelAssets whose items carry a url, with the subfields that type actually has."""
    q = """{ __type(name: "ModelAssets") { fields { name args { name type { kind } }
              type { kind name ofType { kind name ofType { kind name ofType { name } } } } } } }"""
    d = g(q, soft=True)
    if not d or not d.get("__type"):
        print("schema introspection unavailable; using the known asset fields")
        return {f: ["url", "filename", "format", "status"] for f in FALLBACK_ASSET_FIELDS}
    out = {}
    for f in d["__type"]["fields"]:
        t = f["type"]
        while t.get("ofType"):                               # unwrap NON_NULL / LIST
            t = t["ofType"]
        tname = t.get("name")
        if not tname:
            continue
        sub = g('{ __type(name: "%s") { kind fields { name type { kind ofType { kind } } } possibleTypes { name } } }' % tname, soft=True)
        tt = (sub or {}).get("__type") or {}
        names = {x["name"] for x in (tt.get("fields") or []) if (x["type"]["kind"] in ("SCALAR", "ENUM") or
                                                                (x["type"].get("ofType") or {}).get("kind") in ("SCALAR", "ENUM"))}
        if "url" in names:
            out[f["name"]] = [s for s in ASSET_SUBFIELDS if s in names]
    return out


def model_assets(g, model, root, list_only):
    fields = asset_fields(g)
    print(f"asset types with files: {sorted(fields)}")
    jobs, found = [], {}
    for field, subs in fields.items():
        d = g('query A($id: ID!) { model(id: $id) { assets { %s { %s } } } }' % (field, " ".join(subs)), soft=True, id=model)
        items = (((d or {}).get("model") or {}).get("assets") or {}).get(field)
        if items is None:
            found[field] = "query failed (needs arguments?)"; continue
        items = items if isinstance(items, list) else [items]
        urls = [x for x in items if x and x.get("url")]
        found[field] = f"{len(urls)} with links / {len(items)} listed"
        for i, x in enumerate(urls):
            if field == "resources" and "matterpak" in (x.get("format") or x.get("filename") or "").lower():
                continue                                     # MatterPak handled separately (opt-in, big)
            name = x.get("filename") or f"{field}_{x.get('id') or i}"
            if not os.path.splitext(name)[1]:
                name += ext_from(x["url"])
            extra = "_".join(str(x[k]) for k in ("format", "provider", "resolution") if x.get(k) not in (None, ""))
            jobs.append((x["url"], root / "matterport" / field / safe(f"{i:03d}_{extra}_{name}" if extra else f"{i:03d}_{name}"),
                         f"Model API assets.{field}", {"list_only": list_only}))
    print("  " + "\n  ".join(f"{k}: {v}" for k, v in sorted(found.items())))
    many(jobs)
    return found


def panoramas(g, model, root, res, list_only):
    view = (g('query V($id: ID!) { model(id: $id) { view(type: "%s") { id } } }' % DEFURNISHED, soft=True, id=model)
            or {}).get("model", {}).get("view")
    views = {"furnished": model}
    if view:
        views["defurnished"] = view["id"]
    meta = {}
    for name, vid in views.items():
        q = 'query P($id: ID!) { model(id: $id) { panoLocations { id label position { x y z } rotation { x y z w } skybox(resolution: "%s") { status children } } } }'
        d = g(q % res, soft=True, id=vid)
        if d is None:
            print(f"  {name}: resolution {res} not available, trying 2k")
            d = g(q % "2k", id=vid)
        jobs = []
        for p in d["model"]["panoLocations"]:
            meta.setdefault(p["id"], {"id": p["id"], "label": p.get("label"), "position": p.get("position"),
                                      "rotation": p.get("rotation")})
            for k, url in enumerate((p.get("skybox") or {}).get("children") or []):
                jobs.append((url, root / "matterport" / f"panoramas_{name}" / f"{safe(str(p.get('label')))}_{p['id']}_face{k}.jpg",
                             f"Model API panoLocations.skybox ({name}, {res})", {"list_only": list_only}))
        print(f"  {name}: {len(d['model']['panoLocations'])} panos, {len(jobs)} faces")
        many(jobs)
    (root / "matterport").mkdir(parents=True, exist_ok=True)
    json.dump({"note": "skybox faces: 0 up, 1-4 horizon turning right, 5 down; position in metres, model frame, z up",
               "views": views, "panos": list(meta.values())}, open(root / "matterport" / "panoramas.json", "w"), indent=1)


def matterpak(g, model, root, list_only):
    d = g("""query M($id: ID!) { model(id: $id) { bundle(id: "mp:matterpak") { availability }
             assets { resources(format: "matterpak") { status filename url } } } }""", soft=True, id=model)
    m = (d or {}).get("model") or {}
    pak = next((x for x in (m.get("assets") or {}).get("resources") or [] if x.get("url")), None)
    if not pak:
        print(f"  MatterPak: no download link (availability: {(m.get('bundle') or {}).get('availability')})")
        return
    download(pak["url"], root / "matterport" / "matterpak" / safe(pak.get("filename") or f"{model}_matterpak.zip"),
             "Model API MatterPak", list_only=list_only)


# ---------------------------------------------------------------- hackathon site
def site(model, root, want_splat, drone, list_only):
    auth = (secret("HACKATHON_SITE_USER", False), secret("HACKATHON_SITE_PASSWORD", False))
    auth = auth if all(auth) else None
    r = requests.get(f"{SITE}/api/models/{model}", timeout=60, auth=auth)
    if r.status_code != 200 or "json" not in r.headers.get("content-type", ""):
        print(f"  hackathon site: no splat/drone data for {model} (HTTP {r.status_code}) - only 232 models have it")
        return
    cat = r.json()
    (root / "hackathon_site").mkdir(parents=True, exist_ok=True)
    json.dump(cat, open(root / "hackathon_site" / "catalog.json", "w"), indent=1)
    res = lambda p: f"{SITE}/resources/{model}/{p}"
    photos = cat.get("images") or []
    print(f"  splat {cat.get('splatBytes', 0) / 1e6:.0f} MB, {len(photos)} drone photos")
    jobs = [(res(f"splat/envmap/{f}.jpg"), root / "hackathon_site" / "envmap" / f"{f}.jpg", "hackathon site envmap",
             {"auth": auth, "list_only": list_only}) for f in ["px", "nx", "py", "ny", "pz", "nz"]]
    if want_splat:
        jobs.append((res("splat/splat.ply"), root / "hackathon_site" / "splat.ply", "hackathon site splat (exterior)",
                     {"auth": auth, "list_only": list_only}))
    if drone != "none" and photos:
        pick = photos if drone == "all" else photos[:: max(1, len(photos) // int(drone))]
        jobs += [(res(f"drone-imagery/{p}"), root / "hackathon_site" / "drone" / safe(p), "hackathon site drone photo",
                  {"auth": auth, "list_only": list_only}) for p in pick]
    many(jobs, workers=6)


# ---------------------------------------------------------------- Vexcel
def vexcel(lat, lon, root, half_m, list_only):
    key = secret("VEXCEL_API_KEY", False)
    if not key:
        print("  Vexcel: VEXCEL_API_KEY not set, skipped"); return
    if list_only:
        MANIFEST.append({"file": str(root / "vexcel" / "ortho.jpg"), "source": "Vexcel ortho/extract", "bytes": None}); return
    m = 111_320.0
    dlat, dlon = half_m / m, half_m / (m * math.cos(math.radians(lat)))
    w, e, s, n = lon - dlon, lon + dlon, lat - dlat, lat + dlat
    r = requests.post(f"{VEXCEL}/ortho/extract", headers={"X-API-KEY": key}, timeout=300, json={
        "wkt": f"POLYGON(({w} {s},{e} {s},{e} {n},{w} {n},{w} {s}))", "srid": 4326,
        "layer": "urban,urban-r,wide-area,urban-g", "crop": "bounding_box", "image-format": "jpeg",
        "destination-dimensions": "2000,2000", "attribution": "false"})
    if r.status_code in (401, 403):
        print(f"  Vexcel: HTTP {r.status_code} (bad key, or outside Houston/LA)"); return
    r.raise_for_status()
    p = root / "vexcel" / "ortho.jpg"; p.parent.mkdir(parents=True, exist_ok=True); p.write_bytes(r.content)
    json.dump({"bbox_lon_lat": [w, s, e, n], "half_width_m": half_m}, open(root / "vexcel" / "ortho.json", "w"), indent=1)
    MANIFEST.append({"file": str(p), "source": "Vexcel ortho/extract", "bytes": len(r.content), "status": "ok"})


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", default="Jxmnkp6KpJN")
    ap.add_argument("--out")
    ap.add_argument("--res", default="2k", choices=["low", "high", "2k", "4k"], help="panorama face size")
    ap.add_argument("--splat", action="store_true", help="download the full exterior splat.ply (~550 MB)")
    ap.add_argument("--drone", default="12", help="drone photos: none, all, or N evenly spaced (default 12)")
    ap.add_argument("--matterpak", action="store_true", help="download the MatterPak zip if it has a link")
    ap.add_argument("--vexcel-half", type=float, default=70, help="half-width of the Vexcel square, metres")
    ap.add_argument("--everything", action="store_true", help="--splat --drone all --matterpak --res 4k")
    ap.add_argument("--list", action="store_true", help="list what exists (with sizes), download nothing")
    a = ap.parse_args()
    if a.everything:
        a.splat, a.drone, a.matterpak, a.res = True, "all", True, "4k"
    root = Path(a.out or f"assets_{a.model}")
    g = Graph()

    m = model_basics(g, a.model)
    print(f"{m['name']} ({m['id']}, {m['visibility']}) - {(m.get('address') or {}).get('address')}")
    root.mkdir(parents=True, exist_ok=True)
    json.dump(m, open(root / "model.json", "w"), indent=1)
    if (m.get("image") or {}).get("url"):
        download(m["image"]["url"], root / "matterport" / f"preview{ext_from(m['image']['url'], '.jpg')}",
                 "Model API model.image", list_only=a.list)

    print("Model API assets ..."); model_assets(g, a.model, root, a.list)
    print(f"Panoramas ({a.res}) ..."); panoramas(g, a.model, root, a.res, a.list)
    if a.matterpak:
        print("MatterPak ..."); matterpak(g, a.model, root, a.list)
    print("Hackathon site ..."); site(a.model, root, a.splat, a.drone, a.list)
    geo = m.get("geolocation") or {}
    if geo.get("lat") is not None:
        print("Vexcel ..."); vexcel(float(geo["lat"]), float(geo["long"]), root, a.vexcel_half, a.list)

    json.dump(MANIFEST, open(root / ("listing.json" if a.list else "manifest.json"), "w"), indent=1)
    total = sum(x.get("bytes") or 0 for x in MANIFEST)
    bad = [x for x in MANIFEST if str(x.get("status", "")).startswith(("failed", "site asks"))]
    print(f"\n{len(MANIFEST)} files, {total / 1e6:.0f} MB {'listed' if a.list else 'on disk'} -> {root}/"
          + (f"; {len(bad)} failed (see manifest.json)" if bad else ""))


if __name__ == "__main__":
    main()
