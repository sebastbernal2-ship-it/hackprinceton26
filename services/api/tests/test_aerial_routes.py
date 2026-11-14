import json
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_aerial_found_and_unknowns_stay_unknown(tmp_path, monkeypatch):
    rec = {"listingId": 1, "vehicles": {"status": "estimated", "low": 2, "expected": 8, "high": 14},
           "rooftop_units": {"status": "unknown", "value": None}}
    (tmp_path / "1.json").write_text(json.dumps(rec))
    monkeypatch.setenv("AERIAL_DIR", str(tmp_path))
    r = client.get("/api/aerial/1")
    assert r.status_code == 200
    body = r.json()
    assert body["vehicles"]["low"] <= body["vehicles"]["expected"] <= body["vehicles"]["high"]
    assert body["rooftop_units"]["value"] is None and body["rooftop_units"]["status"] == "unknown"


def test_aerial_missing_is_404_not_zero(tmp_path, monkeypatch):
    monkeypatch.setenv("AERIAL_DIR", str(tmp_path))
    assert client.get("/api/aerial/999").status_code == 404
