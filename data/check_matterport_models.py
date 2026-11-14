#!/usr/bin/env python3
"""Bounded, resumable read-only checks for CoStar-linked Matterport models.

Requires MATTERPORT_API_KEY (Token ID) and MATTERPORT_API_TOKEN (Token Secret)
in the environment. Never prints credentials or model names. Results are local
and gitignored. Default cap is 100 unique IDs per run; pass --limit N to adjust.
"""
import argparse
import base64
import csv
import datetime as dt
import json
import os
import pathlib
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
INPUT = ROOT / "data/raw/costar/marketplace-starter/commercial-properties.csv"
OUTPUT = ROOT / "data/normalized/matterport/model-access-checks.jsonl"
ENDPOINT = "https://api.matterport.com/api/models/graph"
QUERY = "query($id: ID!) { model(id: $id) { id name state } }"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--delay", type=float, default=0.4)
    args = parser.parse_args()
    if args.limit < 1 or args.delay < 0:
        parser.error("--limit must be positive and --delay non-negative")
    key, token = os.environ.get("MATTERPORT_API_KEY"), os.environ.get("MATTERPORT_API_TOKEN")
    if not key or not token:
        raise SystemExit("Set MATTERPORT_API_KEY and MATTERPORT_API_TOKEN in the environment")
    if not INPUT.exists():
        raise SystemExit(f"Missing starter CSV: {INPUT}")

    with INPUT.open(newline="", encoding="utf-8-sig") as source:
        rows = list(csv.DictReader(source))
    unique = {}
    for row in rows:
        mid = row.get("MatterportModelId", "").strip()
        if mid:
            unique.setdefault(mid, row)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    completed = set()
    if OUTPUT.exists():
        with OUTPUT.open() as existing:
            for line in existing:
                try:
                    record = json.loads(line)
                    if record.get("http_status") == 200 and (record.get("result") or "not.found" in record.get("errors", [])):
                        completed.add(record["model_id"])
                except (json.JSONDecodeError, KeyError):
                    continue
    todo = [(mid, row) for mid, row in unique.items() if mid not in completed][:args.limit]
    if not todo:
        print(f"No pending IDs within limit; completed {len(completed)} checks already.")
        return

    auth = "Basic " + base64.b64encode(f"{key}:{token}".encode()).decode()
    counts = {}
    with OUTPUT.open("a", encoding="utf-8") as out:
        for index, (mid, row) in enumerate(todo):
            payload = json.dumps({"query": QUERY, "variables": {"id": mid}}).encode()
            req = urllib.request.Request(ENDPOINT, data=payload, method="POST", headers={
                "Authorization": auth,
                "Content-Type": "application/json",
            })
            status, result, errors = None, None, []
            try:
                with urllib.request.urlopen(req, timeout=20) as response:
                    status = response.status
                    body = json.loads(response.read())
                    result = body.get("data", {}).get("model")
                    errors = [e.get("extensions", {}).get("code", "unspecified") for e in body.get("errors", [])]
            except urllib.error.HTTPError as exc:
                status = exc.code
            except Exception as exc:
                errors = [type(exc).__name__]
            record = {
                "provider": "Matterport",
                "retrieved_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                "model_id": mid,
                "property_id": row.get("PropertyId"),
                "city": row.get("City"),
                "http_status": status,
                "result": result,
                "errors": errors,
            }
            out.write(json.dumps(record, separators=(",", ":")) + "\n")
            out.flush()
            counts[str(status)] = counts.get(str(status), 0) + 1
            if (index + 1) % 25 == 0:
                print(f"Checked {index + 1}/{len(todo)} in this run; HTTP summary {counts}")
            if index + 1 < len(todo):
                time.sleep(args.delay)
    os.chmod(OUTPUT, 0o600)
    print(f"Run complete: {len(todo)} IDs checked; HTTP summary {counts}; total unique checks {len(completed) + len(todo)}; output is ignored local data.")


if __name__ == "__main__":
    main()
