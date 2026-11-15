import io
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from app import reference_media_routes as R  # noqa: E402
from app.main import app  # noqa: E402

client = TestClient(app)
JPG = b"\xff\xd8\xff\xe0" + b"0" * 64
MP4 = b"\x00\x00\x00\x18ftypmp42" + b"0" * 64


@pytest.fixture
def root(tmp_path, monkeypatch):
    monkeypatch.setenv("REFERENCE_MEDIA_DIR", str(tmp_path))
    return tmp_path


def test_saves_photos_and_video_with_server_generated_names(root):
    r = client.post("/api/reference-media", data={"profileId": "cafe-demo"},
                    files=[("files", ("../../evil.jpg", JPG, "image/jpeg")), ("files", ("tour.mp4", MP4, "video/mp4"))])
    assert r.status_code == 200, r.text
    saved = r.json()["saved"]
    assert [s["kind"] for s in saved] == ["image", "video"]
    on_disk = sorted(p.name for p in (root / "cafe-demo").iterdir())
    assert len(on_disk) == 2 and not any("evil" in n or ".." in n for n in on_disk)
    assert all((root / "cafe-demo") in p.parents for p in (root / "cafe-demo").iterdir())


def test_listing_returns_what_was_saved_for_that_profile_only(root):
    client.post("/api/reference-media", data={"profileId": "a"}, files=[("files", ("x.jpg", JPG, "image/jpeg"))])
    client.post("/api/reference-media", data={"profileId": "b"}, files=[("files", ("y.jpg", JPG, "image/jpeg"))])
    got = client.get("/api/reference-media", params={"profileId": "a"}).json()["files"]
    assert len(got) == 1 and got[0]["kind"] == "image"


def test_rejects_wrong_type_bad_magic_bad_profile_and_empty(root):
    assert client.post("/api/reference-media", data={"profileId": "p"}, files=[("files", ("a.exe", b"MZ", "application/octet-stream"))]).status_code == 415
    assert client.post("/api/reference-media", data={"profileId": "p"}, files=[("files", ("a.jpg", b"not an image", "image/jpeg"))]).status_code == 415
    assert client.post("/api/reference-media", data={"profileId": "../x"}, files=[("files", ("a.jpg", JPG, "image/jpeg"))]).status_code == 422
    assert client.post("/api/reference-media", data={"profileId": "p"}).status_code == 422
    assert not list(root.rglob("*.jpg"))  # nothing partial left behind


def test_oversize_file_is_refused_and_not_kept(root, monkeypatch):
    monkeypatch.setattr(R, "MAX_IMAGE_BYTES", 100)
    r = client.post("/api/reference-media", data={"profileId": "p"}, files=[("files", ("a.jpg", JPG + b"1" * 200, "image/jpeg"))])
    assert r.status_code == 413
    assert not [p for p in root.rglob("*") if p.is_file()]
