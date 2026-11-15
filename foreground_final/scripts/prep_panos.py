"""Pano cube-face prep for Foreground: up to 8 panos per Matterport site, 6 faces each (+ defurnished "empty").

Run: python -X utf8 scripts/prep_panos.py [siteId ...]

Output: public/sites/<id>/pano/<panoId>/f0..f5.jpg and .../empty/f0..f5.jpg (<=1024 px, <=180 KB each), and
data/sites/<id>.json matterport.panos (chosen panos get rotation, skybox, skyboxEmpty; others keep id/position/label).

FACE ORDER: Matterport skybox(resolution:"2k").children returns 6 URLs; index N is saved as fN.jpg.
Which index is up/down was verified by viewing the faces, see docs/spikes/pano-faces.md (and FACE_ORDER below).
Idempotent: complete face sets already on disk are not re-downloaded; the panoLocations list is cached in
data/cache/raw/<id>/panos_all.json. Signed URLs expire, so skybox URLs are queried fresh (only for panos that
still need faces) and downloaded immediately. Keys come from .env.local and are never printed.
Reuses helpers from prep_media.py (imported; its main() does not run).
"""
from __future__ import annotations

import io
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import prep_media as pm  # noqa: E402
from PIL import Image  # noqa: E402

ROOT, SITES, RAW, PUB = pm.ROOT, pm.SITES, pm.RAW, pm.PUB
MAX_PX, MAX_BYTES, MAX_PANOS, MIN_SPREAD_M = 1024, 180_000, 8, 2.5
# FACE_ORDER (verified visually): f0 = UP (ceiling), f1..f4 = side faces (horizontal ring), f5 = DOWN (floor)
FACE_ORDER = ["up", "side1", "side2", "side3", "side4", "down"]

LIST_Q = """query($id:ID!){ model(id:$id){ panoLocations{ id label position{x y z} rotation{x y z w} } } }"""
SKY_Q = """query($id:ID!,$p:[String!]){ model(id:$id){ panoLocations(ids:$p){ id skybox(resolution:"2k"){children} } } }"""


def gql(q: str, v: dict) -> list[dict]:
    return pm.mp_gql(q, v)["data"]["model"]["panoLocations"] or []


def all_panos(sid: str, model_id: str) -> list[dict]:
    path = RAW / sid / "panos_all.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    r = gql(LIST_Q, {"id": model_id})
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(r), encoding="utf-8")
    return r


def dist(a: dict, b: dict) -> float:
    return math.dist((a["x"], a["y"], a["z"]), (b["x"], b["y"], b["z"]))


def choose(site: dict, panos: list[dict]) -> list[str]:
    m = site["matterport"]
    by_id = {p["id"]: p for p in panos}
    out: list[str] = []

    def add(pid: str, spread: bool = False) -> None:
        if pid in by_id and pid not in out and len(out) < MAX_PANOS:
            if spread and any(dist(by_id[pid]["position"], by_id[o]["position"]) < MIN_SPREAD_M for o in out):
                return
            out.append(pid)

    for b in m.get("beforeAfter", []):
        add(b["panoId"])
    for f in site.get("findings", []):
        if f.get("panoId"):
            add(f["panoId"])
    rooms = sorted([r for r in m.get("rooms", []) if r.get("polygon") and (r.get("areaSf") or 0) >= 40],
                   key=lambda r: -(r["areaSf"] or 0))
    for r in rooms[:6]:
        cx, cy = pm.centroid(r["polygon"])
        c = [p for p in panos if p["id"] not in out]
        inside = [p for p in c if pm.pip((p["position"]["x"], p["position"]["y"]), r["polygon"])] or c
        if inside:
            add(min(inside, key=lambda p: math.dist((p["position"]["x"], p["position"]["y"]), (cx, cy)))["id"], True)
    while len(out) < MAX_PANOS:  # farthest-point spread, keep >= MIN_SPREAD_M
        cand = [p for p in panos if p["id"] not in out]
        if not out:
            ax = sum(p["position"]["x"] for p in panos) / len(panos)
            ay = sum(p["position"]["y"] for p in panos) / len(panos)
            out.append(min(panos, key=lambda p: math.dist((p["position"]["x"], p["position"]["y"]), (ax, ay)))["id"])
            continue
        if not cand:
            break
        best = max(cand, key=lambda p: min(dist(p["position"], by_id[o]["position"]) for o in out))
        if min(dist(best["position"], by_id[o]["position"]) for o in out) < MIN_SPREAD_M:
            break
        out.append(best["id"])
    return out


