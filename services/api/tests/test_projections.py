import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.models import ProjectionCard

client = TestClient(app)
FIX = __import__("pathlib").Path(__file__).parent / "fixtures"
CIT = {"source": "s", "recordId": "r", "asOf": "2026-01", "geography": "g", "limitations": "l"}
BASE = dict(metric="rent", horizon="12m", scenario="base", method="m", point=2.0, lower=1.0, upper=3.0, status="estimated")


def mk(**kw):
    return ProjectionCard(**{**BASE, **kw})


def fitted(passed=True, **kw):
    v = [{"name": "mape", "value": 0.1, "threshold": 0.2, "passed": passed}]
    return mk(kind="fitted", trainingWindow={"start": "2015", "end": "2024", "geography": "g"}, validation=v, **kw)


def test_interval_order_enforced():
    for bad in (dict(lower=2.5), dict(upper=1.5), dict(point=9)):
        with pytest.raises(ValidationError):
            mk(kind="scenario", **bad)


def test_status_never_observed_and_unknown_has_no_numbers():
    with pytest.raises(ValidationError):
        mk(kind="scenario", status="observed")
    with pytest.raises(ValidationError):
        mk(kind="scenario", status="unknown")
    u = ProjectionCard(kind="scenario", status="unknown", metric="m", horizon="h", scenario="s", method="m")
    assert u.point is None


def test_published_requires_citation():
    with pytest.raises(ValidationError):
        mk(kind="published")
    assert mk(kind="published", citation=CIT).citation.source == "s"


def test_fitted_requires_window_and_validation():
    with pytest.raises(ValidationError):
        mk(kind="fitted", validation=[{"name": "a", "value": 1, "threshold": 1, "passed": True}])
    with pytest.raises(ValidationError):
        mk(kind="fitted", trainingWindow={"start": "a", "end": "b", "geography": "g"})


def test_failed_validation_is_hidden():
    assert fitted(passed=False).hidden is True
    assert fitted(passed=True).hidden is False


def test_method_required():
    with pytest.raises(ValidationError):
        mk(kind="scenario", method=" ")


def test_assess_stub_unknown_and_labelled():
    r = client.post("/api/assess", json={"assumptions": [{"key": "occupancy", "value": 0.8}]}).json()
    assert r["label"] == "scenario analysis, not a forecast"
    assert r["status"] == "unknown" and r["modelsAvailable"] is False  # no budget -> no P(over budget)
    assert r["pOverBudget"] is None and r["pOverBudgetBuildout"] is None
    assert [c["metric"] for c in r["projections"]] == ["build-out cost (p5/p50/p95)"]
    assert r["assumptions"][0]["key"] == "occupancy"


def test_projections_endpoint(monkeypatch):
    monkeypatch.setenv("COSTAR_NORMALIZED_DIR", str(FIX))
    r = client.get("/api/property/900001/projections").json()
    assert r["modelsAvailable"] is False
    assert len(r["projections"]) == 12  # 4 metrics x 3 horizons
    assert {c["horizon"] for c in r["projections"]} == {"12 months", "3-5 years", "2030"}
    assert len({c["metric"] for c in r["projections"]}) == 4
    for c in r["projections"]:
        assert c["kind"] == "scenario" and c["status"] == "estimated" and "demo estimate" in c["scenario"]
        assert c["lower"] <= c["point"] <= c["upper"] and "DEMO ESTIMATE" in c["method"]
    assert "not a forecast" in r["note"]
    assert client.get("/api/property/1/projections").status_code == 404
    monkeypatch.setenv("MODELS_AVAILABLE", "1")
    assert client.get("/api/health").json()["modelsAvailable"] is True
    assert client.get("/api/property/900001/projections").json()["modelsAvailable"] is True


def test_demo_cards_deterministic_and_differ_by_listing_and_size():
    from app.projections import demo_cards
    a = [c.model_dump() for c in demo_cards(5, 1200)]
    assert a == [c.model_dump() for c in demo_cards(5, 1200)]
    assert a != [c.model_dump() for c in demo_cards(6, 1200)]
    assert a != [c.model_dump() for c in demo_cards(5, 4000)]
    assert len(demo_cards(5, None)) == 12


def test_horizons_route_carries_demo_forecasts(monkeypatch):
    monkeypatch.setenv("COSTAR_NORMALIZED_DIR", str(FIX))
    r = client.get("/api/horizons/900001")
    assert r.status_code == 200
    j = r.json()
    assert len(j["demoForecasts"]) == 12 and "Demo" in j["demoForecastNote"]
