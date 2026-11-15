#!/usr/bin/env python3
"""
probe_geometry.py - List every 3D geometry variant Matterport will hand out for a model (meshes,
textures, point clouds, MatterPak, E57), with status, for the furnished model and its defurnished view.
Nothing is downloaded unless you pass --download.

  $env:MATTERPORT_API_KEY="..."; $env:MATTERPORT_API_TOKEN="..."
  python Code\\probe_geometry.py
  python Code\\probe_geometry.py --download        # save every variant that has a link, into assets_<sid>/geometry/
"""
import argparse, json, os, re, sys
from pathlib import Path

import requests

API = "https://api.matterport.com/api/models/graph"
FORMATS = ["obj", "dam", "glb", "gltf", "ply", "fbx", "e57", "xyz"]
RESOLUTIONS = ["50k", "500k", "1m", "2m", "full", "high", "low", "simple_planes"]


def secret(name):
    v = os.environ.get(name)
    if not v and Path(".env").exists():
        for line in Path(".env").read_text().splitlines():
            k, _, val = line.partition("=")
            if k.strip() == name:
                v = val.strip().strip('"').strip("'")
    if not v:
        sys.exit(f"{name} is not set")
    return v


S = requests.Session()
S.auth = (secret("MATTERPORT_API_KEY"), secret("MATTERPORT_API_TOKEN"))


def q(query, **v):
    r = S.post(API, json={"query": query, "variables": v}, timeout=120)
    r.raise_for_status()
    b = r.json()
    return b.get("data"), [e.get("message") for e in b.get("errors") or []]


def probe(mid, label):
    rows = []
    def add(kind, args, items, err):
        if err:
            rows.append((kind, args, "ERROR: " + err[0][:90], None)); return
        for x in items or []:
            rows.append((kind, args, f"{x.get('format')} / {x.get('resolution') or x.get('quality') or ''} / "
                                     f"{x.get('status')} / {x.get('filename')}", x.get("url")))
        if not items:
            rows.append((kind, args, "(none)", None))

    base = "id status filename format url"
    d, e = q('query($id:ID!){model(id:$id){assets{meshes{%s resolution}}}}' % base, id=mid)
    add("meshes", "no args", (((d or {}).get("model") or {}).get("assets") or {}).get("meshes"), e)
    for f in FORMATS:
        d, e = q('query($id:ID!,$f:[String!]){model(id:$id){assets{meshes(formats:$f){%s resolution}}}}' % base, id=mid, f=[f])
        items = (((d or {}).get("model") or {}).get("assets") or {}).get("meshes")
        if items or e:
            add("meshes", f"formats=[{f}]", items, e)
    for r in RESOLUTIONS:
        d, e = q('query($id:ID!,$r:[String!]){model(id:$id){assets{meshes(resolutions:$r){%s resolution}}}}' % base, id=mid, r=[r])
        items = (((d or {}).get("model") or {}).get("assets") or {}).get("meshes")
        if items or e:
            add("meshes", f"resolutions=[{r}]", items, e)
    for qual in ["low", "high"]:
        d, e = q('query($id:ID!){model(id:$id){assets{textures(qualities:[%s]){%s quality resolution}}}}' % (qual, base), id=mid)
        items = (((d or {}).get("model") or {}).get("assets") or {}).get("textures")
        add("textures", f"qualities=[{qual}] ({len(items or [])} files)", (items or [])[:3], e)
    d, e = q('query($id:ID!){model(id:$id){assets{resources{%s}}}}' % base, id=mid)
    add("resources", "all", (((d or {}).get("model") or {}).get("assets") or {}).get("resources"), e)
    for b in ["mp:matterpak", "mp:e57"]:
        d, e = q('query($id:ID!,$b:ID!){model(id:$id){bundle(id:$b){availability}}}', id=mid, b=b)
        rows.append(("bundle", b, (((d or {}).get("model") or {}).get("bundle") or {}).get("availability") or (e[0][:90] if e else "?"), None))
    print(f"\n=== {label} ({mid})")
    for kind, args, desc, url in rows:
        print(f"  {kind:9s} {args:28s} {desc}{'   [LINK]' if url else ''}")
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="zvKHR9DHNjJ")
    ap.add_argument("--download", action="store_true")
    a = ap.parse_args()
    d, _ = q('query($id:ID!){model(id:$id){view(type:"matterport.model.defurnished"){id}}}', id=a.model)
    targets = [(a.model, "furnished model")]
    vid = (((d or {}).get("model") or {}).get("view") or {}).get("id")
    if vid:
        targets.append((vid, "defurnished view"))
    found = []
    for mid, label in targets:
        found += [(label, r) for r in probe(mid, label)]
    if a.download:
        out = Path(f"assets_{a.model}") / "geometry"; out.mkdir(parents=True, exist_ok=True)
        seen = set()
        for label, (kind, args, desc, url) in found:
            if not url or url in seen:
                continue
            seen.add(url)
            name = re.sub(r"[^A-Za-z0-9._-]+", "_", f"{label}_{kind}_{desc.split(' / ')[-1] or 'file'}")[:150]
            print("downloading", name)
            with requests.get(url, stream=True, timeout=600) as r:   # signed link: no API auth header
                r.raise_for_status()
                with open(out / name, "wb") as f:
                    for c in r.iter_content(1 << 20):
                        f.write(c)
    print("\nPaste this output back; [LINK] marks variants you can download now.")


if __name__ == "__main__":
    main()
