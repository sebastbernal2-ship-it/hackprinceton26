#!/usr/bin/env python3
r"""
fetch_tiles.py - download what Matterport's own viewer renders: the 3D Tiles tilesets (full-quality textured mesh)
for the furnished model AND its defurnished view, plus Matterport's AI object annotations (labelled furniture).

These are the GraphQL fields Showcase itself requests (found in the SDK bundle):
    model.assets.tilesets { status tilesetVersion url urlTemplate validUntil tilesetDepth tilesetPreset }
    model.objectAnnotations { id label confidence region anchorPosition ... }

Run from the repo root (keys come from .env):
    python modeling/fetch_tiles.py                  # list + download everything
    python modeling/fetch_tiles.py --list           # only show what exists
    python modeling/fetch_tiles.py --max-tiles 50   # quick test

Output: assets_<sid>/tiles/<furnished|defurnished>/...  (tileset.json + every tile, same relative paths)
        assets_<sid>/object_annotations.json
        assets_<sid>/tiles/report.txt
Signed links expire (validUntil), so the script re-queries the API whenever a download returns 403.
"""
import argparse, json, os, re, sys, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests

API = "https://api.matterport.com/api/models/graph"
TYPE_FRAG = "kind name ofType{kind name ofType{kind name ofType{kind name}}}"


def secret(name):
    v = os.environ.get(name)
    if not v and Path(".env").exists():
        for line in Path(".env").read_text().splitlines():
            k, _, val = line.partition("=")
            if k.replace("$env:", "").strip() == name:
                v = val.strip().strip('"').strip("'")
    if not v:
        sys.exit(f"{name} is not set (.env or environment)")
    return v


S = requests.Session()
# credentials are attached in main(), after argument parsing, so --help works without keys


def gql(query, **v):
    r = S.post(API, json={"query": query, "variables": v}, timeout=120)
    r.raise_for_status()
    b = r.json()
    return b.get("data"), [e.get("message", "") for e in b.get("errors") or []]


def base_type(t):
    while t and t.get("ofType"):
        t = t["ofType"]
    return t


def type_fields(name):
    d, _ = gql('{__type(name:"%s"){fields{name args{name type{%s}} type{%s}}}}' % (name, TYPE_FRAG, TYPE_FRAG))
    return {f["name"]: f for f in (((d or {}).get("__type") or {}).get("fields") or [])}


def selection(type_name, depth=0, seen=()):
    """All scalar fields of a type, recursing one level into small object types (vectors, ids)."""
    out = []
    for n, f in type_fields(type_name).items():
        bt = base_type(f["type"])
        if f["args"] and any(a["type"]["kind"] == "NON_NULL" for a in f["args"]):
            continue
        if bt["kind"] in ("SCALAR", "ENUM"):
            out.append(n)
        elif bt["kind"] == "OBJECT" and depth < 2 and bt["name"] not in seen and bt["name"] not in ("Model", "Floor", "Room", "Layer"):
            sub = selection(bt["name"], depth + 1, seen + (type_name,))
            if sub:
                out.append(n + "{" + " ".join(sub) + "}")
        elif bt["kind"] == "OBJECT" and bt["name"] in ("Floor", "Room", "Layer"):
            out.append(n + "{id}")
    return out


def get_tilesets(mid):
    fields = type_fields("ModelAssets")
    if "tilesets" not in fields:
        return None, "ModelAssets has no 'tilesets' field for this API key"
    sel = " ".join(selection(base_type(fields["tilesets"]["type"])["name"])) or "status url urlTemplate validUntil"
    d, e = gql("query($id:ID!){model(id:$id){assets{tilesets{%s}}}}" % sel, id=mid)
    if e and not d:
        return None, e[0]
    return (((d or {}).get("model") or {}).get("assets") or {}).get("tilesets"), (e[0] if e else None)


def get_annotations(mid):
    mf = type_fields("Model")
    if "objectAnnotations" not in mf:
        return None, "Model has no 'objectAnnotations' field for this API key"
    sel = " ".join(selection(base_type(mf["objectAnnotations"]["type"])["name"]))
    d, e = gql("query($id:ID!){model(id:$id){objectAnnotations{%s}}}" % sel, id=mid)
    return ((d or {}).get("model") or {}).get("objectAnnotations"), (e[0] if e else None)


# ------------------------------------------------------------------ tiles
PLACEHOLDER = re.compile(r"(<file>|\{\{?\s*(?:file|filename|path)\s*\}?\}|%7Bfile%7D|\$\{file\})", re.I)


