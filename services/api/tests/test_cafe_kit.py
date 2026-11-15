"""Cafe reference kit: every piece has dims, clearance and a catalog price (estimated demo prices labelled), and Quantify prices it."""
import json
from collections import Counter
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from assets.models import Asset

ROOT = Path(__file__).resolve().parents[3]
KIT = json.loads((ROOT / "foreground/app/lib/cafe-kit.json").read_text())
CAT = json.loads((ROOT / "data/financial/catalog.json").read_text())
PRICES = {e["id"]: e for k in ("equipment", "reskinEquipment") for e in CAT[k]}
LIB = {a.assetId: a for a in (Asset.model_validate_json(f.read_text()) for f in sorted((ROOT / "assets/library").glob("*.json")))}


def kit_ids(scan):
    s = KIT["scans"][scan]
    return KIT["base"] + [i for i, n in s.items() if i != "sqft" for _ in range(n)]


def test_library_has_no_duplicate_ids_or_names():
    files = list((ROOT / "assets/library").glob("*.json"))
    assert len(LIB) == len(files)
    assert not [n for n, c in Counter(a.name for a in LIB.values()).items() if c > 1]


def test_kit_pieces_have_dims_clearance_and_a_labelled_price():
    pieces = set(KIT["base"]) | {i for s in KIT["scans"].values() for i in s if i != "sqft"}
    for pid in pieces:
        a = LIB[pid]
        assert a.dims.w > 0 and a.dims.d > 0 and a.dims.h > 0 and a.clearance.front >= 0, pid
        assert a.priceRef in PRICES, pid
        p = PRICES[a.priceRef]
        assert p["priceStatus"] in ("observed", "estimated") and p["listPrice"] > 0
        if p["priceStatus"] == "estimated":
            assert "DEMO ESTIMATE" in p["priceNote"] or "estimated" in p["priceNote"].lower()


def test_each_scan_kit_is_a_cafe_and_quantify_prices_every_piece():
    client = TestClient(app)
    for scan in ("w2JcUVybv9c", "xVKH13z5MJ8", "JAnuRsaVo9M"):
        ids = kit_ids(scan)
        assert {"espresso_machine_2group", "bakery_display_case_48"} <= set(ids) and ids.count("chair_dining") >= 12
        items = [{"assetId": LIB[i].priceRef, "quantity": n} for i, n in Counter(ids).items()]
        r = client.post("/api/layout-cost", json={"items": items, "sqft": KIT["scans"][scan]["sqft"]}).json()
        assert r["unpriced"] == []
        assert sum(l["quantity"] for l in r["lines"]) == len(ids)
        assert r["equipment"]["low"] > 0
