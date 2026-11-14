"""Read-only aggregate run: python -m integration.constraint_filter <repo_root> [normalized_dir]"""
import json
import sys
from collections import Counter
from pathlib import Path

from .filter import evaluate_all, profile_from_requirements, replan
from .loader import load_sites

root = Path(sys.argv[1])
norm = Path(sys.argv[2]) if len(sys.argv) > 2 else root / "data/normalized/costar"
sites = load_sites(norm)
p = profile_from_requirements(root / "data/concept-requirements.json")
res = evaluate_all(p, sites)
print("sites", len(sites), dict(Counter(r.status for r in res.values())))
per = Counter((r.constraint, r.status) for s in res.values() for r in s.results)
print("per-constraint", {f"{k[0]}:{k[1]}": v for k, v in sorted(per.items())})
print("missing-field frequency", dict(Counter(m for s in res.values() for m in s.missing_fields)))
for ch in ({"min_seats": 20}, {"budget": 500000.0}, {"cities": ("Houston",)}, {"min_area_sqft": 2500}):
    r = replan(p, ch, sites)
    print("replan", ch, "->", r["counts_before"], r["counts_after"], "changed", len(r["changed"]))