class Fetcher:
    def __init__(self, mid, label, ts, out, refresh):
        self.mid, self.label, self.ts, self.out, self.refresh = mid, label, ts, out, refresh

    def url_for(self, rel):
        tpl = self.ts.get("urlTemplate")
        if tpl and PLACEHOLDER.search(tpl):
            return PLACEHOLDER.sub(rel, tpl)
        root = self.ts.get("url") or tpl
        u = urlparse(root)
        joined = urljoin(root.split("?")[0], rel)
        return joined + ("?" + u.query if u.query and "?" not in rel else "")

    def get(self, url, tries=3):
        for i in range(tries):
            r = requests.get(url, timeout=120)
            if r.status_code == 403 and i == 0:          # signed link expired: refresh
                self.ts = self.refresh() or self.ts
                continue
            if r.ok:
                return r.content
            time.sleep(1)
        raise RuntimeError(f"HTTP {r.status_code} for {url[:120]}")


def tile_uris(node, acc):
    c = node.get("content") or {}
    for k in ("uri", "url"):
        if c.get(k):
            acc.append(c[k])
    for cc in node.get("contents") or []:
        if cc.get("uri"):
            acc.append(cc["uri"])
    for ch in node.get("children") or []:
        tile_uris(ch, acc)
    return acc


def download_tileset(f, max_tiles, log):
    root_url = f.ts.get("url") or f.url_for("tileset.json")
    log(f"   root: {urlparse(root_url).path[-60:]}")
    data = f.get(root_url)
    (f.out / "tileset.json").write_bytes(data)
    queue, done, saved = [("tileset.json", json.loads(data))], set(), 0
    sizes = {}
    while queue:
        rel_json, tj = queue.pop()
        base = os.path.dirname(rel_json)
        uris = tile_uris(tj.get("root", {}), [])
        jobs = []
        for u in uris:
            rel = os.path.normpath(os.path.join(base, u.split("?")[0])).replace("\\", "/")
            if rel in done:
                continue
            done.add(rel)
            if max_tiles and saved + len(jobs) >= max_tiles:
                break
            jobs.append(rel)

        def one(rel):
            b = f.get(f.url_for(rel))
            p = f.out / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(b)
            return rel, b
        with ThreadPoolExecutor(8) as ex:
            for rel, b in ex.map(one, jobs):
                saved += 1
                ext = os.path.splitext(rel)[1].lower()
                sizes[ext] = sizes.get(ext, 0) + len(b)
                if ext == ".json":                      # external child tileset
                    queue.append((rel, json.loads(b)))
        if max_tiles and saved >= max_tiles:
            log(f"   stopped at --max-tiles {max_tiles}")
            break
    log(f"   {saved} files: " + ", ".join(f"{k or '?'} {v/1e6:.1f} MB" for k, v in sizes.items()))
    return saved


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", default="zvKHR9DHNjJ")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--max-tiles", type=int, default=0)
    a = ap.parse_args()
    S.auth = (secret("MATTERPORT_API_KEY"), secret("MATTERPORT_API_TOKEN"))
    root = Path(f"assets_{a.model}")
    (root / "tiles").mkdir(parents=True, exist_ok=True)
    lines = []

    def log(s=""):
        print(s, flush=True); lines.append(s)

    d, _ = gql('query($id:ID!){model(id:$id){view(type:"matterport.model.defurnished"){id}}}', id=a.model)
    vid = (((d or {}).get("model") or {}).get("view") or {}).get("id")
    targets = [("furnished", a.model)] + ([("defurnished", vid)] if vid else [])

    for label, mid in targets:
        log(f"\n=== {label} ({mid})")
        ts_list, err = get_tilesets(mid)
        if err:
            log(f"   tilesets: {err}")
        for i, ts in enumerate(ts_list or []):
            log(f"   tileset {i}: " + ", ".join(f"{k}={ts.get(k)}" for k in ("status", "tilesetVersion", "tilesetDepth", "tilesetPreset", "validUntil") if k in ts)
                + f"   url={'yes' if ts.get('url') else 'no'} urlTemplate={'yes' if ts.get('urlTemplate') else 'no'}")
            if a.list or not (ts.get("url") or ts.get("urlTemplate")):
                continue
            out = root / "tiles" / (label if i == 0 else f"{label}_{i}")
            out.mkdir(parents=True, exist_ok=True)
            refresh = lambda mid=mid, i=i: (get_tilesets(mid)[0] or [None] * (i + 1))[i]
            try:
                download_tileset(Fetcher(mid, label, ts, out, refresh), a.max_tiles, log)
                log(f"   saved to {out}")
            except Exception as e:
                log(f"   download failed: {e}")
        anns, err = get_annotations(mid)
        if err:
            log(f"   objectAnnotations: {err}")
        if anns is not None:
            labels = {}
            for o in anns:
                labels[o.get("label")] = labels.get(o.get("label"), 0) + 1
            log(f"   objectAnnotations: {len(anns)}  " + ", ".join(f"{k}x{v}" for k, v in sorted(labels.items(), key=lambda x: -x[1])[:15]))
            if not a.list:
                (root / f"object_annotations_{label}.json").write_text(json.dumps(anns, indent=1))
    (root / "tiles" / "report.txt").write_text("\n".join(lines))
    log(f"\nreport: {root / 'tiles' / 'report.txt'} - paste it back")


if __name__ == "__main__":
    main()
