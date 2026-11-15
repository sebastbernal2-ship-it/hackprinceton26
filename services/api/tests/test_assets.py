import copy
import json
import math
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app import assets_routes
from app.main import app
from assets.glb import extrude_glb, parse_glb, triangulate
from assets.models import Asset, polygon_area
from assets.store import Store
from assets.variants import l_shape, make_variant, rect

LIB = Path(__file__).resolve().parents[3] / "assets" / "library"


def base(**kw):
    d = dict(assetId="t1", name="T", category="counter", source="library", dims=dict(w=2, d=1, h=1), dimsStatus="catalog",
             footprint=rect(2, 1), clearance=dict(front=1, sides=0, back=0), clearanceBasis="assumption: test",
             provenance=dict(origin="test"), dimRanges=dict(w=[1, 3], d=[1, 1], h=[1, 1]))
    d.update(kw)
    return d


def test_seed_library_validates_and_is_sparse():
    files = sorted(LIB.glob("*.json"))
    assert 14 <= len(files) <= 200
    for f in files:
        a = Asset.model_validate_json(f.read_text())
        assert a.clearanceBasis.startswith("ASSUMPTION") and a.dimsStatus in ("measured", "catalog", "estimated")
        full, area = a.dims.w * a.dims.d, polygon_area(a.footprint)
        if len(a.footprint) == 5:  # a rectangle fills its dims; L-shapes and rounded footprints fill 50 to 100 percent of the box
            assert area == pytest.approx(full, rel=1e-3)
        else:
            assert 0.5 * full <= area <= full * (1 + 1e-3)


@pytest.mark.parametrize("patch,msg", [
    ({"dims": dict(w=0, d=1, h=1)}, "> 0"),
    ({"dimRanges": dict(w=[2.5, 3], d=[1, 1], h=[1, 1])}, "bracket"),
    ({"dimsStatus": None}, "dimsStatus"),
    ({"dimsStatus": "guessed"}, "dimsStatus"),
    ({"source": "generated", "dimsStatus": "measured", "variantKind": "scaled", "parentAssetId": "p"}, "never 'measured'"),
    ({"footprint": [[0, 0], [2, 0], [2, 1], [0, 1]]}, "closed"),
    ({"footprint": [[0, 0], [2, 1], [2, 0], [0, 1], [0, 0]]}, "self-intersecting"),
    ({"priceRef": "made_up_item"}, "priceRef"),
    ({"variantKind": "corner_l"}, "parentAssetId"),
    ({"clearanceBasis": " "}, "clearanceBasis"),
    ({"unknown": 1}, "extra"),
])
def test_rejections(patch, msg):
    with pytest.raises(ValidationError) as e:
        Asset.model_validate(base(**patch))
    assert msg.lower() in str(e.value).lower()


def test_price_ref_ok_and_null():
    assert Asset.model_validate(base(priceRef="range_6_burner")).priceRef == "range_6_burner"
    assert Asset.model_validate(base()).priceRef is None


def test_l_shape_hand_computed():
    # arms: A 3 long x 1 deep, B 2 long x 0.5 deep => area = 3*1 + (2-1)*0.5 = 3.5; inside corner (0.5, 1)
    fp = l_shape(3, 2, 1, 0.5)
    assert fp == [[0, 0], [3, 0], [3, 1], [0.5, 1], [0.5, 2], [0, 2], [0, 0]]
    assert polygon_area(fp) == pytest.approx(3.5)
    with pytest.raises(ValueError):
        l_shape(0.4, 2, 1, 0.5)


def test_corner_variant_dims_and_validity():
    p = Asset.model_validate(base())
    v = make_variant(p, "corner_l", dict(armA=3, armB=2.5, depthA=0.8, depthB=0.7))
    assert v.parentAssetId == "t1" and v.variantKind == "corner_l" and v.source == "generated"
    assert (v.dims.w, v.dims.d, v.dims.h) == (3, 2.5, 1) and v.dimsStatus == "estimated" and v.priceRef is None
    # area = 3*0.8 + (2.5-0.8)*0.7 = 2.4 + 1.19
    assert polygon_area(v.footprint) == pytest.approx(3.59)


