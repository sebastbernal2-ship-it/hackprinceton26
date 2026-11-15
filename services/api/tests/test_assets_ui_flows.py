"""UI-driven flows against the REAL routers (no mock API): ingest -> confirm, variant -> confirm, per-kind params.

UI_PARAMS mirrors what foreground/app/lib/variant-params.ts produces for the default controls on counter_prep_72.
"""
import io
import struct
import zlib

import pytest
from fastapi.testclient import TestClient

from app import assets_ingest_routes, assets_routes
from app.main import app
from assets.store import Store
from test_assets import LIB  # noqa: F401  (reuse library location)

PARENT = "counter_prep_72"  # w 1.8288 d 0.762, dimRanges on w/d/h, no allowedSizes
UI_PARAMS = {
    "corner_l": {"armA": 2.0, "armB": 1.8, "depthA": 0.762, "depthB": 0.762},
    "island": {},
    "wall_run": {"length": 2.4},
    "scaled": {"w": 2.0, "d": 0.762, "h": 0.9144},
    "mirrored": {},
}


def _png() -> bytes:
    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(b"\x00\xff\x00\x00")) + chunk(b"IEND", b""))


class _LiveStub:
    """Stands in for a vision provider (samples from fixture mode can never be saved, so flows use a 'live' answer)."""
    def identify(self, images, system, user_text):
        return ('[{"name": "Steel counter", "category": "counter", "dims_m": {"w": 1.8, "d": 0.7, "h": 0.9}, '
                '"confidence": 0.6}, {"name": "Prep table", "category": "prep_table", "dims_m": {"w": 1.2, "d": 0.6, "h": 0.9}}]')


@pytest.fixture
def client(tmp_path, monkeypatch):
    lib = tmp_path / "assets" / "library"
    lib.mkdir(parents=True)
    for f in LIB.glob("*.json"):
        (lib / f.name).write_text(f.read_text())
    monkeypatch.setattr(assets_routes, "STORE", Store(tmp_path / "assets"))
    monkeypatch.setattr(assets_ingest_routes, "UPLOAD_DIR", tmp_path / "up")
    monkeypatch.setattr(assets_ingest_routes, "get_client", lambda: _LiveStub())  # canned provider answer, no network
    return TestClient(app)


def _ingest(client):
    r = client.post("/api/assets/ingest", files=[("image", ("a.png", _png(), "image/png"))], data={"profileId": "pA"})
    assert r.status_code == 200, r.text
    assert r.json()["mode"] == "live"
    return r.json()["proposals"]


def test_ingest_proposals_are_closed_rings(client):
    for p in _ingest(client):
        assert p["footprint"][0] == p["footprint"][-1]


def test_confirm_ingest_proposal_returns_201(client):
    p = _ingest(client)[0]
    r = client.post("/api/assets", json={**p, "status": "confirmed", "profileId": "pA"})
    assert r.status_code == 201, r.text
    assert r.json()["status"] == "confirmed"


def test_edited_proposal_with_closed_regenerated_ring_saves(client):
    p = _ingest(client)[0]
    w, d = 2.0, 0.8
    p["dims"] = {**p["dims"], "w": w, "d": d}
    p["footprint"] = [[0, 0], [w, 0], [w, d], [0, d], [0, 0]]
    assert client.post("/api/assets", json={**p, "status": "confirmed"}).status_code == 201


def test_variant_then_patch_confirm_lists_it(client):
    r = client.post(f"/api/assets/{PARENT}/variants", json={"kind": "wall_run", "params": UI_PARAMS["wall_run"], "profileId": "pA"})
    assert r.status_code == 201, r.text
    v = r.json()
    assert v["status"] == "draft"
    # The variant endpoint already saved it: creating again must conflict, so the UI has to PATCH instead.
    assert client.post("/api/assets", json=v).status_code == 409
    r = client.patch(f"/api/assets/{v['assetId']}", json={"status": "confirmed"})
    assert r.status_code == 200 and r.json()["status"] == "confirmed"
    listed = {a["assetId"]: a for a in client.get("/api/assets?profileId=pA").json()}
    assert listed[v["assetId"]]["status"] == "confirmed"


@pytest.mark.parametrize("kind", list(UI_PARAMS))
def test_every_kind_succeeds_with_ui_params(client, kind):
    r = client.post(f"/api/assets/{PARENT}/variants", json={"kind": kind, "params": UI_PARAMS[kind], "profileId": "pA"})
    assert r.status_code == 201, r.text
    assert r.json()["variantKind"] == kind


def test_e2e_catalog_variants_confirm_ingest_save(client):
    assert any(a["assetId"] == PARENT for a in client.get("/api/assets").json())
    made = []
    for kind, params in UI_PARAMS.items():
        r = client.post(f"/api/assets/{PARENT}/variants", json={"kind": kind, "params": params, "profileId": "pA"})
        assert r.status_code == 201, (kind, r.text)
        made.append(r.json()["assetId"])
        c = client.patch(f"/api/assets/{made[-1]}", json={"status": "confirmed"})
        assert c.status_code == 200 and c.json()["status"] == "confirmed", (kind, c.text)
    listed = {a["assetId"]: a["status"] for a in client.get("/api/assets?profileId=pA").json()}
    assert all(listed[i] == "confirmed" for i in made)
    p = _ingest(client)[0]
    w, d = 1.1, 0.6
    p["dims"] = {**p["dims"], "w": w, "d": d}
    p["footprint"] = [[0, 0], [w, 0], [w, d], [0, d], [0, 0]]
    r = client.post("/api/assets", json={**p, "status": "confirmed", "profileId": "pA"})
    assert r.status_code == 201, r.text
    print("E2E OK: variants", len(made), "confirmed; ingested asset", r.json()["assetId"], "saved 201")
