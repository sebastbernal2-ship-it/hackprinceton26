from fastapi.testclient import TestClient

from app import assets_routes
from app.main import app

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 16
client = TestClient(app)


def first_id():
    return client.get("/api/assets").json()[0]["assetId"]


def test_thumb_served_with_cache_headers(tmp_path, monkeypatch):
    monkeypatch.setenv("ASSET_THUMB_DIR", str(tmp_path))
    aid = first_id()
    (tmp_path / f"{aid}.png").write_bytes(PNG)
    r = client.get(f"/api/assets/{aid}/thumb")
    assert r.status_code == 200 and r.content == PNG
    assert r.headers["content-type"] == "image/png" and "max-age" in r.headers["cache-control"]


def test_thumb_missing_and_unknown_are_404(tmp_path, monkeypatch):
    monkeypatch.setenv("ASSET_THUMB_DIR", str(tmp_path))
    assert client.get(f"/api/assets/{first_id()}/thumb").status_code == 404
    assert client.get("/api/assets/no-such-asset/thumb").status_code == 404


def test_thumb_rejects_path_traversal(tmp_path, monkeypatch):
    monkeypatch.setenv("ASSET_THUMB_DIR", str(tmp_path))
    assert client.get("/api/assets/..%2F..%2Fx/thumb").status_code in (404, 422)