def test_island_mirrored_wall_run():
    p = Asset.model_validate(base(clearance=dict(front=1, sides=0.2, back=0.1)))
    isl = make_variant(p, "island")
    assert isl.clearance.front == isl.clearance.sides == isl.clearance.back == 1
    mir = make_variant(Asset.model_validate(base(footprint=l_shape(2, 1, 0.5, 0.5), dims=dict(w=2, d=1, h=1))), "mirrored")
    assert [list(q) for q in mir.footprint] == [[2, 0], [2, 1], [1.5, 1], [1.5, 0.5], [0, 0.5], [0, 0], [2, 0]]
    assert polygon_area(mir.footprint) == pytest.approx(0.5 * 2 + 0.5 * 0.5)  # positive area; same size as parent
    assert mir.dimsStatus == "catalog" and mir.dims.w == 2
    wr = make_variant(p, "wall_run", dict(length=2.75))
    assert wr.dims.w == 2.75 and polygon_area(wr.footprint) == pytest.approx(2.75)
    with pytest.raises(ValueError):
        make_variant(p, "wall_run", dict(length=3.5))


def test_restricted_scaling():
    sizes = [dict(w=0.6, d=0.6, h=0.75, label="a"), dict(w=0.75, d=0.75, h=0.75, label="b")]
    p = Asset.model_validate(base(dims=dict(w=0.6, d=0.6, h=0.75), footprint=rect(0.6, 0.6), allowedSizes=sizes, dimRanges=None))
    v = make_variant(p, "scaled", dict(w=0.75, d=0.75, h=0.75))
    assert polygon_area(v.footprint) == pytest.approx(0.5625)
    with pytest.raises(ValueError, match="allowedSizes"):
        make_variant(p, "scaled", dict(w=0.7, d=0.7, h=0.75))
    q = Asset.model_validate(base(dimRanges=None))
    with pytest.raises(ValueError, match="not permitted"):
        make_variant(q, "scaled", dict(w=2.5))
    r = Asset.model_validate(base())
    assert make_variant(r, "scaled", dict(w=2.5)).dims.w == 2.5
    with pytest.raises(ValueError, match="outside dimRanges"):
        make_variant(r, "scaled", dict(w=3.5))


def test_glb_valid_and_volume():
    fp = l_shape(3, 2, 1, 0.5)
    g = parse_glb(extrude_glb(fp, 0.9))
    j = g["json"]
    n = len(fp) - 1
    acc = j["accessors"]
    assert acc[0]["count"] == 2 * n and acc[0]["min"] == [0, 0, 0] and acc[0]["max"] == [3, 0.9, 2]
    assert acc[1]["count"] == 3 * ((n - 2) * 2 + 2 * n)  # top+bottom (n-2 tris each) + 2 tris per wall
    assert j["bufferViews"][0]["byteLength"] + j["bufferViews"][1]["byteLength"] == j["buffers"][0]["byteLength"] <= len(g["bin"])
    import struct
    pos = [struct.unpack_from("<3f", g["bin"], 12 * i) for i in range(acc[0]["count"])]
    idx = struct.unpack_from(f"<{acc[1]['count']}I", g["bin"], j["bufferViews"][1]["byteOffset"])
    assert max(idx) < len(pos)
    vol = 0.0  # signed volume via divergence theorem; positive and equal to area*height means outward winding
    for k in range(0, len(idx), 3):
        a, b, c = (pos[i] for i in idx[k:k + 3])
        vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6
    assert abs(vol) == pytest.approx(3.5 * 0.9, rel=1e-5)
    assert vol == pytest.approx(3.5 * 0.9, rel=1e-5), "triangles must wind outward in glTF (right-handed, Y-up)"


