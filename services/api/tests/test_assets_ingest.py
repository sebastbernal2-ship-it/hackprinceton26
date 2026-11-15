import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from app import assets_ingest_routes as routes  # noqa: E402
from app import assets_routes as catalog_routes  # noqa: E402
from app.main import app  # noqa: E402
from assets.ingest import from_scan, identify as ident  # noqa: E402
from assets.ingest.__main__ import main as cli_main  # noqa: E402
from assets.store import Store  # noqa: E402

client = TestClient(app)
JPG = b"\xff\xd8\xff\xe0fake"
GOOD = json.dumps([
    {"name": "Steel counter", "category": "counter", "dims_m": {"w": 1.8, "d": 0.7, "h": 0.9}, "confidence": 0.7,
     "style_tags": ["brushed steel"], "box_2d": [10, 20, 500, 600], "notes": "n"},
    {"name": "Odd thing", "category": "spaceship", "dims_m": {"w": -1, "d": "x", "h": None}, "confidence": 9}])


class Fake:
    def __init__(self, text=GOOD, boom=False):
        self.text, self.boom, self.calls = text, boom, []

    def identify(self, images, system, user_text):
        if self.boom:
            raise RuntimeError("api down")
        self.calls.append((len(images), user_text))
        return self.text


def img(tmp_path, name="a.jpg"):
    p = tmp_path / name
    p.write_bytes(JPG)
    return p


def test_live_proposals_are_draft_estimated(tmp_path):
    r = ident.identify([img(tmp_path)], Fake(), "prof1", reference_scale="door 2.03 m")
    assert r["mode"] == "live"
    a, b = r["proposals"]
    assert a["status"] == b["status"] == "draft" and a["dimsStatus"] == "estimated"
    assert a["category"] == "counter" and a["profileId"] == "prof1" and a["priceRef"] is None
    assert "reference scale" in a["provenance"]["notes"] and a["provenance"]["box_2d"] == [10, 20, 500, 600]
    assert b["category"] == "other" and b["dims"] == {"w": 0.0, "d": 0.0, "h": 0.0}
    assert b["provenance"]["confidence"] is None  # out-of-range confidence dropped


def test_explicit_measurement_only_for_single_item(tmp_path):
    one = json.dumps([json.loads(GOOD)[0]])
    r = ident.identify([img(tmp_path)], Fake(one), measured={"w": 2.0, "d": 0.6, "h": 0.85})
    a = r["proposals"][0]
    assert a["dimsStatus"] == "measured" and a["dims"]["w"] == 2.0 and "User-stated" in a["provenance"]["notes"]
    r2 = ident.identify([img(tmp_path)], Fake(), measured={"w": 2.0, "d": 0.6, "h": 0.85})
    assert all(p["dimsStatus"] == "estimated" for p in r2["proposals"])


@pytest.mark.parametrize("client_, imgs", [(None, True), (Fake(), False), (Fake(boom=True), True)])
def test_fixture_fallbacks_labelled(tmp_path, client_, imgs):
    r = ident.identify([img(tmp_path)] if imgs else [], client_)
    assert r["mode"] == "fixture" and r["notice"].startswith("SAMPLE DATA")
    assert all("sample" in p["tags"] and p["status"] == "draft" for p in r["proposals"])


def test_garbage_model_output_gives_no_proposals(tmp_path):
    r = ident.identify([img(tmp_path)], Fake("not json"))
    assert r["mode"] == "live" and r["proposals"] == []


def objects():
    return {"objects": [
        {"id": 1, "label": "kitchen counter", "source": "pano", "box": {"centre": [0, 0, 0.45], "size_lwh_m": [2.0, 0.7, 0.9], "yaw_deg": 30}},
        {"id": 2, "label": None, "box": {"size_lwh_m": [0.5, 0.5, 0.5]}},
        {"id": 3, "label": "chair", "box": {"size_lwh_m": [0.5, 0, 0.9]}},
        {"id": 4, "label": "chair", "box": {"size_lwh_m": [float("nan"), 1, 1]}},
        "junk"]}


def test_from_scan():
    r = from_scan.assets_from_objects(objects(), "p9", "roomA")
    a, b = r["assets"]
    assert a["category"] == "counter" and a["dims"] == {"w": 2.0, "d": 0.7, "h": 0.9}
    assert a["source"] == "extracted" and a["dimsStatus"] == "estimated" and a["status"] == "draft"
    assert "Estimated from reconstruction" in a["provenance"]["notes"] and a["profileId"] == "p9"
    assert b["category"] == "other" and "Unlabelled" in b["name"]
    assert [s[0] for s in r["skipped"]] == [3, 4, 4]
    with pytest.raises(ValueError):
        from_scan.assets_from_objects({"nope": 1})


