"""Cafe catalog expansion: every new library item (tagged zone:*) is unique, fully specified, dimensionally sane and priced
(DEMO ESTIMATE) or explicitly unpriced with a reason; the concept kits use only such items and Quantify prices them."""
import json
from collections import Counter
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from assets.glb import parse_glb
from assets.models import Asset, polygon_area

ROOT = Path(__file__).resolve().parents[3]
LIBDIR = ROOT / "assets/library"
LIB = {a.assetId: a for a in (Asset.model_validate_json(f.read_text()) for f in sorted(LIBDIR.glob("*.json")))}
NEW = {i: a for i, a in LIB.items() if any(t.startswith("zone:") for t in a.tags)}
CAT = json.loads((ROOT / "data/financial/catalog.json").read_text())
PRICES = {e["id"]: e for e in CAT["reskinEquipment"] + CAT["equipment"]}
KIT = json.loads((ROOT / "foreground/app/lib/cafe-kit.json").read_text())
ZONES = {"bar", "display", "boh", "front", "seating", "patio", "decor", "crossover"}
# (min, max) metres per axis by category; generous but catches unit mistakes (inches vs metres, cm).
DIM = {"w": (0.05, 5.5), "d": (0.02, 2.5), "h": (0.005, 2.6)}
HEIGHT = {"seating": (0.3, 1.2), "table": (0.35, 1.2), "fridge": (0.5, 2.2), "sink": (0.25, 1.3), "dish": (0.7, 2.2), "counter": (0.8, 1.6),
          "prep_table": (0.8, 1.0), "oven": (0.15, 1.9), "freezer_display": (0.5, 1.7)}


def test_catalog_grew_by_a_real_batch_covering_every_zone():
    assert 60 <= len(NEW) <= 260
    assert {t[5:] for a in NEW.values() for t in a.tags if t.startswith("zone:")} == ZONES
    for z in ZONES:
        assert sum(f"zone:{z}" in a.tags for a in NEW.values()) >= 4, z
    assert len(LIB) >= 82 + 60


def test_ids_and_names_are_unique_across_the_whole_library():
    files = list(LIBDIR.glob("*.json"))
    assert len(LIB) == len(files)
    assert not [n for n, c in Counter(a.name.lower() for a in LIB.values()).items() if c > 1]
    assert all(a.assetId == f.stem for a, f in zip(LIB.values(), sorted(files)))


@pytest.mark.parametrize("aid", sorted(NEW))
def test_item_has_required_fields_and_sane_geometry(aid):
    a = NEW[aid]
    assert a.source == "library" and a.dimsStatus == "estimated" and a.status == "draft", "class estimates must not claim to be measured or confirmed"
    assert len(a.provenance.origin) > 20 and ("class" in a.provenance.origin or "ADA" in a.provenance.origin), "origin cites the spec class or standard"
    assert "class estimate" in a.provenance.notes
    assert a.provenance.notes.strip()
    assert a.clearanceBasis.startswith("ASSUMPTION")
    for ax, (lo, hi) in DIM.items():
        v = getattr(a.dims, ax)
        assert lo <= v <= hi, (aid, ax, v)
    lo, hi = HEIGHT.get(a.category, (0.005, 2.6))
    assert lo <= a.dims.h <= hi or "overhead" in a.tags or "floor" in a.tags, (aid, a.dims.h)
    cl = a.clearance
    assert 0 <= cl.front <= 1.6 and 0 <= cl.sides <= 1.0 and 0 <= cl.back <= 1.0
    xs, ys = [p[0] for p in a.footprint], [p[1] for p in a.footprint]
    assert min(xs) == 0 and min(ys) == 0, "footprint is anchored at the origin"
    assert max(xs) == pytest.approx(a.dims.w, abs=2e-3) and max(ys) == pytest.approx(a.dims.d, abs=2e-3), "footprint spans the stated dims"
    fill = abs(polygon_area(a.footprint)) / (a.dims.w * a.dims.d)
    assert 0.5 <= fill <= 1.0 + 1e-9, (aid, fill)  # L-shapes and circles fill 50 to 100 percent of their box
    assert (ROOT / a.model.uri).is_file() and parse_glb((ROOT / a.model.uri).read_bytes())


