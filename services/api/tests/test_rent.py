import json

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

PRED = {"listingId": 1, "metro": "houston", "status": "estimated", "label": "x", "expectedRentPerSfYear": 20.0, "lower80": 14.0,
        "upper80": 28.0, "askingRentPerSfYear": 35.0, "flag": "above", "expectationSource": "spatial out-of-fold",
        "contributions": [{"feature": "submarket", "effectPct": 12.0}], "method": "ridge test",
        "trainingWindow": {"start": "2020-01-01", "end": "2026-01-01", "geography": "houston"},
        "validation": [{"name": "m", "value": 0.3, "threshold": 0.35, "passed": True}]}
UNK = {"listingId": 2, "metro": "houston", "status": "unknown", "reason": "retail segment failed or is too thin", "label": "x"}
REPORT = {"n_rated": 5, "gate_definition": "g", "segments": {"houston/all": {
    "n_segment": 5, "gate": {"passed": True}, "spatial": {"model": {"n": 5}, "submarket_median": {}, "metro_median": {}},
    "temporal": {"model": {"n": 2}, "submarket_median": {}, "metro_median": {}}}}}


@pytest.fixture
def art(tmp_path, monkeypatch):
    monkeypatch.setenv("RENT_ARTIFACT_DIR", str(tmp_path))
    (tmp_path / "predictions.json").write_text(json.dumps({"1": PRED, "2": UNK}))
    (tmp_path / "report.json").write_text(json.dumps(REPORT))
    return tmp_path


def test_estimated_card_has_interval_and_contract(art):
    r = client.get("/api/rent/1").json()
    c = r["card"]
    assert c["status"] == "estimated" and c["kind"] == "fitted" and c["lower"] < c["point"] < c["upper"]
    assert c["trainingWindow"] and c["validation"] and not c["hidden"]
    assert r["flag"] == "above" and "estimate" in r["label"] and r["contributions"]


def test_failed_segment_and_missing_listing_are_unknown_not_zero(art):
    for lid in (2, 999):
        r = client.get(f"/api/rent/{lid}").json()
        assert r["card"]["status"] == "unknown" and r["card"]["point"] is None and r["flag"] == "unknown"


def test_missing_artifacts_unknown(tmp_path, monkeypatch):
    monkeypatch.setenv("RENT_ARTIFACT_DIR", str(tmp_path))
    assert client.get("/api/rent/1").json()["card"]["status"] == "unknown"
    assert client.get("/api/rent/summary").json()["status"] == "unknown"


def test_summary(art):
    s = client.get("/api/rent/summary").json()
    assert s["flagCounts"] == {"above": 1} and s["nEmitted"] == 1 and s["segments"]["houston/all"]["gatePassed"] is True
