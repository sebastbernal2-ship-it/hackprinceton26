#!/usr/bin/env python3
"""Bounded read-only Matterport fetch of room-level measurements, one request per property.

Picks the first accessible model per property (from the existing access log), asks for model/floor/room
dimensions + room classification labels, caches one JSON per property under <data-root>/data/derived/triage/matterport/.
Credentials are read from the environment / .env by NAME and never printed. ~5 req/s default.
"""
import argparse, base64, csv, json, os, sys, time, urllib.request, urllib.error
from pathlib import Path

ENDPOINT = "https://api.matterport.com/api/models/graph"
QUERY = """query($id: ID!) { model(id: $id) { id state
  dimensions(units: imperial) { areaFloor }
  floors { id label }
  rooms { id floor { id } classifications { label confidence }
          dimensions(units: imperial) { areaFloor width depth height } } } }"""


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip().removeprefix("export ").strip(), v.strip().strip('"').strip("'"))


def property_models(root: Path) -> dict[str, str]:
    """property_id -> first accessible (active) model id, from the existing read-only access log."""
    out: dict[str, str] = {}
    log = root / "data/normalized/matterport/model-access-checks.jsonl"
    for line in log.open():
        try:
            r = json.loads(line)
        except json.JSONDecodeError:
            continue
        if r.get("http_status") == 200 and r.get("result") and r["result"].get("state") == "active":
            out.setdefault(str(r["property_id"]), r["model_id"])
    return out


def priority_ids(root: Path) -> list[str]:
    p = root / "data/normalized/costar/restaurant-site-candidates.csv"
    return [r["property_id"] for r in csv.DictReader(p.open(newline="", encoding="utf-8"))] if p.exists() else []


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-root", default=".")
    ap.add_argument("--limit", type=int, default=100000)
    ap.add_argument("--rate", type=float, default=5.0)
    a = ap.parse_args()
    root = Path(a.data_root)
    load_env(root / ".env")
    key, tok = os.environ.get("MATTERPORT_API_KEY"), os.environ.get("MATTERPORT_API_TOKEN")
    if not key or not tok:
        sys.exit("Set MATTERPORT_API_KEY and MATTERPORT_API_TOKEN")
    auth = "Basic " + base64.b64encode(f"{key}:{tok}".encode()).decode()
    cache = root / "data/derived/triage/matterport"
    cache.mkdir(parents=True, exist_ok=True)
    models = property_models(root)
    order = [p for p in priority_ids(root) if p in models] + [p for p in models if p not in set(priority_ids(root))]
    todo = [p for p in order if not (cache / f"{p}.json").exists()][: a.limit]
    done = err = 0
    t0 = time.time()
    for pid in todo:
        body = json.dumps({"query": QUERY, "variables": {"id": models[pid]}}).encode()
        req = urllib.request.Request(ENDPOINT, data=body, method="POST",
                                     headers={"Authorization": auth, "Content-Type": "application/json"})
        rec = {"propertyId": pid, "modelId": models[pid], "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                j = json.loads(r.read())
            rec["model"] = (j.get("data") or {}).get("model")
            rec["errors"] = [e.get("extensions", {}).get("code", "unspecified") for e in j.get("errors", [])]
        except urllib.error.HTTPError as e:
            rec["httpStatus"] = e.code; rec["model"] = None; rec["errors"] = [f"http{e.code}"]
            if e.code in (401, 403, 429):  # stop on auth/rate trouble, do not cache
                print(f"stopping on HTTP {e.code} after {done} fetched"); break
        except Exception as e:  # network
            rec["model"] = None; rec["errors"] = [type(e).__name__]
        (cache / f"{pid}.json").write_text(json.dumps(rec))
        done += 1; err += bool(rec["errors"] and not rec["model"])
        if done % 100 == 0:
            print(f"{done}/{len(todo)} fetched, {err} errors, {time.time()-t0:.0f}s", flush=True)
        time.sleep(max(0.0, 1.0 / a.rate))
    print(f"done: fetched={done} errors={err} remaining_models={len(models)}")


if __name__ == "__main__":
    main()
