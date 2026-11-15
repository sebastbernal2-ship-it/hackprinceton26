import importlib.util
from pathlib import Path

HOOK = Path(__file__).resolve().parents[3] / ".claude" / "hooks" / "guard-staging.py"


def forbidden():
    src = HOOK.read_text().split("def main")[0].replace("import json, re, subprocess, sys", "import re")
    ns: dict = {}
    exec(compile(src, str(HOOK), "exec"), ns)  # only the FORBIDDEN pattern; main() is not run
    return ns["FORBIDDEN"]


def test_scan_exports_and_location_index_are_blocked():
    f = forbidden()
    for path in ("assets_w2JcUVybv9c/walk/meta.json", "pano_xVKH13z5MJ8/x.jpg", "floorplans/abc/plan.dxf", "models_index.csv",
                 "data/raw/x", ".env", "data/derived/a"):
        assert f.search(path), path


def test_the_catalog_and_source_are_not_blocked():
    f = forbidden()
    for path in ("assets/library/counter.json", "assets/store.py", "foreground/app/reference-media/page.tsx", "modeling/walk.html"):
        assert not f.search(path), path
