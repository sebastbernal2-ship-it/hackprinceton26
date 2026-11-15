"""Kitchen and counter catalog slice: ~100 new class-estimate pieces (counters, refrigeration, cooking, ware wash, air, storage),
each unique, fully specified, dimensionally sane and priced (DEMO ESTIMATE) or unpriced with a reason; the kitchen-line kits price out."""
import importlib.util
import json
from collections import Counter
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from assets.models import Asset, polygon_area

ROOT = Path(__file__).resolve().parents[3]
LIBDIR = ROOT / "assets/library"
LIB = {a.assetId: a for a in (Asset.model_validate_json(f.read_text()) for f in sorted(LIBDIR.glob("*.json")))}
spec = importlib.util.spec_from_file_location("build_kitchen_catalog", ROOT / "data/build_kitchen_catalog.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
KITCHEN = {r[0]: LIB[r[0]] for r in builder.ROWS}
CAT = json.loads((ROOT / "data/financial/catalog.json").read_text())
PRICES = {e["id"]: e for e in CAT["reskinEquipment"] + CAT["equipment"]}
KIT = json.loads((ROOT / "foreground/app/lib/cafe-kit.json").read_text())
CATEGORIES = {"counter", "prep_table", "range", "oven", "fridge", "freezer_display", "sink", "hood", "dish", "storage", "other"}
H = {"prep_table": (0.8, 1.0), "sink": (0.25, 1.3), "dish": (0.7, 2.2)}


def test_a_real_batch_with_every_requested_family():
    assert len(KITCHEN) >= 60
    assert Counter(a.category for a in KITCHEN.values()).keys() <= CATEGORIES
    for fam in ("counter_service_", "counter_L_", "counter_U_", "walkin_cooler_", "walkin_freezer_", "hood_type1_", "prep_table_sandwich_", "fridge_worktop_",
                "freezer_reachin_", "merchandiser_glass_door_", "range_", "griddle_", "fryer_", "dish_machine_", "sink_", "rack_", "shelf_wall_"):
        assert any(i.startswith(fam) for i in KITCHEN), fam
    assert {"salamander_broiler_36", "cheese_melter_36", "combi_oven_10pan", "blast_chiller_reachin_20pan", "grease_interceptor_50lb", "floor_drain_6",
            "makeup_air_unit_2000cfm", "fire_suppression_panel", "ice_bin_48", "ice_maker_head_30", "table_bakers_marble_72", "counter_heated_pass_72"} <= set(KITCHEN)


def test_ids_and_names_unique_and_nothing_existing_was_replaced():
    assert len(LIB) == len(list(LIBDIR.glob("*.json")))
    assert not [n for n, c in Counter(a.name.lower() for a in LIB.values()).items() if c > 1]
    ids = [e["id"] for e in CAT["equipment"] + CAT["reskinEquipment"]]
    assert len(ids) == len(set(ids))


@pytest.mark.parametrize("aid", sorted(KITCHEN))
def test_item_fields_and_geometry(aid):
    a = KITCHEN[aid]
    assert a.source == "library" and a.dimsStatus == "estimated" and a.status == "draft"
    assert a.clearanceBasis.startswith("ASSUMPTION") and ("stated assumption" in a.clearanceBasis.lower() or "ADA" in a.clearanceBasis)
    assert "class" in a.provenance.origin and "not read from a spec sheet" in a.provenance.origin and "class estimate" in a.provenance.notes
    assert any(t.startswith("zone:") for t in a.tags)
    lo, hi = H.get(a.category, (0.005, 2.6))
    assert 0.005 <= a.dims.w <= 5.5 and 0.02 <= a.dims.d <= 2.5 and lo <= a.dims.h <= hi, (a.dims, a.category)
    c = a.clearance
    assert 0 <= c.front <= 1.6 and 0 <= c.sides <= 1.0 and 0 <= c.back <= 1.0
    xs, ys = [p[0] for p in a.footprint], [p[1] for p in a.footprint]
    assert min(xs) == 0 and min(ys) == 0 and max(xs) == pytest.approx(a.dims.w, abs=2e-3) and max(ys) == pytest.approx(a.dims.d, abs=2e-3)
    assert 0.5 <= abs(polygon_area(a.footprint)) / (a.dims.w * a.dims.d) <= 1 + 1e-9
    assert (ROOT / a.model.uri).is_file()


def test_realistic_sizes_and_shapes():
    d = lambda i: (KITCHEN[i].dims.w, KITCHEN[i].dims.d)  # noqa: E731
    assert d("walkin_cooler_8x8") == pytest.approx((2.4384, 2.4384), abs=1e-3) and d("walkin_cooler_8x10") == pytest.approx((3.048, 2.4384), abs=1e-3)
    assert KITCHEN["walkin_freezer_8x10"].clearance.front >= 0.91 - 1e-3, "door swing"
    assert d("hood_type1_6ft")[0] < d("hood_type1_8ft")[0] < d("hood_type1_10ft")[0]
    assert KITCHEN["hood_type1_8ft"].clearance.sides == pytest.approx(0.3048, abs=1e-3), "12 in overhang"
    assert KITCHEN["counter_ada_register_60"].dims.h <= 0.9144 + 1e-3
    for i in ("counter_L_service_120x84", "counter_U_service_132x96", "counter_corner_blind_48"):
        assert len(KITCHEN[i].footprint) in (7, 9) and abs(polygon_area(KITCHEN[i].footprint)) < KITCHEN[i].dims.w * KITCHEN[i].dims.d * 0.9
    assert len(KITCHEN["counter_cashier_60"].footprint) > 10, "rounded"
    assert KITCHEN["fridge_reachin_3door"].dims.w > LIB["fridge_reachin_2door"].dims.w > KITCHEN["freezer_reachin_1door"].dims.w
    assert KITCHEN["prep_table_sandwich_27"].dims.w < KITCHEN["prep_table_sandwich_60"].dims.w < KITCHEN["prep_table_sandwich_72"].dims.w
    assert KITCHEN["range_2burner_oven_24"].dims.w < KITCHEN["range_4burner_oven_36"].dims.w < KITCHEN["range_6burner_oven_48"].dims.w


@pytest.mark.parametrize("aid", sorted(KITCHEN))
def test_priced_demo_estimate_or_unpriced_with_reason(aid):
    a = KITCHEN[aid]
    if a.priceRef is None:
        assert "UNPRICED:" in a.provenance.notes and len(a.provenance.notes.split("UNPRICED:")[1].strip()) > 20
        return
    p = PRICES[a.priceRef]
    assert a.priceRef == aid and p["priceStatus"] == "estimated" and "DEMO ESTIMATE" in p["priceNote"] and "Anchored" in p["priceNote"]
    assert p["listPrice"] > 0 and p["vendorUrl"].startswith("https://") and p["method"] == "neutral-band-v1"


@pytest.mark.parametrize("variant", ["kitchen_line_light", "kitchen_line_full"])
def test_kitchen_line_kits_are_priced_and_quantify_prices_every_piece(variant):
    v = KIT["variants"][variant]
    assert v["label"].startswith("Kitchen line") and v["note"].startswith("DEMO")
    client = TestClient(app)
    assert {s["sqft"] for s in v["scans"].values()} == {900, 1100, 1300}
    for scan, s in v["scans"].items():
        ids = v["base"] + [i for i, n in s.items() if i != "sqft" for _ in range(n)]
        assert set(ids) <= set(LIB) and sum(i in KITCHEN for i in ids) >= 8
        items = [{"assetId": LIB[i].priceRef, "quantity": n} for i, n in Counter(ids).items()]
        r = client.post("/api/layout-cost", json={"items": items, "sqft": s["sqft"]}).json()
        assert r["unpriced"] == [] and r["equipment"]["low"] > 0 and sum(l["quantity"] for l in r["lines"]) == len(ids)