def test_cli_scan_and_fixture(tmp_path, capsys):
    f = tmp_path / "objects.json"
    f.write_text(json.dumps(objects()))
    assert cli_main(["--scan", str(f), "--profile", "x"]) == 0
    out = json.loads(capsys.readouterr().out)
    assert len(out["proposals"]) == 2 and out["scanSkipped"]


@pytest.fixture
def api(monkeypatch, tmp_path):
    monkeypatch.setattr(routes, "UPLOAD_DIR", tmp_path / "up")
    fake = Fake()
    monkeypatch.setattr(routes, "get_client", lambda: fake)
    return fake


def test_api_ingest_ok(api, tmp_path):
    r = client.post("/api/assets/ingest", files=[("image", ("../../evil.jpg", JPG, "image/jpeg"))],
                    data={"profileId": "chainA", "referenceScale": "door 2 m"})
    assert r.status_code == 200
    j = r.json()
    assert j["mode"] == "live" and j["proposals"][0]["profileId"] == "chainA" and api.calls[0][0] == 1
    stored = list((tmp_path / "up").rglob("*"))
    assert not any(p.is_file() for p in stored)
    assert j["proposals"][0]["imageRefs"] == []
    assert not any("evil" in p.name for p in stored)


def test_api_live_proposal_can_be_confirmed_and_loaded_from_profile(api, monkeypatch, tmp_path):
    monkeypatch.setattr(catalog_routes, "STORE", Store(tmp_path / "assets"))
    response = client.post(
        "/api/assets/ingest",
        files=[("image", ("machine.jpg", JPG, "image/jpeg"))],
        data={"profileId": "cafe-demo"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "live" and body["proposals"]
    proposal = body["proposals"][0]
    saved = client.post("/api/assets", json={**proposal, "status": "confirmed"})
    assert saved.status_code == 201, saved.text
    assert saved.json()["status"] == "confirmed"
    assert saved.json()["profileId"] == "cafe-demo"
    listed = client.get("/api/assets?profileId=cafe-demo")
    assert listed.status_code == 200
    assert any(asset["assetId"] == proposal["assetId"] for asset in listed.json())


def test_api_requires_image_and_labels_no_key_fixture(monkeypatch, tmp_path):
    monkeypatch.setattr(routes, "UPLOAD_DIR", tmp_path / "up")
    monkeypatch.setattr(routes, "get_client", lambda: None)
    empty = client.post("/api/assets/ingest", data={"profileId": "p"})
    assert empty.status_code == 422 and "at least one image" in empty.json()["detail"]
    response = client.post("/api/assets/ingest", files=[("image", ("a.jpg", JPG, "image/jpeg"))], data={"profileId": "p"})
    assert response.status_code == 200
    j = response.json()
    assert j["mode"] == "fixture" and j["notice"].startswith("SAMPLE DATA")
    assert all("sample" in p["tags"] and p["imageRefs"] == [] for p in j["proposals"])
    assert not any(p.is_file() for p in (tmp_path / "up").rglob("*"))


def test_api_rejects(api, monkeypatch):
    post = lambda files, **d: client.post("/api/assets/ingest", files=files, data=d)  # noqa: E731
    assert post([("image", ("a.gif", JPG, "image/gif"))]).status_code == 415
    assert post([("image", ("a.jpg", b"GIF89a....", "image/jpeg"))]).status_code == 415
    assert post([("image", ("a.jpg", JPG * 1, "image/jpeg"))] * 7).status_code == 422
    monkeypatch.setattr(ident, "MAX_IMAGE_BYTES", 10)
    assert post([("image", ("a.jpg", JPG + b"x" * 20, "image/jpeg"))]).status_code == 413
    assert post([("image", ("a.jpg", JPG, "image/jpeg"))], measuredW="abc").status_code == 422
    assert not any(p.is_file() for p in (Path(routes.UPLOAD_DIR)).rglob("*"))


def test_api_cleans_temporary_images_when_identification_fails(api, monkeypatch, tmp_path):
    def fail(*args, **kwargs):
        raise RuntimeError("unexpected identify failure")

    monkeypatch.setattr(routes, "UPLOAD_DIR", tmp_path / "up")
    monkeypatch.setattr(ident, "identify", fail)
    with pytest.raises(RuntimeError, match="unexpected identify failure"):
        client.post("/api/assets/ingest", files=[("image", ("a.jpg", JPG, "image/jpeg"))])
    assert not any(p.is_file() for p in (tmp_path / "up").rglob("*"))


def test_api_rejects_bad_later_image_without_partial_temp_files(api, tmp_path):
    response = client.post("/api/assets/ingest", files=[
        ("image", ("first.jpg", JPG, "image/jpeg")),
        ("image", ("second.jpg", b"GIF89a....", "image/jpeg")),
    ])
    assert response.status_code == 415
    assert not any(p.is_file() for p in (tmp_path / "up").rglob("*"))
