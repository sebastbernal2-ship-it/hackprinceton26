import json
import math
import struct
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from assets.glb import glb_from_parts, hex_to_rgba, parse_glb, restyle_glb
from assets.models import Asset
from assets.restyle import engine
from assets.restyle.meshes import parts_for
from assets.store import Store
from assets.variants import rect

ROOT = Path(__file__).resolve().parents[3]
LIB = ROOT / "assets" / "library"
client = TestClient(app)
STORE = Store()


def test_deep_catalog_validates_and_is_honest():
    files = sorted(LIB.glob("*.json"))
    assert len(files) >= 60
    for f in files:
        a = Asset.model_validate_json(f.read_text())
        assert a.clearanceBasis.startswith("ASSUMPTION")
        if a.dimsStatus == "catalog":  # only when the number was seen on a fetched page
            assert a.provenance.origin.startswith("http") and a.provenance.retrievedAt == "2026-11-14"
        if a.priceRef is None:
            continue
    # hand-converted: 36 x 32.625 x 60.375 in seen on the CPG S36-N page
    r = STORE.get("range_6burner_36_cpg_s36n")
    assert (r.dims.w, r.dims.d, r.dims.h) == (0.9144, 0.8287, 1.5335) and r.dimsStatus == "catalog"
    assert STORE.get("tandoor_24").dimsStatus == "estimated"  # search summary only, page not opened
    assert STORE.get("tandoor_24").priceRef is None


@pytest.mark.parametrize("cid", engine.list_concepts())
def test_concepts_reference_real_assets_and_label_assumptions(cid):
    c = engine.load_concept(cid)
    for e in c["equipment"]:
        assert STORE.get(e["assetId"]) is not None, e["assetId"]
    for r in c["adjacency"] + c["loads"]:
        assert r["status"] == "assumption" and r["basis"]
    for r in c["adjacency"]:
        assert STORE.get(r["a"]) and STORE.get(r["b"])
    assert {"wall", "floor", "ceiling", "accent"} <= set(c["materials"])


def test_required_qty_hand_computed():
    e = {"qty": {"perSeats": 80, "min": 1}}
    assert engine.required_qty(e, 120) == 2   # ceil(1.5)
    assert engine.required_qty(e, 80) == 1
    assert engine.required_qty(e, 81) == 2
    assert engine.required_qty(e, None) == 1  # seats unknown -> min, flagged elsewhere
    assert engine.required_qty({"qty": {"fixed": 3}}, 10) == 3


def test_gap_geometry():
    assert engine._gap((0, 0, 1, 1), (3, 0, 4, 1)) == 2.0
    assert engine._gap((0, 0, 1, 1), (4, 5, 5, 6)) == 5.0  # 3-4-5
    assert engine._gap((0, 0, 2, 2), (1, 1, 3, 3)) == 0.0


def test_italian_to_indian_removes_adds_and_never_zeroes_unknown():
    layout = {"seats": 120, "room": None, "placements": [
        {"assetId": "oven_pizza_deck_floor_2deck", "x": 0, "y": 0},
        {"assetId": "pasta_cooker_gas_1tank", "x": 2, "y": 0},
        {"assetId": "range_6burner_36", "x": 4, "y": 0},      # generic: kept
        {"assetId": "table_4top_30x48", "x": 0, "y": 5}]}      # furniture: kept
    r = engine.reskin(layout, "italian", "indian")
    assert [x["assetId"] for x in r["removed"]] == ["oven_pizza_deck_floor_2deck", "pasta_cooker_gas_1tank"]
    assert r["keptCount"] == 2
    cnt = {}
    for a in r["added"]:
        cnt[a["assetId"]] = cnt.get(a["assetId"], 0) + 1
    # seats 120: tandoor ceil(120/80)=2, kadhai ceil(120/40)=3, rice cooker ceil(120/60)=2, singles
    assert cnt == {"tandoor_32": 2, "kadhai_range_2burner": 3, "dosa_griddle_36": 1, "chutney_station_cold_48": 1,
                   "lassi_dispenser_counter": 1, "rice_cooker_warmer_cabinet": 2, "steam_table_4well": 1,
                   "naan_warmer_cabinet": 1}
    # Indian set is now priced (observed/estimated); mep/removal/finishes stay unknown, never zero
    cd = r["costDelta"]
    assert cd["totalsStatus"] == "partial" and cd["totals"]["low"] < cd["totals"]["expected"] < cd["totals"]["high"]
    assert all(l["status"] == "unknown" and l["expected"] is None for l in cd["lines"] if l["itemId"] in
               ("reskin:mep", "reskin:removal", "reskin:finishes"))
    topics = {f["topic"] for f in r["feasibility"]}
    assert {"ventilation", "gas", "hood class / suppression", "permit/inspection"} <= topics
    assert all(f["status"] != "ok" for f in r["feasibility"])
    assert r["materials"]["glbPalette"]["wall"] == "#D99A1E"
    # no overlapping boxes in the result
    bx = [engine._box(STORE.get(p["assetId"]), p["x"], p["y"], p.get("rot", 0)) for p in r["placements"]]
    assert not any(engine._overlap(bx[i], bx[j]) for i in range(len(bx)) for j in range(i + 1, len(bx)))


