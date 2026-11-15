#!/usr/bin/env python3
"""Build the business-model artifacts (kNN peers + neighbourhood index) for all candidate sites and cafe scans, idempotently.

  uv run --no-project --python 3.12 --with numpy python tools/run_business_models.py [--kit DIR] [--out DIR] [--configs N]

Reads the local CoStar kit (gitignored), writes $DERIVED_DIR/business (gitignored) and prints a summary table. Re-running on the same
data produces identical files. Details: docs/models/business-knn.md, docs/models/neighbourhood-index.md.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from forecasting.peers.build import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())