def encode(data: bytes) -> bytes:
    im = Image.open(io.BytesIO(data)).convert("RGB")
    if max(im.size) > MAX_PX:
        s = MAX_PX / max(im.size)
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    q = 80
    while True:
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=q, optimize=True, progressive=True)
        if buf.tell() <= MAX_BYTES or q <= 35:
            if buf.tell() > MAX_BYTES and im.width > 640:
                im = im.resize((int(im.width * 0.9), int(im.height * 0.9)), Image.LANCZOS)
                continue
            return buf.getvalue()
        q -= 5


def complete(d: Path) -> bool:
    return all((d / f"f{i}.jpg").exists() for i in range(6))


def fetch_faces(view_id: str, pids: list[str], dest) -> set[str]:
    """Query skybox URLs on view_id and download them immediately into dest(pid). Returns pids that succeeded."""
    ok: set[str] = set()
    if not pids:
        return ok
    try:
        res = gql(SKY_Q, {"id": view_id, "p": pids})
    except Exception as e:
        pm.log("   query failed:", pm.scrub(str(e))[:120])
        return ok
    for p in res:
        urls = (p.get("skybox") or {}).get("children") or []
        if len(urls) != 6:
            continue
        blobs = []
        for u in urls:
            st, _, b = pm.http(u)
            if st != 200 or not pm.is_jpeg(b):
                break
            blobs.append(b)
        if len(blobs) == 6:
            d = dest(p["id"])
            d.mkdir(parents=True, exist_ok=True)
            for i, b in enumerate(blobs):
                (d / f"f{i}.jpg").write_bytes(encode(b))
            ok.add(p["id"])
    return ok


def prep_site(path: Path) -> dict | None:
    site = json.loads(path.read_text(encoding="utf-8"))
    m = site.get("matterport")
    if not m:
        return None
    sid = site["id"]
    panos = all_panos(sid, m["modelId"])
    chosen = choose(site, panos)
    base = PUB / sid / "pano"
    fetch_faces(m["modelId"], [p for p in chosen if not complete(base / p)], lambda p: base / p)
    dv = m.get("defurnishedViewId")
    if dv:
        fetch_faces(dv, [p for p in chosen if not complete(base / p / "empty")], lambda p: base / p / "empty")
    existing = {p["id"]: p for p in m["panos"]}
    new_panos, n_empty = [], 0
    for p in panos:
        e = dict(existing.get(p["id"], {"id": p["id"], "position": p["position"]}))
        if p.get("label") and "label" not in e:
            e["label"] = p["label"]
        if p["id"] in chosen and complete(base / p["id"]):
            e["rotation"] = p["rotation"]
            e["skybox"] = [f"/sites/{sid}/pano/{p['id']}/f{i}.jpg" for i in range(6)]
            if complete(base / p["id"] / "empty"):
                e["skyboxEmpty"] = [f"/sites/{sid}/pano/{p['id']}/empty/f{i}.jpg" for i in range(6)]
                n_empty += 1
            else:
                e.pop("skyboxEmpty", None)
        new_panos.append(e)
    m["panos"] = new_panos
    path.write_text(json.dumps(site, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    nb = sum(f.stat().st_size for f in base.rglob("*.jpg")) if base.exists() else 0
    return {"id": sid, "chosen": len(chosen), "withSkybox": sum(1 for p in new_panos if "skybox" in p),
            "empty": n_empty, "bytes": nb}


def main() -> int:
    want = set(sys.argv[1:])
    rows = []
    for f in sorted(SITES.glob("*.json")):
        if want and f.stem not in want:
            continue
        try:
            r = prep_site(f)
        except Exception as e:
            pm.log(f.stem, "FAILED:", pm.scrub(str(e))[:200])
            continue
        if r:
            rows.append(r)
            pm.log(f"{r['id']}: panos {r['withSkybox']}/{r['chosen']}, with empty {r['empty']}, {r['bytes']/1e6:.2f} MB")
    pm.log("TOTAL MB:", round(sum(r["bytes"] for r in rows) / 1e6, 2), "| panos with empty:", sum(r["empty"] for r in rows))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