def test_indian_to_italian_priced_lines_hand_computed():
    layout = {"seats": 120, "room": None, "placements": [{"assetId": "tandoor_32", "x": 0, "y": 0}]}
    r = engine.reskin(layout, "indian", "italian")
    by = {l["itemId"]: l for l in r["costDelta"]["lines"]}
    # gelato freezer 13932.35 x1 (observed), gelato case 1639.00 x1, range 1299.00 x ceil(120/50)=3
    assert by["reskin:add:gelato_batch_freezer_20qt"]["expected"] == 13932.35
    assert by["reskin:add:display_gelato_49"]["expected"] == 1639.0
    assert by["reskin:add:range_6burner_36"]["quantity"] == 3 and by["reskin:add:range_6burner_36"]["expected"] == 3897.0
    assert by["reskin:add:oven_pizza_deck_floor_2deck"]["status"] == "unknown"
    # also priced now: pasta cooker 4858.92 x2 = 9717.84 and pizza prep table 2399 x2 = 4798 (both observed)
    assert by["reskin:add:pasta_cooker_gas_1tank"]["expected"] == 9717.84
    assert by["reskin:add:pizza_prep_table_60"]["expected"] == 4798.0
    assert by["reskin:add:dough_mixer_20qt"]["status"] == "unknown"
    ref = 13932.35 + 1639.0 + 3897.0 + 9717.84 + 4798.0  # 33984.19
    ia = by["reskin:install_allowance"]
    assert ia["status"] == "estimated"
    assert ia["expected"] == pytest.approx(0.2 * ref, abs=0.01)       # 6796.84
    assert ia["low"] == pytest.approx(0.2 * ref * 0.4, abs=0.01)      # 2718.74
    assert ia["high"] == pytest.approx(0.2 * ref * 2.5, abs=0.01)     # 16992.10
    t = r["costDelta"]
    assert t["totalsStatus"] == "partial" and "reskin:mep" in t["excludedLineIds"]
    assert t["totals"]["expected"] == pytest.approx(ref + 0.2 * ref, abs=0.02)  # 40781.03
    # first oven lands at the origin, second at the first 0.05 m step right of 1.27 m (50 in = 1.27 m): x = 1.3
    ovens = [a for a in r["added"] if a["assetId"] == "oven_pizza_deck_floor_2deck"]
    assert (ovens[0]["x"], ovens[0]["y"]) == (0, 0) and (ovens[1]["x"], ovens[1]["y"]) == (1.3, 0)


def test_unfittable_item_is_reported_not_forced():
    layout = {"seats": 120, "room": {"w": 1.0, "d": 1.0}, "placements": []}
    r = engine.reskin(layout, "italian", "indian")
    assert r["unplaced"] and any(f["topic"] == "fit" for f in r["feasibility"])


