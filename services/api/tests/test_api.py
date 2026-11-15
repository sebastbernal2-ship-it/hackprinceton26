import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import FactorCard
from app.readiness import evidence_readiness
from export_schemas import OUT, schemas

FIX = Path(__file__).parent / "fixtures"
client = TestClient(app)


@pytest.fixture
def data(monkeypatch):
    monkeypatch.setenv("COSTAR_NORMALIZED_DIR", str(FIX))


@pytest.fixture
def nodata(monkeypatch, tmp_path):
    monkeypatch.setenv("COSTAR_NORMALIZED_DIR", str(tmp_path))


def card(status):
    return FactorCard(factorId="f", status=status, value="", unit="", source="", recordId="", asOf="", geography="", limitations="")


def test_readiness_counts_observed_and_derived():
    assert evidence_readiness([]) == 0
    assert evidence_readiness([card("unknown"), card("estimated"), card("derived")]) == 33
    assert evidence_readiness([card("observed"), card("unknown")]) == 50
    assert evidence_readiness([card("observed")]) == 100


def test_health_and_missing_data(nodata):
    assert client.get("/api/health").json() == {"status": "ok", "dataAvailable": False, "modelsAvailable": False}
    r = client.post("/api/matches", json={"brief": []}).json()
    assert r["dataAvailable"] is False and r["matches"] == []
    assert client.get("/api/property/900001").status_code == 404


def test_matches_from_fixtures(data):
    r = client.post("/api/matches", json={"brief": []}).json()
    assert r["dataAvailable"] is True
    m = {x["listingId"]: x for x in r["matches"]}
    assert m[900001]["squareFeet"] == 2500 and m[900001]["tourId"] == "MODEL123"
    assert m[900001]["evidenceReadiness"] == 33  # 2 of 6: 4 fixture cards + 2 labelled estimated demo stream cards
    assert m[900002]["squareFeet"] == 1800 and m[900002]["tourId"] == ""
    assert m[900002]["rentPerSquareFootYear"] is None
    assert "confidence" not in m[900001]
    unknown = [f for f in m[900001]["factors"] if f["factorId"] == "crime_safety"][0]
    assert unknown["status"] == "unknown" and unknown["limitations"] == "not loaded"


def test_brief_city_filter(data):
    r = client.post("/api/matches", json={"brief": [{"question": "q", "answer": "in Shelbyville please"}]}).json()
    assert [x["listingId"] for x in r["matches"]] == [900002]


def test_property(data):
    assert client.get("/api/property/900001").json()["address"] == "1 Example St"
    assert client.get("/api/property/1").status_code == 404


def test_next_question_stub():
    r = client.post("/api/next-question", json={"history": []}).json()
    assert r["stub"] is True and r["question"]
    full = [{"question": f"q{i}", "answer": "a"} for i in range(3)]
    assert client.post("/api/next-question", json={"history": full}).json()["question"] is None


def test_tour_agent_stub():
    r = client.post("/api/tour-agent", json={"message": "add a table", "placedCount": 0, "tourId": "x"}).json()
    assert r["stub"] is True and r["action"] == {"type": "add", "kind": "table", "label": "Dining table"}
    r = client.post("/api/tour-agent", json={"message": "move it left 2 meters", "placedCount": 1, "tourId": "x"}).json()
    assert r["action"] == {"type": "move", "direction": "left", "meters": 2.0}


def _normalize(node):
    """Drop the redundant `additionalProperties: true` (the JSON Schema default) that some pydantic versions emit."""
    if isinstance(node, dict):
        return {k: _normalize(v) for k, v in node.items() if not (k == "additionalProperties" and v is True)}
    if isinstance(node, list):
        return [_normalize(v) for v in node]
    return node


def test_schemas_committed_and_current():
    for name, s in schemas().items():
        assert _normalize(json.loads((OUT / name).read_text())) == _normalize(s)
