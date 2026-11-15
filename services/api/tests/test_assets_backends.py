"""The same HTTP flows against FileStore and a mongomock-backed MongoStore (no real database needed)."""
import json
import sys
from pathlib import Path

import mongomock
import mongomock.gridfs
import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
mongomock.gridfs.enable_gridfs_integration()

from app import assets_routes  # noqa: E402
from app.main import app  # noqa: E402
from assets import migrate  # noqa: E402
from assets.glb import extrude_glb, parse_glb  # noqa: E402
from assets.mongo_store import MongoStore  # noqa: E402
from assets.store import FileStore, get_store  # noqa: E402
from test_assets import LIB, base  # noqa: E402


def _seed_file_store(tmp_path):
    fs = FileStore(tmp_path / "assets")
    (fs.library / "models").mkdir(parents=True)
    for f in LIB.glob("*.json"):
        (fs.library / f.name).write_text(f.read_text())
    for f in (LIB / "models").glob("*.glb"):
        (fs.library / "models" / f.name).write_bytes(f.read_bytes())
    return fs


@pytest.fixture(params=["file", "mongo"])
def backend(request, tmp_path, monkeypatch):
    fs = _seed_file_store(tmp_path)
    if request.param == "file":
        store = fs
    else:
        store = MongoStore(mongomock.MongoClient()["t"])
        migrate.push(fs, store)
    monkeypatch.setattr(assets_routes, "STORE", store)
    return request.param, store, TestClient(app)


def test_listing_crud_and_validation(backend):
    _, _, client = backend
    n_lib = len(client.get("/api/assets").json())
    assert n_lib == len(list(LIB.glob("*.json")))
    a = base(assetId="mine", profileId="pA", source="uploaded", category="sink", tags=["x"])
    assert client.post("/api/assets", json=a).status_code == 201
    assert client.post("/api/assets", json=a).status_code == 409
    assert client.post("/api/assets", json=base(assetId="theirs", profileId="pB")).status_code == 201
    ids = [x["assetId"] for x in client.get("/api/assets?profileId=pA").json()]
    assert ids[0] == "mine" and len(ids) == n_lib + 1 and "theirs" not in ids
    assert "mine" not in [x["assetId"] for x in client.get("/api/assets").json()]
    assert {x["category"] for x in client.get("/api/assets?profileId=pA&category=sink").json()} == {"sink"}
    assert client.get("/api/assets?profileId=../x").status_code == 422
    r = client.patch("/api/assets/mine", json={"tags": ["a"], "status": "confirmed"})
    assert r.status_code == 200 and client.get("/api/assets/mine").json()["tags"] == ["a"]
    assert client.patch("/api/assets/mine", json={"profileId": "z"}).status_code == 422
    assert client.patch("/api/assets/mine", json={"priceRef": "nope"}).status_code == 422
    assert client.get("/api/assets/nope").status_code == 404
    assert client.get("/api/assets/..%2Fx").status_code in (404, 422)
    assert client.post("/api/assets", json=base(assetId="bad", dims=dict(w=-1, d=1, h=1))).status_code == 422


def test_model_download_library_asset(backend):
    kind, _, client = backend
    aid = next(a["assetId"] for a in client.get("/api/assets").json() if a.get("model") and a["model"]["format"] == "glb")
    r = client.get(f"/api/assets/{aid}/model")
    assert r.status_code == 200 and r.headers["content-type"] == "model/gltf-binary"
    assert parse_glb(r.content)["json"]["asset"]["version"] == "2.0"
    if kind == "mongo":
        assert client.get(f"/api/assets/{aid}").json()["model"]["uri"].startswith("gridfs://")


def test_variant_model_roundtrip_and_no_model(backend):
    _, _, client = backend
    r = client.post("/api/assets/counter_corner_96/variants", json={"kind": "corner_l", "params": {"armA": 2.4, "armB": 2.0}, "profileId": "pA"})
    assert r.status_code == 201, r.text
    v = r.json()
    assert v["profileId"] == "pA" and client.get("/api/assets?profileId=pA").json()[0]["assetId"] == v["assetId"]
    m = client.get(f"/api/assets/{v['assetId']}/model")
    assert m.status_code == 200 and m.content[:4] == b"glTF"
    boxed = base(assetId="nobox", profileId="pA")
    assert client.post("/api/assets", json=boxed).status_code == 201
    assert client.get("/api/assets/nobox/model").status_code == 404
    assert client.get("/api/assets/nope/model").status_code == 404


def test_model_download_is_path_safe(backend):
    kind, store, client = backend
    evil = base(assetId="evil", profileId="pA", model={"uri": "../../../../etc/passwd", "format": "glb"})
    assert client.post("/api/assets", json=evil).status_code == 201
    assert client.get("/api/assets/evil/model").status_code == 404
    evil2 = base(assetId="evil2", profileId="pA", model={"uri": "assets/library/../../secret.glb", "format": "glb"})
    client.post("/api/assets", json=evil2)
    assert client.get("/api/assets/evil2/model").status_code == 404
    if kind == "mongo":
        bad = base(assetId="evil3", profileId="pA", model={"uri": "gridfs://" + "0" * 64 + "/x.glb", "format": "glb"})
        client.post("/api/assets", json=bad)
        assert client.get("/api/assets/evil3/model").status_code == 404


def test_mongo_indexes_and_idempotent_migrate(tmp_path):
    fs = _seed_file_store(tmp_path)
    store = MongoStore(mongomock.MongoClient()["t"])
    pa = base(assetId="mine", profileId="pA")
    from assets.models import Asset
    fs.save(Asset.model_validate(pa))
    dry = migrate.push(fs, store, dry_run=True)
    assert store.col.count_documents({}) == 0 and dry["assets"] == len(list(LIB.glob("*.json"))) + 1
    first = migrate.push(fs, store)
    second = migrate.push(fs, store)
    assert first == second and store.col.count_documents({}) == first["assets"] and first["profile"] == 1
    assert store.db["models.files"].count_documents({}) <= first["models_uploaded"]
    idx = store.col.index_information()
    assert any(v.get("unique") and v["key"] == [("assetId", 1)] for v in idx.values())
    assert any(v["key"] == [("profileId", 1)] for v in idx.values())
    out = tmp_path / "bk" / "assets"
    exp = migrate.pull(store, out)
    assert exp["assets"] == first["assets"] and exp["models_missing"] == 0
    back = FileStore(out)
    assert len(back.list("pA")) == first["assets"] and back.get("mine", "pA") is not None
    blob = back.open_model(back.list()[0])
    assert blob and b"".join(blob.chunks)[:4] == b"glTF"


def test_migrate_cli_needs_env_and_never_prints_uri(tmp_path, monkeypatch, capsys):
    monkeypatch.delenv("MONGODB_URI", raising=False)
    assert migrate.main(["--to", "mongo"]) == 2
    fs = _seed_file_store(tmp_path)
    store = MongoStore(mongomock.MongoClient()["t"])
    assert migrate.main(["--to", "mongo", "--dry-run"], fs, store) == 0
    assert "dry run" in capsys.readouterr().out


def test_get_store_selects_backend_by_env(monkeypatch):
    monkeypatch.delenv("MONGODB_URI", raising=False)
    assert isinstance(get_store(), FileStore)
    monkeypatch.setenv("MONGODB_URI", "mongodb://localhost:1/")
    assert isinstance(get_store(), MongoStore)  # lazy client: no connection until first use