def test_seats_unknown_is_flagged():
    r = engine.reskin({"seats": None, "placements": []}, "italian", "indian")
    assert r["seatsAssumed"] is True


# ---- GLB ---------------------------------------------------------------------------------------------------------
def test_hex_to_rgba_hand_values():
    assert hex_to_rgba("#FFFFFF") == [1.0, 1.0, 1.0, 1.0]
    assert hex_to_rgba("#000000") == [0.0, 0.0, 0.0, 1.0]
    assert hex_to_rgba("#808080")[0] == pytest.approx(0.21586, abs=1e-4)  # sRGB 128 -> linear
    with pytest.raises(ValueError):
        hex_to_rgba("red")


def test_glb_from_parts_box_and_restyle():
    g = glb_from_parts([{"ring": rect(2, 1), "y0": 0, "y1": 3, "material": "wall_paint", "color": "#FFFFFF"},
                        {"ring": rect(2, 1), "y0": 3, "y1": 3.1, "material": "ceiling_tile", "color": "#FFFFFF"}])
    p = parse_glb(g)
    d = p["json"]
    assert [m["name"] for m in d["materials"]] == ["wall_paint", "ceiling_tile"]
    assert d["accessors"][0]["count"] == 8 and d["accessors"][1]["count"] == 36  # box: 8 verts, 12 tris
    assert d["accessors"][0]["max"] == [2.0, 3.0, 1.0]
    # an extra texture on a material must be dropped by restyle
    d2 = json.loads(json.dumps(d))
    d2["materials"][0]["pbrMetallicRoughness"]["baseColorTexture"] = {"index": 0}
    d2["materials"][0]["normalTexture"] = {"index": 1}
    from assets.glb import _pack
    g2 = _pack(d2, p["bin"])
    out, applied = restyle_glb(g2, {"wall": "#D99A1E", "floor": "#000000"})
    q = parse_glb(out)
    m0, m1 = q["json"]["materials"]
    assert applied == {"wall_paint": "#D99A1E"}
    assert m0["pbrMetallicRoughness"]["baseColorFactor"] == hex_to_rgba("#D99A1E")
    assert "baseColorTexture" not in m0["pbrMetallicRoughness"] and "normalTexture" not in m0
    assert m1["pbrMetallicRoughness"]["baseColorFactor"] == [1.0, 1.0, 1.0, 1.0]  # untouched
    assert q["bin"] == p["bin"]  # geometry identical


def test_restyle_longest_key_wins():
    g = glb_from_parts([{"ring": rect(1, 1), "y0": 0, "y1": 1, "material": "wall_accent", "color": "#FFFFFF"}])
    out, applied = restyle_glb(g, {"wall": "#111111", "wall_accent": "#222222"})
    assert applied == {"wall_accent": "#222222"}


def test_tandoor_mesh_parts():
    a = STORE.get("tandoor_32")
    parts = parts_for(a)
    assert [p["material"] for p in parts] == ["body", "clay", "mouth"]
    d = parse_glb(glb_from_parts(parts))["json"]
    top = max(acc["max"][1] for acc in d["accessors"] if acc["type"] == "VEC3")
    assert top == pytest.approx(a.dims.h + 0.01, abs=1e-5)
    assert a.model and (ROOT / a.model.uri).is_file()


# ---- API ---------------------------------------------------------------------------------------------------------
def test_api_concepts():
    r = client.get("/api/concepts")
    assert r.status_code == 200 and {c["id"] for c in r.json()} >= {"italian", "indian", "mexican", "japanese", "diner", "coffee_bakery"}
    assert client.get("/api/concepts/indian").json()["name"].startswith("Indian")
    assert client.get("/api/concepts/nope").status_code == 404