def test_triangulate_concave_area():
    ring = [(0, 0), (3, 0), (3, 1), (0.5, 1), (0.5, 2), (0, 2)]
    t = triangulate(ring)
    area = sum(abs((ring[b][0] - ring[a][0]) * (ring[c][1] - ring[a][1]) - (ring[b][1] - ring[a][1]) * (ring[c][0] - ring[a][0])) / 2 for a, b, c in t)
    assert area == pytest.approx(3.5)


@pytest.fixture
def client(tmp_path, monkeypatch):
    lib = tmp_path / "assets" / "library"
    lib.mkdir(parents=True)
    for f in LIB.glob("*.json"):
        (lib / f.name).write_text(f.read_text())
    monkeypatch.setattr(assets_routes, "STORE", Store(tmp_path / "assets"))
    return TestClient(app)


def test_profile_first_listing_and_category(client):
    n_lib = len(client.get("/api/assets").json())
    a = base(assetId="mine", profileId="pA", source="uploaded", category="sink", tags=["x"])
    assert client.post("/api/assets", json=a).status_code == 201
    assert client.post("/api/assets", json=a).status_code == 409
    other = base(assetId="theirs", profileId="pB")
    assert client.post("/api/assets", json=other).status_code == 201
    ids = [x["assetId"] for x in client.get("/api/assets?profileId=pA").json()]
    assert ids[0] == "mine" and len(ids) == n_lib + 1 and "theirs" not in ids
    assert "mine" not in [x["assetId"] for x in client.get("/api/assets").json()]
    cats = {x["category"] for x in client.get("/api/assets?profileId=pA&category=sink").json()}
    assert cats == {"sink"}
    assert client.get("/api/assets?profileId=../x").status_code == 422


def test_get_patch_and_validation(client):
    r = client.patch("/api/assets/sink_hand_17", json={"status": "draft", "tags": ["a"]})
    assert r.status_code == 200 and r.json()["tags"] == ["a"]
    assert client.patch("/api/assets/sink_hand_17", json={"priceRef": "nope"}).status_code == 422
    assert client.patch("/api/assets/sink_hand_17", json={"profileId": "z"}).status_code == 422
    assert client.get("/api/assets/nope").status_code == 404
    assert client.post("/api/assets", json=base(assetId="bad", dims=dict(w=-1, d=1, h=1))).status_code == 422


def test_variant_endpoint_writes_glb_and_profile_asset(client, tmp_path):
    r = client.post("/api/assets/counter_corner_96/variants", json={"kind": "corner_l", "params": {"armA": 2.4, "armB": 2.0}, "profileId": "pA"})
    assert r.status_code == 201, r.text
    v = r.json()
    assert v["parentAssetId"] == "counter_corner_96" and v["variantKind"] == "corner_l" and v["profileId"] == "pA"
    glb = tmp_path / v["model"]["uri"]
    assert glb.is_file() and parse_glb(glb.read_bytes())["json"]["asset"]["version"] == "2.0"
    assert client.get("/api/assets?profileId=pA").json()[0]["assetId"] == v["assetId"]
    bad = client.post("/api/assets/table_2top_30/variants", json={"kind": "scaled", "params": {"w": 0.7, "d": 0.7, "h": 0.762}})
    assert bad.status_code == 422
    assert client.post("/api/assets/nope/variants", json={"kind": "island"}).status_code == 404
    assert client.post("/api/assets/island_96x36/variants", json={"kind": "wall_run"}).status_code == 422


def test_variant_without_profile_never_writes_into_the_tracked_library(client, tmp_path):
    lib = tmp_path / "assets" / "library"
    before = sorted(p.relative_to(lib).as_posix() for p in lib.rglob("*") if p.is_file())
    r = client.post("/api/assets/counter_corner_96/variants", json={"kind": "corner_l", "params": {"armA": 2.4, "armB": 2.0}})
    assert r.status_code == 201, r.text
    v = r.json()
    after = sorted(p.relative_to(lib).as_posix() for p in lib.rglob("*") if p.is_file())
    assert before == after
    assert v["profileId"] == "scratch" and (tmp_path / v["model"]["uri"]).is_file()
    assert "assets/library" not in v["model"]["uri"]
