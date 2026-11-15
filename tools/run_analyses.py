"""Populate every analysis for every site the picker can show (the CoStar candidates and the cafe scans). Idempotent.

Run through tools/run-analyses, which wires the same data folders as tools/demo-up. Real results are read as they are; anything a
real run cannot produce (no model key, no panorama, a scan with no candidate row) is built by deterministic local rules and labelled
DEMO ESTIMATE. No network and no LLM calls. Output goes to the gitignored derived folders; nothing here is committed.
"""
import argparse
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "services" / "api"))

from services.api.app import analyses  # noqa: E402


def cell(r: dict, k: str) -> str:
    v = r[k]
    if k == "inspection":
        return f"{v['tier']} {v['derived']}d/{v['demo']}e"
    if k == "triage":
        return f"{v['observed']}o/{v['derived']}d/{v['demo']}e"
    return v


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--force", action="store_true", help="rebuild cached demo results even if present")
    ap.add_argument("--quiet", action="store_true")
    a = ap.parse_args(argv)
    t0 = time.time()
    ids = analyses.pool_ids()
    if not ids:
        print("no candidate data found (check COSTAR_NORMALIZED_DIR / the data folder)", file=sys.stderr)
        return 2
    rows = analyses.warm_all(force=a.force, progress=None if a.quiet else (lambda i, n, lid: print(f"[{i:>2}/{n}] site {lid}", flush=True)))
    cols = ["inspection", "triage", "aerial", "structure", "lineage", "presence"]
    head = ["site", "name", "scan", "aerial"] + cols
    table = [[str(r["listingId"]), r["name"][:26], "y" if r["hasScan"] else "-", "y" if r["hasAerial"] else "-"] + [cell(r, c) for c in cols] for r in rows]
    w = [max(len(x[i]) for x in [head] + table) for i in range(len(head))]
    line = lambda xs: "  ".join(x.ljust(w[i]) for i, x in enumerate(xs))  # noqa: E731
    print("\n" + line(head) + "\n" + line(["-" * n for n in w]))
    for t in table:
        print(line(t))
    n = len(rows)
    print(f"\n{n} sites in {time.time() - t0:.0f}s. Cells: inspection = tier and derived(d)/estimated(e) findings; triage = observed(o)/derived(d)/estimated(e) fields;")
    print("others = observed (real artifact), derived (rules or kit fields over real data) or demo (DEMO ESTIMATE). No vision model ran, so no inspection finding is 'observed'.")
    for c in ("aerial", "structure", "lineage", "presence"):
        counts = {}
        for r in rows:
            counts[r[c]] = counts.get(r[c], 0) + 1
        print(f"  {c}: {counts}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
