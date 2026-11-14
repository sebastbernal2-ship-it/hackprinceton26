"""CLI: python -m inspection.run --images <dir> [--plan plan.json] [--listing-id ID] --out data/derived/inspection"""
import argparse
import json
from pathlib import Path

from .cost_link import link_costs
from .geometry import geometry_findings
from .vision import default_client, list_images, run_vision


def build(images_dir, plan_path, client, max_images=6) -> dict:
    res = run_vision(list_images(images_dir) if images_dir else [], client, max_images)
    findings = list(res["findings"])
    notice = res["notice"]
    if plan_path and Path(plan_path).is_file():
        geo = geometry_findings(json.loads(Path(plan_path).read_text()), ref=Path(plan_path).name)
        findings += geo
        notice += f" Plus {len(geo)} rule-based floor-plan findings (assumption thresholds)."
    return {"findings": link_costs(findings), "mode": res["mode"], "notice": notice}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--images"); ap.add_argument("--plan"); ap.add_argument("--listing-id", default="local")
    ap.add_argument("--out", default="data/derived/inspection"); ap.add_argument("--max-images", type=int, default=6)
    a = ap.parse_args(argv)
    out = build(a.images, a.plan, default_client(), a.max_images)
    Path(a.out).mkdir(parents=True, exist_ok=True)
    (Path(a.out) / f"{a.listing_id}.json").write_text(json.dumps(out, indent=2))
    cats: dict[str, int] = {}
    for f in out["findings"]:
        cats[f["category"]] = cats.get(f["category"], 0) + 1
    print(json.dumps({"mode": out["mode"], "count": len(out["findings"]), "categories": cats}))


if __name__ == "__main__":
    main()
