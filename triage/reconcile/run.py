#!/usr/bin/env python3
"""Run reconciliation for every property with a scan or in the candidate list; write derived outputs.

  python -m triage.reconcile.run --data-root /path/with/data   (writes <root>/data/derived/triage/{results.json,summary.json,queue.json})
"""
import argparse, csv, json
from collections import Counter
from pathlib import Path

from .engine import FIELDS, triage_property

KIT = "data/raw/costar/full-kit/data"


def _jsonl(p: Path):
    with p.open(encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                yield json.loads(line)


def load_inputs(root: Path):
    props = {str(r["id"]): r for r in _jsonl(root / KIT / "commercial-property.jsonl")}
    listings: dict[str, list] = {}
    for r in _jsonl(root / KIT / "commercial-listing-summary.jsonl"):
        listings.setdefault(str(r.get("propertyId")), []).append(r)
    cand = root / "data/normalized/costar/restaurant-site-candidates.csv"
    cands = [r["property_id"] for r in csv.DictReader(cand.open(newline="", encoding="utf-8"))] if cand.exists() else []
    return props, listings, cands


def summarize(results: list[dict], cohorts: dict[str, set[str]]) -> dict:
    out = {"disclaimer": "Screening triage of record fields, not an engineering assessment or a statement that CoStar is wrong. "
                         "Confidence labels are rule-based, not probabilities.", "cohorts": {}}
    for name, ids in cohorts.items():
        rs = [r for r in results if r["listingId"] in ids]
        fields = {}
        for f in FIELDS:
            rows = [next(x for x in r["fields"] if x["field"] == f) for r in rs]
            st = Counter(x["status"] for x in rows)
            before = sum(1 for x in rows if x["costarValue"] is not None)
            after = sum(1 for x in rows if x["value"] is not None or x["costarValue"] is not None)  # a conflicting CoStar value stays on the record
            n = len(rows) or 1
            fields[f] = {"statuses": dict(st), "costarFilled": before, "filledAfterTriage": after,
                         "fillRateBefore": round(before / n, 4), "fillRateAfter": round(after / n, 4),
                         "tested": st["confirmed"] + st["conflicting"],
                         "conflictRateOfTested": round(st["conflicting"] / (st["confirmed"] + st["conflicting"]), 4) if st["confirmed"] + st["conflicting"] else None}
        out["cohorts"][name] = {"properties": len(rs), "withScan": sum(r["hasScan"] for r in rs), "fields": fields}
    return out


def build_queue(results: list[dict]) -> list[dict]:
    q = []
    for r in results:
        for f in r["fields"]:
            if f["status"] in ("conflicting", "filled") or (f["status"] == "blank-unfillable" and f["reviewScore"] >= 10):
                q.append({"listingId": r["listingId"], "field": f["field"], "status": f["status"], "score": f["reviewScore"],
                          "scope": f["scope"], "confidence": f["confidence"], "costarValue": f["costarValue"],
                          "scanValue": f["scanValue"], "aerialValue": f["aerialValue"], "note": f["note"] or f["rule"]})
    q.sort(key=lambda x: (-x["score"], x["listingId"], x["field"]))
    return q


def load_aerial(d: Path, pid: str):
    """Aerial slice output lives in aerial/properties/<id>.json (triage/aerial/build.py); the flat aerial/<id>.json path is legacy."""
    for p in (d / "aerial" / "properties" / f"{pid}.json", d / "aerial" / f"{pid}.json"):
        if p.exists():
            return json.loads(p.read_text())
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-root", default=".")
    a = ap.parse_args()
    root = Path(a.data_root)
    props, listings, cands = load_inputs(root)
    d = root / "data/derived/triage"
    scans = {p.stem: json.loads(p.read_text()) for p in (d / "matterport").glob("*.json")}
    results = []
    for pid in sorted(set(cands) | set(scans)):
        if pid not in props:
            continue
        aerial = load_aerial(d, pid)
        results.append(triage_property(pid, props[pid], listings.get(pid), scans.get(pid), aerial))
    ids = {r["listingId"] for r in results}
    summary = summarize(results, {"candidates65": set(cands) & ids, "allScanned": {r["listingId"] for r in results if r["hasScan"]}, "everything": ids})
    (d / "results.json").write_text(json.dumps(results))
    (d / "summary.json").write_text(json.dumps(summary, indent=1))
    (d / "queue.json").write_text(json.dumps(build_queue(results)))
    print(json.dumps({k: {"properties": v["properties"], "withScan": v["withScan"]} for k, v in summary["cohorts"].items()}))


if __name__ == "__main__":
    main()