def test_realistic_reference_sizes():
    d = {k: (v.dims.w, v.dims.d) for k, v in LIB.items()}
    assert d["table_4top_36sq"] == pytest.approx((0.9144, 0.9144), abs=0.01)
    assert LIB["chair_bistro_bentwood"].dims.w == pytest.approx(0.42, abs=0.04)
    assert LIB["espresso_machine_3group"].dims.w > LIB["espresso_machine_2group"].dims.w > LIB["espresso_machine_1group"].dims.w
    assert LIB["table_ada_accessible_36x36"].clearance.front >= 0.91 - 1e-3
    assert LIB["counter_service_ada_48"].dims.h <= 0.9144 + 1e-3  # ADA 904.4: at most 36 in
    assert LIB["ada_ramp_1to12_12ft"].dims.h == pytest.approx(0.3048, abs=0.001) and LIB["ada_ramp_1to12_12ft"].dims.w >= 3.66  # 1:12 needs 12 ft per 1 ft rise
    assert LIB["ada_water_closet_floor"].clearance.front >= 1.42 - 1e-3  # ADA 604.3: 56 in
    assert any(len(a.footprint) > 5 for a in NEW.values()), "L-shapes / rounded footprints present"


@pytest.mark.parametrize("aid", sorted(NEW))
def test_item_is_priced_as_a_labelled_demo_estimate_or_unpriced_with_a_reason(aid):
    a = NEW[aid]
    if a.priceRef is None:
        assert "UNPRICED:" in a.provenance.notes and len(a.provenance.notes.split("UNPRICED:")[1].strip()) > 20
        return
    assert a.priceRef == aid
    p = PRICES[aid]
    assert p["priceStatus"] == "estimated" and "DEMO ESTIMATE" in p["priceNote"] and "Anchored" in p["priceNote"]
    assert p["listPrice"] > 0 and p["vendorUrl"].startswith("https://") and p["method"] == "neutral-band-v1"


def test_only_a_few_items_are_unpriced():
    assert sum(a.priceRef is None for a in NEW.values()) <= 3


def test_price_ids_are_unique_and_every_price_row_has_an_asset():
    ids = [e["id"] for e in CAT["equipment"] + CAT["reskinEquipment"]]
    assert len(ids) == len(set(ids))
    for e in CAT["reskinEquipment"]:
        assert e["id"] in LIB, e["id"]


def kit_ids(spec, scan):
    s = spec["scans"][scan]
    return spec["base"] + [i for i, n in s.items() if i != "sqft" for _ in range(n)]


@pytest.mark.parametrize("variant", ["grab_and_go", "full_service_patio"])
def test_concept_kit_variants_are_priced_and_quantify_prices_every_piece(variant):
    v = KIT["variants"][variant]
    assert v["label"] and v["note"]
    client = TestClient(app)
    assert {s["sqft"] for s in v["scans"].values()} == {900, 1100, 1300}
    for scan in v["scans"]:
        ids = kit_ids(v, scan)
        assert set(ids) <= set(LIB), set(ids) - set(LIB)
        assert all(LIB[i].priceRef in PRICES for i in ids)
        items = [{"assetId": LIB[i].priceRef, "quantity": n} for i, n in Counter(ids).items()]
        r = client.post("/api/layout-cost", json={"items": items, "sqft": v["scans"][scan]["sqft"]}).json()
        assert r["unpriced"] == [] and r["equipment"]["low"] > 0
        assert sum(l["quantity"] for l in r["lines"]) == len(ids)
    assert {"grab_and_go": "merchandiser_open_air_48", "full_service_patio": "patio_set_4top_36"}[variant] in {i for s in v["scans"] for i in kit_ids(v, s)}
