"""python -m assets.ingest --images DIR --profile ID [--reference-scale TEXT] [--scan objects.json]"""
import argparse
import json
import sys
from pathlib import Path

from . import from_scan, identify as ident
from .vision_files import list_images


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="assets.ingest")
    ap.add_argument("--images", help="directory of images")
    ap.add_argument("--scan", help="objects.json from the modeling pipeline")
    ap.add_argument("--profile", default=None)
    ap.add_argument("--reference-scale", default=None)
    a = ap.parse_args(argv)
    if not a.images and not a.scan:
        ap.error("give --images and/or --scan")
    res = {"proposals": [], "mode": "fixture", "notice": ""}
    if a.images:
        res = ident.identify(list_images(a.images), ident.default_client(), a.profile, a.reference_scale)
    if a.scan:
        s = from_scan.load_objects_file(a.scan, a.profile)
        res["proposals"] += s["assets"]
        res["scanSkipped"] = s["skipped"]
        res["notice"] = (res["notice"] + " Scan-derived items are estimated bounding boxes.").strip()
    json.dump(res, sys.stdout, indent=2)
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