def test_api_reskin_layout_and_errors():
    body = {"layout": {"seats": 40, "placements": [{"assetId": "pasta_cooker_gas_1tank", "x": 0, "y": 0}]},
            "fromConcept": "italian", "toConcept": "indian"}
    r = client.post("/api/reskin", json=body)
    assert r.status_code == 200
    j = r.json()
    assert j["removed"][0]["assetId"] == "pasta_cooker_gas_1tank" and "scenario analysis" in j["notice"].lower()
    # seats 40: tandoor ceil(40/80)=1, kadhai ceil(40/40)=1
    assert sum(1 for a in j["added"] if a["assetId"] == "tandoor_32") == 1
    assert client.post("/api/reskin", json={**body, "toConcept": "zzz"}).status_code == 404
    assert client.post("/api/reskin", json={"fromConcept": "italian", "toConcept": "indian"}).status_code == 422
    assert client.post("/api/reskin", json={**body, "listingId": 1}).status_code == 422
    assert client.post("/api/reskin", json={"listingId": 999999999, "fromConcept": "italian", "toConcept": "indian"}).status_code == 404


def _italian_to_indian_120():
    lay = engine.synthesize_layout(engine.load_concept("italian"), 120, {"w": 8, "d": 6})
    return engine.reskin(lay, "italian", "indian")["costDelta"]


def test_reskin_delta_italian_to_indian_hand_computed():
    # 120 seats: tandoor 2 (observed 2409 each), kadhai 3 (estimated, ref 1322), dosa 1 (est, ref 849),
    # chutney 1 (obs 679), lassi 1 (est, ref 649), rice cooker 2 (obs 198.99), steam table 1 (obs 729), naan 1 (est, ref 1399).
    cd = _italian_to_indian_120()
    st = {l["itemId"].split(":")[-1]: l for l in cd["lines"]}
    assert [st[k]["status"] for k in ("tandoor_32", "chutney_station_cold_48", "rice_cooker_warmer_cabinet", "steam_table_4well")] == ["observed"] * 4
    assert [st[k]["status"] for k in ("kadhai_range_2burner", "dosa_griddle_36", "lassi_dispenser_counter", "naan_warmer_cabinet")] == ["estimated"] * 4
    assert st["tandoor_32"]["expected"] == 4818.00 and st["tandoor_32"]["low"] == st["tandoor_32"]["high"]
    assert (st["kadhai_range_2burner"]["low"], st["kadhai_range_2burner"]["expected"], st["kadhai_range_2burner"]["high"]) == (1586.4, 3966.0, 9915.0)
    obs = 4818 + 679 + 397.98 + 729            # 6623.98
    est_ref = 3966 + 849 + 649 + 1399          # 6863
    allow_ref = 0.2 * (obs + est_ref)          # 2697.396 (20% of reference prices of priced lines)
    assert st["install_allowance"]["expected"] == round(allow_ref, 2)
    assert cd["totals"]["low"] == round(obs + 0.4 * est_ref + round(0.4 * allow_ref, 2), 2) == 10448.14
    assert cd["totals"]["expected"] == 16184.38
    assert cd["totals"]["high"] == 30524.97
    assert cd["totalsStatus"] == "partial"
    assert {"reskin:mep", "reskin:removal", "reskin:finishes"} <= set(cd["excludedLineIds"])
    assert all(st[k]["status"] == "unknown" and st[k]["expected"] is None for k in ("mep", "removal", "finishes"))


def test_unpriced_asset_stays_unknown_not_zero():
    a = STORE.get("tortilla_warmer_press")  # no price page found: must stay unknown
    assert a.priceRef is None
    line = engine._price_line(a, 2, engine._catalog())
    assert line["status"] == "unknown" and line["expected"] is None and line["low"] is None
    t = engine._totals([line])
    assert t["totals"]["expected"] is None and t["totalsStatus"] == "unknown"


def test_reskin_priced_items_have_sources_and_estimates_have_rationale():
    cat = engine._catalog()
    for e in cat["reskinEquipment"]:
        assert e["vendorUrl"].startswith("https://") and e["asOf"] == "2026-11-14" and e["listPrice"] > 0
        assert e["priceStatus"] in ("observed", "estimated")
        if e["priceStatus"] == "estimated":
            assert e["method"] == "neutral-band-v1" and "Anchored" in e["priceNote"] or "anchored" in e["priceNote"]
        assert STORE.get(e["id"]).priceRef == e["id"]
