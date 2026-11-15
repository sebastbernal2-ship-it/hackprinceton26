"""tools/catalog_push.py against mongomock (no real database)."""
import json
import struct
import sys
from pathlib import Path

import mongomock
import mongomock.gridfs
import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT))
mongomock.gridfs.enable_gridfs_integration()

import catalog_push as cp  # noqa: E402
from assets.glb import extrude_glb  # noqa: E402
from assets.models import Asset  # noqa: E402
from assets.mongo_store import MongoStore  # noqa: E402
from test_assets import LIB, base  # noqa: E402

SECRET_FAKE = b'{"x": "mongodb+srv://user:pw@cluster0.example.mongodb.net"}'


@pytest.fixture
def d(tmp_path):
    src = tmp_path / "in"
    src.mkdir()
    (src / "Cafe_Counter.glb").write_bytes(extrude_glb([[0, 0], [2, 0], [2, 0.6], [0, 0.6], [0, 0]], 0.9))
    (src / "Cafe_Counter.png").write_bytes(b"\x89PNG....")
    (src / "scan.ply").write_bytes(b"ply\nformat ascii 1.0\nend_header\n")
    (src / "meta.json").write_text('{"note": "free-form metadata"}')
    return src


def test_draft_from_bbox_and_resume(d):
    db = mongomock.MongoClient()["t"]
    s = cp.run(d, "davd", False, 50, db)
    assert s["assets_created"] == 1 and s["uploaded"] == 4 and s["refused"] == 0
    doc = db["assets"].find_one({"profileId": "davd"})
    assert doc["dimsStatus"] == "estimated" and doc["provenance"]["origin"] == "mesh bounding box"
    assert (doc["dims"]["w"], doc["dims"]["d"], doc["dims"]["h"]) == (2.0, 0.6, 0.9)
    assert doc["imageRefs"][0].startswith("gridfs://") and doc["model"]["uri"].startswith("gridfs://")
    store = MongoStore(db)
    assert store.open_model(Asset.model_validate({k: v for k, v in doc.items() if k != "_id"})) is not None
    s2 = cp.run(d, "davd", False, 50, db)  # resume: nothing new
    assert s2["uploaded"] == 0 and s2["already_present"] == 4 and s2["assets_existing"] == 1 and db["assets"].count_documents({}) == 1


def test_dry_run_writes_nothing(d):
    db = mongomock.MongoClient()["t"]
    s = cp.run(d, None, True, 50, db)
    assert s["assets_created"] == 1 and db["assets"].count_documents({}) == 0 and db["models.files"].count_documents({}) == 0


def test_refusals(d):
    (d / ".env").write_text("MONGODB_URI=x")
    (d / "server.pem").write_text("k")
    (d / "notes.json").write_bytes(SECRET_FAKE)
    (d / "run.exe").write_bytes(b"MZ")
    (d / "big.glb").write_bytes(b"x" * (2 << 20))
    s = cp.run(d, None, True, 1, None)
    out = "\n".join(s["log"])
    for name in (".env", "server.pem", "notes.json", "run.exe", "big.glb"):
        assert f"REFUSED {name}" in out, out
    assert s["refused"] == 5


def test_asset_json_validated_and_model_linked(d):
    good = base(assetId="given", profileId=None, model={"uri": "elsewhere/Cafe_Counter.glb", "format": "glb"})
    (d / "given.json").write_text(json.dumps(good))
    (d / "bad.json").write_text(json.dumps(base(assetId="bad", dims=dict(w=-1, d=1, h=1))))
    db = mongomock.MongoClient()["t"]
    s = cp.run(d, "davd", False, 50, db)
    assert s["assets_invalid"] == 1 and s["assets_created"] == 1  # given links the glb, so no extra draft
    doc = db["assets"].find_one({"assetId": "given"})
    assert doc["model"]["uri"].startswith("gridfs://") and doc["profileId"] == "davd"


def test_cli_needs_env_and_never_echoes_uri(d, monkeypatch, capsys):
    monkeypatch.delenv("MONGODB_URI", raising=False)
    assert cp.main([str(d)]) == 2
    assert cp.main([str(d), "--dry-run"]) == 0  # dry run works offline
    monkeypatch.setenv("MONGODB_URI", "mongodb://u:SECRETPW@127.0.0.1:1/")
    rc = cp.main([str(d)])
    cap = capsys.readouterr()
    assert rc == 1 and "SECRETPW" not in cap.out + cap.err


def test_same_basename_in_different_folders_keeps_each_link(tmp_path):
    src = tmp_path / "in"
    for folder, depth in (("cafeA", 0.6), ("cafeB", 1.2)):
        (src / folder).mkdir(parents=True)
        (src / folder / "counter.glb").write_bytes(extrude_glb([[0, 0], [2, 0], [2, depth], [0, depth], [0, 0]], 0.9))
        (src / folder / "counter.png").write_bytes(b"\x89PNG" + folder.encode())
    # an asset JSON beside each mesh refers to it by bare name
    for folder in ("cafeA", "cafeB"):
        doc = base(assetId=f"counter_{folder.lower()}", profileId=None, source="uploaded")
        doc["model"] = {"uri": "counter.glb", "format": "glb"}
        doc["imageRefs"] = ["counter.png"]
        (src / folder / "counter.json").write_text(json.dumps(doc))
    (src / "extra").mkdir()
    (src / "extra" / "table.glb").write_bytes(extrude_glb([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]], 0.7))  # unreferenced mesh
    db = mongomock.MongoClient()["t"]
    s = cp.run(src, None, False, 50, db)
    a, b = db["assets"].find_one({"assetId": "counter_cafea"}), db["assets"].find_one({"assetId": "counter_cafeb"})
    assert a and b, s["log"]
    assert a["model"]["uri"] != b["model"]["uri"], "both assets were linked to the same mesh"
    assert a["imageRefs"] != b["imageRefs"], "both assets were linked to the same image"
    assert db["assets"].find_one({"assetId": "table"}), "the unreferenced mesh in another folder lost its draft"
    assert db["assets"].count_documents({}) == 3
