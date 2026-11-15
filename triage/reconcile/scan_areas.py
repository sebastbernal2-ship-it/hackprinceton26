#!/usr/bin/env python3
"""Write data/derived/scan_areas.json (the file services/api/app/loader.py reads) from the Matterport results already cached by
triage/reconcile/fetch_matterport.py. Area = sum of the scan's room floor areas, Matterport 'Void' rooms excluded, in sq ft.
Status is 'observed' (measured by the scan); whether the scanned space is the suite for lease is NOT verified.

    python -m triage.reconcile.scan_areas [--data-root .] [--out data/derived/scan_areas.json]
"""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


def room_is_space(room: dict) -> bool:
    """Same rule as triage/reconcile/engine.py: a room whose first classification label is 'Void' is not a space."""
    c = room.get("classifications") or []
    return not (c and c[0].get("label") == "Void")


def scan_area_sqft(record: dict):
    rooms = ((record.get("model") or {}).get("rooms")) or []
    areas = [r.get("dimensions", {}).get("areaFloor") for r in rooms if room_is_space(r)]
    areas = [a for a in areas if isinstance(a, (int, float)) and a > 0]
    return round(sum(areas)) if areas else None


def build(cache_dir: Path) -> dict:
    out = {}
    for f in sorted(Path(cache_dir).glob("*.json")):
        try:
            rec = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        model, sqft = rec.get("modelId"), scan_area_sqft(rec)
        if model and sqft:
            out[model] = {"squareFeet": sqft, "status": "observed", "source": "Matterport rooms.dimensions.areaFloor (non-Void rooms)",
                          "fetchedAt": rec.get("fetchedAt")}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-root", default=".")
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    root = Path(a.data_root)
    res = build(root / "data/derived/triage/matterport")
    out = Path(a.out) if a.out else root / "data/derived/scan_areas.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(res, indent=1), encoding="utf-8")
    print(f"{len(res)} scan areas written to {out} at {datetime.now(timezone.utc).isoformat(timespec='seconds')}")


if __name__ == "__main__":
    main()
